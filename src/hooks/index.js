import path from 'node:path'
import { loadModePrompt } from '../agents/prompts.js'
import { canDelegate, writeScopes } from '../agents/registry.js'
import { restrictionFor, filterRestriction, pathAllowedFor } from '../agents/policies.js'
import { chainFor } from '../core/config.js'
import { userMessage } from '../core/message.js'
import { isInside } from '../core/paths.js'
import { readTextSafe } from '../core/atomic.js'
import { readBoulderSlot } from '../state/boulder.js'
import { planSince, readPlan, validatePlanFormat } from '../state/plan.js'
import { TaskStore } from '../state/tasks.js'
import { bumpContinuation } from '../state/modes.js'
import { loadRules, makeRulesSection } from './rules.js'
import { detectMode } from './keyword.js'
import { continuationDecision } from './continuation.js'
import { extractWrittenText, findCommentSlop, formatSlopWarning } from './comment.js'
import {
  baselineGateReason,
  isDeliverableFile,
  isVerificationCommand,
  planGateReason,
  resultFailed,
} from './ultrawork.js'

const CONTINUABLE_MODES = new Set(['ultrawork', 'team', 'hyperplan', 'hyperplan-ulw'])

/**
 * Every tool name that runs a shell command. The verification tally below has to
 * recognise all of them, or the baseline gate can never be satisfied on a host
 * that names its shell tool something other than `bash` (DSH ships the
 * namespaced `ops_bash` / `ops_pwsh` tools).
 */
const SHELL_TOOL_NAMES = new Set(['pwsh', 'bash', 'shell', 'sh', 'zsh', 'ops_bash', 'ops_pwsh'])

/** A DSH model selection object for one resolved chain step. */
function selectionFor(step) {
  const selection = { provider: step.provider, model: step.model }
  if (typeof step.reasoningEffort === 'string' && step.reasoningEffort) selection.reasoningEffort = step.reasoningEffort
  return selection
}

/** Whether this Agent was created by a delegation (so its creation route is explicit). */
function isDelegatedAgent(agent) {
  const header = agent?.session?.header
  return Boolean(header && (header.origin === 'subagent' || header.parentSession != null))
}

/** The model-fallback continuation text the model reads on the next turn. */
function fallbackText(step, failure) {
  const route = `${step.provider}/${step.model}`
  const code = failure?.code ? ` (${failure.code})` : ''
  return `[OMD model fallback] The previous model request failed${code}. Continue the same task on the fallback model ${route}. Do not restart work that is already complete; resume from the last verified state.`
}

function isAbortFailure(failure) {
  return failure?.code === 'ABORTED'
}

function visibleToolNames(agent) {
  try {
    return (agent.ctx.tools.schemas(agent) ?? []).map((schema) => schema.name)
  } catch {
    try {
      return (agent.ctx.tools.schemas() ?? []).map((schema) => schema.name)
    } catch {
      return []
    }
  }
}

function isPlanPath(workspace, file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(workspace, file)
  return isInside(path.join(workspace, '.omd', 'plans'), absolute)
}

function isNotepadPath(workspace, file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(workspace, file)
  return isInside(path.join(workspace, '.omd', 'notepads'), absolute)
}

/**
 * The plan this run is working on: the boulder's active plan when a boulder
 * names one, otherwise the newest plan file written since the mode started.
 * Reading only the boulder slot left every keyword-triggered mode blind to the
 * plan the agent had just written, so no gate could ever see the work from the
 * plan side.
 */
async function currentPlan(state) {
  const slot = await readBoulderSlot(state.cwd, state.stem)
  if (slot.ok && slot.value?.active_plan) {
    const named = await readPlan(state.cwd, slot.value.active_plan)
    // A boulder names the plan this session is running: the owner started the
    // work explicitly, so the plan file's own "deferred" marker no longer
    // describes it (see `continuationDecision`).
    if (named) return { plan: named, executing: true }
  }
  return { plan: await planSince(state.cwd, state.mode?.since), executing: false }
}

/**
 * Install the per-agent prompt sections, model routing, keyword detector,
 * continuation, quality checks, and write guards. Returns a disposer.
 */
export async function installAgentHooks(runtime, agent, state) {
  const ctx = runtime.ctx
  const modeText = state.mode?.mode ? await loadModePrompt(state.mode.mode) : ''
  state.modeText = modeText
  const rules = await loadRules({ workspace: state.cwd, config: state.config })
  const rulesSection = makeRulesSection(rules.always, rules.conditional)
  state.rulesText = rulesSection.text

  // Verification evidence for the current ultrawork run. The tally is keyed by
  // the mode's `since` stamp, so re-entering ultrawork (or switching modes)
  // starts a fresh run without any extra runtime plumbing.
  const evidence = () => {
    const since = state.mode?.since ?? null
    if (!state.evidence || state.evidence.since !== since) {
      state.evidence = { since, baseline: 0, verification: 0, verifiedAt: 0, artifacts: 0 }
    }
    return state.evidence
  }

  const register = () => {
    const disposers = []
    const policyDisposers = []
    const push = (disposer) => {
      if (typeof disposer === 'function') disposers.push(disposer)
    }

    if (agent.ctx.systemPrompt) {
      try {
        const prefixOrder = agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') ?? 0
        const suffixOrder = agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') ?? 10200
        push(
          agent.ctx.systemPrompt.section({
            name: 'deployment:persona-prefix',
            order: prefixOrder,
            // Lazy for the same reason `omd:rules` and `omd:mode` are: a
            // globally mounted row is created before the session's preset is
            // known, so the persona cannot be a creation-time string.
            text: () => state.personaText,
            interpolate: true,
          }),
        )
        push(
          agent.ctx.systemPrompt.section({
            name: 'deployment:persona-suffix',
            order: suffixOrder,
            text: '',
          }),
        )
        push(
          agent.ctx.systemPrompt.section({
            name: 'omd:rules',
            order: 8000,
            text: () => state.rulesText,
          }),
        )
        push(
          agent.ctx.systemPrompt.section({
            name: 'omd:mode',
            order: 9000,
            text: () => state.modeText,
          }),
        )
      } catch {
        // prompt registry optional; tools still work
      }
    }

    // The tool surface is registered once for the whole profile, so what a role
    // may actually see is decided here, per agent, and re-decided whenever the
    // picker changes the preset under a globally mounted row.
    const applyPolicy = () => {
      for (const dispose of policyDisposers.splice(0).reverse()) {
        try {
          dispose()
        } catch {
          // best effort
        }
      }
      const names = visibleToolNames(agent)
      const role = state.role
      const roleRestriction = restrictionFor(role)
      let restriction = filterRestriction(roleRestriction, names)
      if (!roleRestriction?.allow) {
        const extraDeny = []
        if (state.settings.readOnly) extraDeny.push('write', 'edit')
        if (!canDelegate(role, state.settings)) {
          extraDeny.push(
            ...names.filter(
              (name) =>
                name === 'omd_delegate' ||
                name.startsWith('omd_background_') ||
                name === 'omd_look_at',
            ),
          )
        }
        if (extraDeny.length) {
          restriction = {
            deny: [...new Set([...(restriction?.deny ?? []), ...extraDeny])].filter((name) => names.includes(name)),
          }
        }
      }
      if (restriction?.allow?.length || restriction?.deny?.length) {
        if (agent.ctx.tools?.restrict) policyDisposers.push(agent.ctx.tools.restrict(restriction))
      }
      if (!state.config.taskSystem.enabled) {
        const taskTools = names.filter((name) => name.startsWith('omd_task_'))
        if (taskTools.length && agent.ctx.tools?.restrict) {
          policyDisposers.push(agent.ctx.tools.restrict({ deny: taskTools }))
        }
      } else if (names.includes('todo_write') && agent.ctx.tools?.restrict) {
        policyDisposers.push(agent.ctx.tools.restrict({ deny: ['todo_write'] }))
      }
    }
    applyPolicy()

    // Model routing and fallback.
    //
    // DSH fixes a step's provider/model/effort before prompt assembly and reuses
    // the same selection for every retry of that step, so `agent/request` may
    // no longer change them (the loop rejects a step whose proposal differs).
    // The supported channel is `agent.model.select()`: it records the choice
    // for the NEXT step. A fallback therefore runs as a continuation turn after
    // the failed turn is closed durably, not as an in-place retry.
    const routingEnabled = () => Boolean(state.config?.hooks?.modelRouting)
    const effectiveModelChain = () => {
      const chain = chainFor(state.config, { agentId: state.routeAgent, category: state.category })
      let steps = chain.steps.map((step) => ({ ...step }))
      // A delegated child's creation route is authoritative: it already merged
      // the category, the named subagent, and any explicit provider/model
      // arguments the caller passed. Keep it as step 0 and use the configured
      // chain only for the fallbacks after it. A later step naming the same
      // route is dropped, so a primary the delegation skipped as invalid cannot
      // make the fallback retry the very route that is already running.
      if (isDelegatedAgent(agent) && agent.options?.provider && agent.options?.model) {
        const creation = {
          index: 0,
          ref: steps[0]?.ref ?? null,
          provider: agent.options.provider,
          model: agent.options.model,
          reasoningEffort: agent.options.reasoningEffort ?? null,
          maxTokens: Number.isInteger(agent.options.maxTokens) && agent.options.maxTokens > 0 ? agent.options.maxTokens : null,
          valid: true,
          via: 'creation',
          warning: null,
        }
        steps = [
          creation,
          ...steps
            .slice(1)
            .filter((step) => !(step.valid && step.provider === creation.provider && step.model === creation.model)),
        ]
      }
      // Re-index after any filtered step: `fallback` advances through this
      // array by index, and `state.modelIndex` addresses the reindexed value.
      steps = steps.map((step, index) => ({ ...step, index }))
      return { ...chain, steps }
    }
    const currentModelStep = () =>
      state.modelChain?.steps?.find((step) => step.index === state.modelIndex) ?? null
    const selectModelStep = (step) => {
      if (!step?.valid) return false
      if (!agent.model || typeof agent.model.select !== 'function') return false
      try {
        agent.model.select(selectionFor(step))
        return true
      } catch {
        return false
      }
    }
    const applyModelRouting = () => {
      if (!routingEnabled()) return null
      if (!state.role && !state.category) return null
      const chain = effectiveModelChain()
      state.modelChain = chain
      const primary = chain.steps.find((step) => step.valid) ?? null
      state.modelIndex = primary?.index ?? 0
      state.pendingFallback = null
      selectModelStep(primary)
      return primary
    }

    // A globally mounted row resolves its role from a preset the session may
    // still be choosing, so follow the picker rather than the creation header.
    if (runtime.global && typeof runtime.ctx.on === 'function') {
      const offPreset = runtime.ctx.on('agent-preset/selected', async (sessionId, preset) => {
        if (sessionId !== agent.id) return
        try {
          if (await runtime.refreshRole(agent, preset)) {
            applyPolicy()
            applyModelRouting()
          }
        } catch {
          // the policy hook must never break a preset switch
        }
      })
      if (typeof offPreset === 'function') push(offPreset)

      // The role channel is a session-log read, and a log write that lands after
      // the initial resolution would otherwise never be seen: nothing else
      // re-reads the descriptor, because the picker does not emit for a child
      // that was composed from outside this session.
      //
      // One retry at the session's first step boundary, instead of a timer. It
      // is deliberately NOT claimed as a way to gate the step that triggers it:
      // the loop resolves the tool set and assembles the system prompt *before*
      // it dispatches `agent/pre-step` (dsh-agent-loop `preStep`), so anything
      // this listener changes — the role, its persona, its tool policy — is
      // visible only from the NEXT step onward. That is acceptable because the
      // descriptor is committed inside the child's own `setup`, which the loop
      // awaits before `agent/created`, so the initial resolution already sees
      // it; this net only covers a provider that writes its descriptor later.
      //
      // Bounded to one attempt for the same reason: a session still without a
      // descriptor at its first step boundary is not a delegated child, and an
      // unbounded retry would make every capability-only session read its log
      // once per step for the rest of its life.
      let roleRetried = false
      const offStep = runtime.ctx.on('agent/pre-step', async (_payload, next) => {
        try {
          if (!state.roleResolved && !roleRetried) {
            roleRetried = true
            try {
              if (await runtime.refreshRole(agent, undefined, { delegated: true })) {
                applyPolicy()
                applyModelRouting()
              }
            } catch {
              // a role refresh must never break a step
            }
          }
        } catch {
          // the step must proceed even if the role reader misbehaves
        }
        return next()
      })
      if (typeof offStep === 'function') push(offStep)
    }

    if (agent.ctx.tools?.guard) {
      push(
        agent.ctx.tools.guard((execution) => {
          if (!['write', 'edit'].includes(execution.name)) return undefined
          const file = execution.arguments?.file_path
          if (!file || typeof file !== 'string') return undefined
          if (state.config.hooks.prometheusGuard && writeScopes(state.role)) {
            if (!pathAllowedFor(state.role, file, state.cwd)) {
              return `OMD write scope: ${state.role} may only write inside ${writeScopes(state.role).join(', ')}.`
            }
          }
          if (state.config.hooks.notepadGuard && isNotepadPath(state.cwd, file)) {
            return 'OMD notepads are append-only. Use the omd_notepad tool instead of write/edit.'
          }
          if (state.mode?.mode === 'ultrawork') {
            const reasons = []
            if (state.config.ultrawork.requirePlanGate) {
              const reason = planGateReason(state.cwd, file, { stem: state.stem, since: state.mode?.since })
              if (reason) reasons.push(reason)
            }
            if (state.config.ultrawork.requireBaseline && evidence().baseline === 0) {
              const reason = baselineGateReason(state.cwd, file, state.config.diagnostics?.commands)
              if (reason) reasons.push(reason)
            }
            if (reasons.length) return reasons.join('\n')
          }
          return undefined
        }),
      )
    }

    if (agent.ctx.on) {
      push(
        agent.ctx.on('agent/request', async (_payload, next) => {
          const base = await next()
          if (!routingEnabled()) return base
          // Provider/model/effort were fixed by the step's selection. This
          // deprecated hook may still adjust controls such as sampling, so only
          // the per-step temperature and output cap are applied here.
          const step = currentModelStep()
          if (!step) return base
          const out = { ...base }
          if (typeof step.temperature === 'number') out.temperature = step.temperature
          if (Number.isInteger(step.maxTokens) && step.maxTokens > 0) out.maxTokens = step.maxTokens
          return out
        }),
      )

      push(
        agent.ctx.on('agent/request-error', async (payload, next) => {
          const decision = await next()
          // A configured retry policy owns this attempt; do not fall back until
          // it has given up.
          if (decision?.kind === 'retry') return decision
          if (!routingEnabled()) return decision
          if (payload?.signal?.aborted || isAbortFailure(payload?.failure)) return decision
          // An unbounded retry policy is an OUTER listener: it calls this
          // waterfall first and retries even after this handler declines. A
          // continuation turn on top of that would duplicate the request the
          // policy is already recovering. The policy owns the attempt.
          if (payload?.retryPolicy?.mode === 'always') return decision
          if (state.pendingFallback) return decision
          const chain = state.modelChain ?? effectiveModelChain()
          state.modelChain = chain
          const current = state.modelIndex ?? 0
          const fallbackStep = chain.steps.slice(current + 1).find((step) => step.valid)
          if (!fallbackStep) return decision
          // The turn is terminal; `agent/status` idle closes it and starts the
          // fallback turn with the next selection.
          state.pendingFallback = {
            step: fallbackStep,
            failure: payload?.failure ?? null,
            signal: payload?.signal ?? null,
          }
          return decision
        }),
      )

      push(
        agent.ctx.on('agent/status', ({ status }) => {
          if (status !== 'idle' || !state.pendingFallback) return
          const pending = state.pendingFallback
          state.pendingFallback = null
          // The idle phase is committed during the failed turn's unwind; start
          // the fallback from a clean driver boundary instead of re-entering it.
          queueMicrotask(() => {
            if (runtime.states.get(agent.id) !== state) return
            if (!routingEnabled()) return
            if (pending.signal?.aborted) return
            state.modelIndex = pending.step.index
            if (!selectModelStep(pending.step)) {
              runtime.log('warn', 'model-fallback-select-failed', {
                agentId: agent.id,
                provider: pending.step.provider,
                model: pending.step.model,
              })
              return
            }
            if (typeof agent.followup !== 'function') return
            try {
              agent.followup(userMessage(fallbackText(pending.step, pending.failure), { kind: 'omd', form: 'model-fallback' }))
            } catch (error) {
              runtime.log('warn', 'model-fallback-followup-failed', {
                agentId: agent.id,
                error: String(error?.message ?? error),
              })
              return
            }
            runtime.log('warn', 'model-fallback', {
              agentId: agent.id,
              from: pending.failure?.code ?? null,
              provider: pending.step.provider,
              model: pending.step.model,
            })
            void runtime.ledger(state.cwd, {
              event: 'model-fallback',
              agent: state.role,
              category: state.category,
              provider: pending.step.provider,
              model: pending.step.model,
              failure: pending.failure?.code ?? null,
            })
          })
        }),
      )

      push(
        agent.ctx.on('session/event', async (_session, event) => {
          if (event?.type !== 'user/message') return
          if (!state.config.keywordHook) return
          // A `user/message` event carries the MESSAGE ITSELF as its data — the
          // `{..., message}` wrapper belongs to assistant/system/tool records
          // only (`SessionEventMap['user/message'] = UserMessage`). Reading
          // `event.data.message` made the keyword hook read nothing and never
          // fire.
          // Only a human turn may switch modes: OMD's own injected text (a
          // continuation steer, tool feedback) carries `source.kind: 'omd'`, so
          // a plan or task title can never select a mode by wording alone.
          if (event.data?.source?.kind !== 'user') return
          const text = (event.data?.content ?? [])
            .filter((block) => block?.type === 'text')
            .map((block) => block.text)
            .join('\n')
          const mode = detectMode(text, state.config.keywords)
          if (!mode) return
          if (state.mode?.mode === mode) return
          await runtime.setMode(agent, mode)
          state.modeText = await loadModePrompt(mode)
          state.continuationRounds = 0
          state.stopped = false
          // A new mode is a new run: the stall bookkeeping of the old one must
          // not count against it.
          state.continuationSkip = null
          state.idleContinuationRounds = 0
          state.continuationToolCount = undefined
          await runtime.ledger(state.cwd, { event: 'keyword-mode', mode, agent: state.role })
        }),
      )

      push(
        agent.ctx.on('agent/turn-stopping', async () => {
          if (state.stopped) return
          if (!state.config.hooks.todoContinuation) return
          const mode = state.mode?.mode
          if (!mode || !CONTINUABLE_MODES.has(mode)) return
          if (state.continuationRounds >= state.config.ultrawork.maxContinuationRounds) return
          try {
            const goal = ctx.get('goals')?.get?.(agent)
            if (goal?.phase === 'active') return
          } catch {
            // goal service optional
          }
          if (typeof agent.steer !== 'function') return
          const { plan, executing } = await currentPlan(state)
          let taskSummary = null
          try {
            const summary = await new TaskStore(state.cwd).summary()
            taskSummary = { open: summary.total - summary.completed }
          } catch {
            taskSummary = null
          }
          // A round that executed no tool produced nothing observable: the
          // model answered a continuation with text alone. One such round can
          // be legitimate; a second one is a stalled loop that more nudges
          // cannot fix, so the decision below closes the turn instead.
          const toolsRun = state.toolCount ?? 0
          const idleRounds =
            state.continuationRounds > 0 && state.continuationToolCount === toolsRun
              ? (state.idleContinuationRounds ?? 0) + 1
              : 0
          const decision = continuationDecision(state, {
            plan,
            tasks: taskSummary,
            tracked: evidence(),
            executing,
            dualEvidence: state.config.ultrawork.dualEvidence,
            idleRounds,
          })
          state.idleContinuationRounds = idleRounds
          if (!decision.steer) {
            // Record why the nudging stopped once per reason, so the session log
            // explains a silent close without writing a line on every turn.
            if (state.continuationSkip === decision.reason) return
            state.continuationSkip = decision.reason
            await runtime.ledger(state.cwd, {
              event: 'continuation-skip',
              mode,
              agent: state.role,
              reason: decision.reason,
            })
            return
          }
          state.continuationSkip = null
          state.continuationToolCount = toolsRun
          state.continuationRounds += 1
          await bumpContinuation(state.cwd, state.stem, mode)
          await runtime.ledger(state.cwd, {
            event: 'continuation',
            mode,
            round: state.continuationRounds,
            agent: state.role,
            gate: decision.gate,
          })
          agent.steer(userMessage(decision.text, { kind: 'omd' }))
        }),
      )

      push(
        agent.ctx.on('agent/turn-stopping', () => {
          // A turn that completed normally proves the route works: try the
          // primary again on the next turn so a transient failure does not pin
          // the session to its fallback for the rest of its life. A turn the
          // continuation listener kept open keeps the fallback it just used.
          if (!routingEnabled()) return
          if (!state.modelChain || (state.modelIndex ?? 0) === 0) return
          let pending = 0
          try {
            pending = agent.inbox?.nextStep?.length ?? 0
          } catch {
            pending = 0
          }
          if (pending > 0) return
          const primary = state.modelChain.steps.find((step) => step.valid) ?? null
          if (!primary) return
          state.modelIndex = primary.index
          selectModelStep(primary)
        }),
      )

      push(
        agent.ctx.on('tools/post-execute', async (exec, result, next) => {
          const decision = await next()
          // Every executed call is progress the continuation stall guard can
          // see: a round that ran no tool at all changed nothing.
          state.toolCount = (state.toolCount ?? 0) + 1
          // Track what an ultrawork run has actually verified and written. The
          // tally feeds the baseline gate and the dual-evidence completion gate;
          // it counts only calls that reached execution (a guard refusal never
          // gets here).
          const tracked = evidence()
          if (SHELL_TOOL_NAMES.has(exec.name)) {
            const command = exec.arguments?.command
            if (isVerificationCommand(command)) {
              tracked.baseline += 1
              if (!resultFailed(result)) {
                tracked.verification += 1
                // A verification only covers the deliverables that existed when
                // it ran; a later write needs its own run.
                tracked.verifiedAt = tracked.artifacts
              }
            }
          }
          if (['write', 'edit'].includes(exec.name) && !result?.isError) {
            if (isDeliverableFile(state.cwd, exec.arguments?.file_path)) tracked.artifacts += 1
          }
          if (['read', 'grep', 'glob'].includes(exec.name)) {
            const file = exec.arguments?.file_path ?? exec.arguments?.path
            if (file && typeof file === 'string') {
              rulesSection.watch(path.isAbsolute(file) ? file : path.relative(state.cwd, path.resolve(state.cwd, file)))
              state.rulesText = rulesSection.text
            }
          }
          if (!['write', 'edit'].includes(exec.name)) return decision
          if (result?.isError) return decision
          let nextDecision = decision

          const level = state.config.hooks.commentChecker
          if (level !== 'off') {
            const hits = findCommentSlop(extractWrittenText(exec.name, exec.arguments))
            if (hits.length) {
              const warning = formatSlopWarning(hits, exec.arguments?.file_path)
              if (level === 'block') {
                return { kind: 'block', feedback: [{ type: 'text', text: warning }], additionalContexts: nextDecision.additionalContexts }
              }
              nextDecision = {
                ...nextDecision,
                additionalContexts: [...(nextDecision.additionalContexts ?? []), userMessage(warning, { kind: 'omd' })],
              }
            }
          }

          if (state.config.hooks.planValidator && exec.arguments?.file_path && isPlanPath(state.cwd, exec.arguments.file_path)) {
            const absolute = path.isAbsolute(exec.arguments.file_path)
              ? exec.arguments.file_path
              : path.resolve(state.cwd, exec.arguments.file_path)
            const read = await readTextSafe(absolute)
            if (read.ok) {
              const warnings = validatePlanFormat(read.value)
              if (warnings.length) {
                nextDecision = {
                  ...nextDecision,
                  additionalContexts: [
                    ...(nextDecision.additionalContexts ?? []),
                    userMessage(`[OMD plan validator] ${warnings.join('; ')}`, { kind: 'omd' }),
                  ],
                }
              }
            }
          }
          return nextDecision
        }),
      )
    }

    // The first step of a fresh Agent sees this selection: `agent/created`
    // settles before any turn is claimed.
    applyModelRouting()

    return () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          // best effort
        }
      }
    }
  }

  if (typeof agent.ctx.effect === 'function') {
    let inner = () => {}
    const dispose = agent.ctx.effect(() => {
      inner = register()
      return inner
    })
    return () => {
      try {
        dispose?.()
      } catch {
        // best effort
      }
      try {
        inner?.()
      } catch {
        // best effort
      }
    }
  }
  return register()
}

export { canDelegate }


import path from 'node:path'
import { loadModePrompt } from '../agents/prompts.js'
import { canDelegate, writeScopes } from '../agents/registry.js'
import { restrictionFor, filterRestriction, pathAllowedFor } from '../agents/policies.js'
import { routeFor } from '../core/config.js'
import { isInside } from '../core/paths.js'
import { readTextSafe } from '../core/atomic.js'
import { readBoulderSlot } from '../state/boulder.js'
import { readPlan, validatePlanFormat } from '../state/plan.js'
import { TaskStore } from '../state/tasks.js'
import { bumpContinuation } from '../state/modes.js'
import { loadRules, makeRulesSection } from './rules.js'
import { detectMode, continuationText } from './keyword.js'
import { extractWrittenText, findCommentSlop, formatSlopWarning } from './comment.js'

const CONTINUABLE_MODES = new Set(['ultrawork', 'team', 'hyperplan', 'hyperplan-ulw'])

function userMessage(text) {
  return { role: 'user', source: { kind: 'omd' }, content: [{ type: 'text', text }] }
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

    // A globally mounted row resolves its role from a preset the session may
    // still be choosing, so follow the picker rather than the creation header.
    if (runtime.global && typeof runtime.ctx.on === 'function') {
      const offPreset = runtime.ctx.on('agent-preset/selected', async (sessionId, preset) => {
        if (sessionId !== agent.id) return
        try {
          if (await runtime.refreshRole(agent, preset)) applyPolicy()
        } catch {
          // the policy hook must never break a preset switch
        }
      })
      if (typeof offPreset === 'function') push(offPreset)
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
          return undefined
        }),
      )
    }

    if (agent.ctx.on) {
      push(
        agent.ctx.on('agent/request', async (_payload, next) => {
          const base = await next()
          if (!state.config.hooks.modelRouting) return base
          const route = routeFor(state.config, { agentId: state.role })
          if (!Object.keys(route).length) return base
          const out = { ...base }
          if (route.provider) out.provider = route.provider
          if (route.model) out.model = route.model
          if (route.reasoningEffort) out.reasoningEffort = route.reasoningEffort
          if (route.temperature !== undefined) out.temperature = route.temperature
          if (route.maxTokens) out.maxTokens = route.maxTokens
          return out
        }),
      )

      push(
        agent.ctx.on('session/event', async (_session, event) => {
          if (event?.type !== 'user/message') return
          if (!state.config.keywordHook) return
          const text = (event.data?.message?.content ?? [])
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
          let plan = null
          const slot = await readBoulderSlot(state.cwd, state.stem)
          if (slot.ok && slot.value.active_plan) plan = await readPlan(state.cwd, slot.value.active_plan)
          let taskSummary = null
          try {
            const summary = await new TaskStore(state.cwd).summary()
            taskSummary = { open: summary.total - summary.completed }
          } catch {
            taskSummary = null
          }
          state.continuationRounds += 1
          await bumpContinuation(state.cwd, state.stem, mode)
          await runtime.ledger(state.cwd, {
            event: 'continuation',
            mode,
            round: state.continuationRounds,
            agent: state.role,
          })
          agent.steer({
            content: [{ type: 'text', text: continuationText(state, { plan, tasks: taskSummary }) }],
            source: { kind: 'user' },
          })
        }),
      )

      push(
        agent.ctx.on('tools/post-execute', async (exec, result, next) => {
          const decision = await next()
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
                additionalContexts: [...(nextDecision.additionalContexts ?? []), userMessage(warning)],
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
                    userMessage(`[OMD plan validator] ${warnings.join('; ')}`),
                  ],
                }
              }
            }
          }
          return nextDecision
        }),
      )
    }

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


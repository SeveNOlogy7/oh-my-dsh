import { canDelegate, isSubagentAllowed } from '../agents/registry.js'
import { categorySettings, isPlainObject, routeFor } from '../core/config.js'
import { isCategory } from '../agents/categories.js'
import { parseDoneClaim } from '../agents/result.js'
import { text } from '../i18n/index.js'
import { textTool, requireAgent, contentText, truncate, agentEnum } from './shared.js'

function skillBlocks(skillTexts) {
  return skillTexts
    .map(({ name, content }) => `<skill name="${name}">\n${content.trim()}\n</skill>`)
    .join('\n\n')
}

function buildPrompt({ prompt, skills, category, target }) {
  const parts = []
  parts.push(`<omd-delegation target="${target}"${category ? ` category="${category}"` : ''}>`)
  if (skills.length) parts.push(skillBlocks(skills))
  parts.push(prompt)
  parts.push('</omd-delegation>')
  return parts.join('\n\n')
}

async function loadSkills(ctx, agent, cwd, names, signal) {
  const out = []
  const skills = ctx.get('skills')
  for (const name of names ?? []) {
    if (!skills) throw new Error('the skills service is unavailable in this composition')
    let skill
    try {
      skill = await skills.get(name, { scope: agent, cwd, signal })
    } catch (error) {
      throw new Error(`failed to load skill ${name}: ${error?.message ?? error}`)
    }
    if (!skill) {
      const available = await skills.list({ scope: agent, cwd, signal }).catch(() => [])
      throw new Error(
        `unknown skill: ${name}. Available: ${available.map((entry) => entry.name).join(', ') || 'none'}`,
      )
    }
    out.push({ name, content: skill.content ?? '' })
  }
  return out
}

function capDepth(ctx, config, parent) {
  let depth = 0
  try {
    depth = Number(ctx.get('sessions')?.get(parent.id)?.header?.delegationDepth ?? 0)
  } catch {
    depth = 0
  }
  let cap
  try {
    cap = ctx.get('subagents')?.resolveMaxDepth(config.delegation.maxDepth)
  } catch {
    cap = config.delegation.maxDepth
  }
  if (typeof cap === 'number' && depth >= cap) {
    throw new Error(
      `delegation depth ${depth} reached the cap ${cap}; do the work directly or raise .omd/config.jsonc delegation.maxDepth`,
    )
  }
  return cap
}

function renderRecord(record, extra = '') {
  const lines = [
    `task_id: ${record.task_id}`,
    `target: ${record.target}${record.category ? ` (category: ${record.category})` : ''}`,
    `status: ${record.status}`,
    record.child_session_id ? `child_session_id: ${record.child_session_id}` : null,
    record.started_at ? `started_at: ${record.started_at}` : null,
    record.finished_at ? `finished_at: ${record.finished_at}` : null,
    record.error ? `error: ${record.error}` : null,
  ].filter(Boolean)
  if (record.output) lines.push('', 'output:', truncate(record.output))
  if (record.structured) lines.push('', 'structured:', JSON.stringify(record.structured, null, 2))
  if (extra) lines.push('', extra)
  return lines.join('\n')
}

export function createDelegateTools(runtime) {
  const ctx = runtime.ctx
  const registry = runtime.registry
  const tools = []
  const t = (key, fallback) => text(runtime.language, key, fallback)

  tools.push(
    textTool(
      'omd_delegate',
      t(
        'tool.omd_delegate.description',
        'Delegate a task to a named OMD agent or to a category executor. Use background mode for independent work that can run while you continue; read the result with omd_background_output. A completion notice is only a hint.',
      ),
      {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Complete, self-contained task for the child.' },
          description: { type: 'string', description: 'Short display label.' },
          subagent_type: { type: 'string', description: `Named agent. One of: ${agentEnum.join(', ')}.`, enum: agentEnum },
          category: { type: 'string', description: 'Category routing (visual-engineering, ultrabrain, deep, artistry, quick, unspecified-low, unspecified-high, writing, or a configured custom category).' },
          load_skills: { type: 'array', items: { type: 'string' }, description: 'Skills to prepend to the child prompt.' },
          run_in_background: { type: 'boolean', description: 'Return a task id immediately and continue working.' },
          task_id: { type: 'string', description: 'Continue an existing background task by sending it a new prompt.' },
          session_id: { type: 'string', description: 'Continue a direct child session by id.' },
          output_schema: { type: 'object', description: 'Optional JSON Schema for structured child output.', additionalProperties: true },
          provider: { type: 'string', description: 'Override child provider (requires a configured route).' },
          model: { type: 'string', description: 'Override child model.' },
          reasoning_effort: { type: 'string', description: 'Override child reasoning effort.' },
          timeout_ms: { type: 'integer', description: 'Foreground wait bound; 0 waits indefinitely.' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const settings = state.settings
        if (!canDelegate(state.role, settings)) throw new Error(`${state.role ?? 'this session'} cannot delegate`)
        if (args.subagent_type && args.category) throw new Error('pass exactly one of subagent_type or category')
        if (!args.subagent_type && !args.category) throw new Error('pass subagent_type or category')
        if (args.subagent_type && !isSubagentAllowed(state.role, args.subagent_type, state.config)) {
          throw new Error(`${state.role ?? 'this session'} is not allowed to delegate to ${args.subagent_type}`)
        }
        if (args.category && !isCategory(args.category, state.config)) {
          throw new Error(`unknown category: ${args.category}`)
        }
        if (!ctx.get('subagents')) throw new Error('the subagent service is unavailable in this composition')
        const subagents = ctx.get('subagents')
        const providers = subagents.list?.() ?? []
        if (!providers.includes('spawn')) throw new Error('the spawn subagent provider is unavailable')

        const target = args.subagent_type ?? args.category
        const preset = args.subagent_type ? `omd-${args.subagent_type}` : 'omd-sisyphus-junior'
        const category = args.category ?? null
        const route = routeFor(state.config, {
          agentId: args.subagent_type,
          category,
          override: {
            provider: args.provider,
            model: args.model,
            reasoningEffort: args.reasoning_effort,
          },
        })
        const cat = category ? categorySettings(state.config, category) : null
        const skills = await loadSkills(ctx, parent, state.cwd, args.load_skills, exec.signal)
        const agentOptions = {}
        if (route.provider) agentOptions.provider = route.provider
        if (route.model) agentOptions.model = route.model
        if (route.reasoningEffort) agentOptions.reasoningEffort = route.reasoningEffort
        if (route.maxTokens) agentOptions.maxTokens = route.maxTokens
        const maxDepth = capDepth(ctx, state.config, parent)
        const prompt = buildPrompt({
          prompt: `${cat?.promptAppend ? `${cat.promptAppend}\n\n` : ''}${args.prompt}`,
          skills,
          category,
          target,
        })
        const blocks = [{ type: 'text', text: prompt }]

        if (args.task_id || args.session_id) {
          let childId = args.session_id
          let record = null
          if (args.task_id) {
            record = registry.get(args.task_id) ?? (await registry.load(state.cwd, args.task_id))
            if (!record) throw new Error(`unknown task: ${args.task_id}`)
            if (record.parent_session_id !== parent.id) throw new Error('task belongs to a different parent')
            childId = record.child_session_id
            if (!childId) throw new Error(`task ${args.task_id} has no child session to continue`)
          }
          const messageId = await subagents.sendMessage(parent, childId, blocks, { signal: exec.signal })
          if (record) {
            registry.update(record.task_id, {
              status: 'running',
              continuation_accepted: true,
              error: null,
              finished_at: null,
            })
            await registry.persist(registry.get(record.task_id))
          }
          await runtime.ledger(state.cwd, { event: 'delegate-continued', task: args.task_id ?? childId, child: childId })
          return `accepted message ${messageId} for ${args.task_id ?? childId}; the child's completion notice or omd_background_output will carry the result.`
        }

        const background = args.run_in_background ?? state.config.delegation.defaultBackground
        const record = registry.create({
          workspace: state.cwd,
          parentId: parent.id,
          target,
          category,
          description: args.description ?? '',
          background,
          queued: true,
        })
        const key = `${route.provider ?? 'inherit'}/${route.model ?? 'inherit'}`
        const start = async () => {
          if (exec.signal?.aborted) throw new Error('delegation aborted before start')
          return subagents.startActivation({
            provider: 'spawn',
            label: `omd:${target}`,
            request: {
              cwd: state.cwd,
              prompt: blocks,
              parent,
              agentPreset: preset,
              agentOptions: Object.keys(agentOptions).length ? agentOptions : undefined,
              outputSchema: isPlainObject(args.output_schema) ? args.output_schema : undefined,
              maxDepth,
            },
            signal: exec.signal,
            delivery: background ? 'parent' : 'caller',
          })
        }

        if (background) {
          ;(async () => {
            const release = await runtime.scheduler.acquire(key)
            if (registry.get(record.task_id)?.status === 'cancelled') {
              release()
              return
            }
            try {
              const activation = await start()
              const completion = registry.attach(record.task_id, activation)
              completion.finally(release)
              await runtime.ledger(state.cwd, {
                event: 'delegate-started',
                task: record.task_id,
                child: activation.childId,
                target,
                category,
              })
            } catch (error) {
              release()
              await registry.fail(record.task_id, error)
              await runtime.ledger(state.cwd, {
                event: 'delegate-failed',
                task: record.task_id,
                target,
                error: String(error?.message ?? error),
              })
            }
          })()
          return `started background task ${record.task_id} (${target}${category ? `/${category}` : ''}). Continue useful work; read it with omd_background_output.`
        }

        const release = await runtime.scheduler.acquire(key)
        if (registry.get(record.task_id)?.status === 'cancelled') {
          release()
          throw new Error(`delegation ${record.task_id} was cancelled before start`)
        }
        try {
          const activation = await start()
          const completion = registry.attach(record.task_id, activation)
          completion.finally(release)
          const timeoutMs = args.timeout_ms ?? state.config.delegation.waitTimeoutMs
          const settled = await registry.wait(record.task_id, { timeoutMs, signal: exec.signal })
          if (!settled) throw new Error(`delegation ${record.task_id} disappeared`)
          if (settled.status === 'running' || settled.status === 'queued') {
            await registry.cancel(record.task_id, 'foreground timeout')
            throw new Error(`delegation ${record.task_id} timed out after ${timeoutMs}ms; it was cancelled`)
          }
          if (settled.status === 'failed') {
            throw new Error(`delegation ${record.task_id} failed: ${settled.error ?? 'unknown error'}`)
          }
          const claim = parseDoneClaim(settled.output)
          if (claim && !settled.structured) settled.structured = claim
          await runtime.ledger(state.cwd, {
            event: 'delegate-completed',
            task: record.task_id,
            child: settled.child_session_id,
            target,
            category,
          })
          return renderRecord(settled)
        } catch (error) {
          release()
          throw error
        }
      },
      { isConcurrencySafe: (args) => args?.run_in_background === true },
    ),
  )

  tools.push(
    textTool(
      'omd_background_output',
      t(
        'tool.omd_background_output.description',
        'Read a background delegation result. Set block=true to wait for settlement up to timeout_ms. Completion is the persisted result, not a notification.',
      ),
      {
        type: 'object',
        properties: {
          task_id: { type: 'string', required: true, description: 'Background task id.' },
          block: { type: 'boolean', description: 'Wait for settlement.' },
          timeout_ms: { type: 'integer', description: 'Wait bound in milliseconds.' },
        },
        required: ['task_id'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        let record = registry.get(args.task_id)
        if (!record) record = await registry.load(state.cwd, args.task_id)
        if (!record) throw new Error(`unknown background task: ${args.task_id}`)
        if (record.parent_session_id !== parent.id) throw new Error('task belongs to a different parent')
        if (args.block && ['queued', 'running'].includes(record.status)) {
          const timeoutMs = args.timeout_ms ?? state.config.delegation.waitTimeoutMs
          record = await registry.wait(args.task_id, { timeoutMs, signal: exec.signal })
        }
        return renderRecord(record, ['queued', 'running'].includes(record.status) ? 'still running; call again or continue other work.' : '')
      },
    ),
  )

  tools.push(
    textTool(
      'omd_background_cancel',
      t('tool.omd_background_cancel.description', 'Cancel a queued or running background delegation.'),
      {
        type: 'object',
        properties: { task_id: { type: 'string', required: true }, reason: { type: 'string' } },
        required: ['task_id'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const record = registry.get(args.task_id)
        if (!record) throw new Error(`unknown background task: ${args.task_id}`)
        if (record.parent_session_id !== parent.id) throw new Error('task belongs to a different parent')
        const cancelled = await registry.cancel(args.task_id, args.reason ?? 'cancelled by parent')
        await runtime.ledger(state.cwd, { event: 'delegate-cancelled', task: args.task_id })
        return renderRecord(cancelled)
      },
    ),
  )

  tools.push(
    textTool(
      'omd_background_list',
      t(
        'tool.omd_background_list.description',
        'List this agent session’s background delegations, including settled tasks loaded from disk.',
      ),
      { type: 'object', properties: {}, additionalProperties: false },
      async (_args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const memory = registry.list(parent.id)
        const disk = await registry.listFromDisk(state.cwd, parent.id)
        const map = new Map([...disk, ...memory].map((record) => [record.task_id, record]))
        const records = [...map.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        if (!records.length) return 'no background tasks for this session'
        return records
          .map(
            (record) =>
              `${record.task_id}  ${record.status.padEnd(9)} ${record.target}${record.category ? `/${record.category}` : ''}  ${record.description ?? ''}`.trimEnd(),
          )
          .join('\n')
      },
    ),
  )

  return tools
}

import path from 'node:path'
import { roleLabelFor } from '../agents/registry.js'
import { normalizeChildPreset, routeFor } from '../core/config.js'
import { text } from '../i18n/index.js'
import { requireAgent, textTool, contentText } from './shared.js'

const MEDIA = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/**
 * Resolve a service for one call, preferring the Agent's own context.
 *
 * A tool is registered once, but the row that registers it may sit at the
 * profile's top level, where agent-scoped services (`fs`, `attachments`) are not
 * resolvable yet. Probing them at registration time silently dropped the tool;
 * `delegate.js` already checks its services per call, and this follows it.
 */
function serviceAt(ctx, agent, name) {
  try {
    const scoped = agent?.ctx?.get?.(name)
    if (scoped) return scoped
  } catch {
    // fall through to the registering context
  }
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/** Delegates image inspection to the multimodal-looker role. */
export function createLookAtTools(runtime) {
  const ctx = runtime.ctx

  return [
    textTool(
      'omd_look_at',
      text(
        runtime.language,
        'tool.omd_look_at.description',
        'Inspect one or more images with the multimodal-looker agent and return its analysis.',
      ),
      {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Image paths relative to the workspace.' },
          prompt: { type: 'string', description: 'What to inspect or compare.' },
        },
        required: ['paths', 'prompt'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const childPreset = normalizeChildPreset(state.config.delegation.childPreset)
        const attachments = serviceAt(ctx, parent, 'attachments')
        const subagents = serviceAt(ctx, parent, 'subagents')
        const fs = serviceAt(ctx, parent, 'fs')
        if (!attachments?.saveImages || !subagents?.startActivation || !fs?.readBytes) {
          throw new Error('omd_look_at needs the attachments, subagents, and fs services; this composition does not provide them')
        }
        const blocks = [{ type: 'text', text: args.prompt }]
        for (const relative of args.paths ?? []) {
          const mediaType = MEDIA[path.extname(relative).toLowerCase()]
          if (!mediaType) throw new Error(`unsupported image type: ${relative}`)
          const target = await fs.resolve(relative, { cwd: state.cwd, signal: exec.signal })
          const bytes = await fs.readBytes(target, exec.signal, 20 * 1024 * 1024)
          const [ref] = await attachments.saveImages([{ data: bytes, mediaType, name: path.basename(relative) }])
          blocks.push({ type: 'image', attachment: ref })
        }
        const release = await runtime.scheduler.acquire('look_at')
        // The looker is a delegated child like any other: without an explicit
        // route, DSH fills its AgentOptions from the PARENT's live route, which
        // would silently discard `agents.multimodal-looker`. Pass the role's
        // configured primary so the child starts on it and its chain fallbacks
        // stay available.
        const route = routeFor(state.config, { agentId: 'multimodal-looker' })
        const agentOptions = {}
        if (route.provider) agentOptions.provider = route.provider
        if (route.model) agentOptions.model = route.model
        if (route.reasoningEffort) agentOptions.reasoningEffort = route.reasoningEffort
        if (route.maxTokens) agentOptions.maxTokens = route.maxTokens
        try {
          const activation = await subagents.startActivation({
            provider: 'spawn',
            label: roleLabelFor('multimodal-looker'),
            request: {
              cwd: state.cwd,
              prompt: blocks,
              parent,
              // `delegation.childPreset` governs this child exactly as it governs
              // `omd_delegate`: absent key means "inherit the parent's preset",
              // and the looker's role is carried by `label`.
              ...(childPreset ? { agentPreset: childPreset } : {}),
              agentOptions: Object.keys(agentOptions).length ? agentOptions : undefined,
              maxDepth: 1,
            },
            signal: exec.signal,
            delivery: 'caller',
          })
          const result = await activation.result
          return contentText(result?.output) || 'the looker returned no text'
        } finally {
          release()
        }
      },
      { isConcurrencySafe: () => true },
    ),
  ]
}


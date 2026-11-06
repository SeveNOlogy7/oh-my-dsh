import path from 'node:path'
import { text } from '../i18n/index.js'
import { requireAgent, textTool, contentText } from './shared.js'

const MEDIA = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** Delegates image inspection to the multimodal-looker preset. */
export function createLookAtTools(runtime) {
  const ctx = runtime.ctx
  if (
    !ctx.get('attachments')?.saveImages ||
    !ctx.get('subagents')?.startActivation ||
    !ctx.get('fs')?.readBytes
  ) {
    return []
  }

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
        const blocks = [{ type: 'text', text: args.prompt }]
        for (const relative of args.paths ?? []) {
          const mediaType = MEDIA[path.extname(relative).toLowerCase()]
          if (!mediaType) throw new Error(`unsupported image type: ${relative}`)
          const target = await ctx.get('fs').resolve(relative, { cwd: state.cwd, signal: exec.signal })
          const bytes = await ctx.get('fs').readBytes(target, exec.signal, 20 * 1024 * 1024)
          const [ref] = await ctx.get('attachments').saveImages([{ data: bytes, mediaType, name: path.basename(relative) }])
          blocks.push({ type: 'image', attachment: ref })
        }
        const release = await runtime.scheduler.acquire('look_at')
        try {
          const activation = await ctx.get('subagents').startActivation({
            provider: 'spawn',
            label: 'omd:multimodal-looker',
            request: {
              cwd: state.cwd,
              prompt: blocks,
              parent,
              agentPreset: 'omd-multimodal-looker',
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


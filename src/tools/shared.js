export function textTool(name, description, parameters, execute, options = {}) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: options.outputSchema ?? { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
      presentationMeta: options.presentationMeta,
    },
    execute,
    ...(options.isConcurrencySafe ? { isConcurrencySafe: options.isConcurrencySafe } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  }
}

export function requireAgent(exec) {
  if (!exec?.agent?.id) throw new Error('this OMD tool requires an agent context')
  return exec.agent
}

export function contentText(blocks) {
  return (blocks ?? [])
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

export function truncate(text, limit = 100_000) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, Math.floor(limit / 2))}\n\n… [omd truncated ${value.length - limit} chars] …\n\n${value.slice(-Math.floor(limit / 2))}`
}

export function formatDuration(from, to) {
  const start = new Date(from ?? Date.now()).getTime()
  const end = new Date(to ?? Date.now()).getTime()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

export function jsonText(value) {
  return JSON.stringify(value, null, 2)
}

export const agentEnum = [
  'sisyphus',
  'hephaestus',
  'prometheus',
  'atlas',
  'oracle',
  'librarian',
  'explore',
  'multimodal-looker',
  'metis',
  'momus',
  'sisyphus-junior',
]

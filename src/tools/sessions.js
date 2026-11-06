import { requireAgent, textTool, truncate } from './shared.js'

function formatEvent(event) {
  const type = event?.type
  const data = event?.data ?? {}
  if (type === 'user/message') {
    const text = textOf(data.message)
    return text ? `user: ${text}` : null
  }
  if (type === 'assistant/message') {
    const text = textOf(data.message)
    return text ? `assistant: ${text}` : null
  }
  if (type === 'tool/call') {
    return `tool call ${data.name}: ${truncate(data.arguments ?? '', 2000)}`
  }
  if (type === 'tool/result') {
    const text = textOf(data.message)
    return `tool result${data.error ? ` (${data.error.code})` : ''}: ${truncate(text ?? '', 2000)}`
  }
  if (type === 'turn/start') return `— turn ${data.turn} —`
  return null
}

function textOf(message) {
  return (message?.content ?? [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

export function createSessionTools(runtime) {
  const ctx = runtime.ctx
  const tools = []

  tools.push(
    textTool(
      'omd_session_list',
      'List DSH sessions, newest first. Defaults to the current workspace.',
      {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Filter by session cwd.' },
          from_date: { type: 'string', description: 'ISO lower bound on creation time.' },
          to_date: { type: 'string', description: 'ISO upper bound on creation time.' },
          limit: { type: 'integer', description: 'Maximum rows (default 20).' },
        },
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        if (!ctx.get('sessionQuery')) throw new Error('the session query service is unavailable')
        let records = await ctx.get('sessionQuery').listSessions(exec.signal)
        const cwd = args.project_path ? args.project_path : state.cwd
        if (cwd) records = records.filter((record) => record.header?.cwd === cwd)
        if (args.from_date) {
          const from = new Date(args.from_date).getTime()
          records = records.filter((record) => (record.header?.createdAt ?? 0) >= from)
        }
        if (args.to_date) {
          const to = new Date(args.to_date).getTime()
          records = records.filter((record) => (record.header?.createdAt ?? 0) <= to)
        }
        const limit = Math.max(1, Math.min(100, Number(args.limit) || 20))
        records = records.slice(0, limit)
        if (!records.length) return 'no sessions matched'
        return records
          .map((record) => {
            const when = new Date(record.header?.createdAt ?? 0).toISOString()
            const live = record.live ? ' live' : ''
            return `${record.header.id}  ${when}${live}  ${record.header.cwd ?? ''}`.trimEnd()
          })
          .join('\n')
      },
      { isConcurrencySafe: () => true },
    ),
  )

  tools.push(
    textTool(
      'omd_session_read',
      'Read a DSH session transcript, compacted to text, tool calls, and tool results.',
      {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session id to read.' },
          limit: { type: 'integer', description: 'Maximum characters (default 100000).' },
        },
        required: ['session_id'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        await runtime.stateFor(parent)
        if (!ctx.get('sessionQuery')) throw new Error('the session query service is unavailable')
        const snapshot = await ctx.get('sessionQuery').readSession(args.session_id)
        const header = snapshot.session ?? snapshot.header ?? {}
        const lines = [
          `session: ${header.id ?? args.session_id}`,
          `cwd: ${header.cwd ?? ''}`,
          `created: ${new Date(header.createdAt ?? 0).toISOString()}`,
          `events: ${snapshot.events.length}`,
          '',
        ]
        for (const event of snapshot.events) {
          const line = formatEvent(event)
          if (line) lines.push(line)
        }
        return truncate(lines.join('\n'), Math.max(2000, Number(args.limit) || 100000))
      },
      { isConcurrencySafe: () => true },
    ),
  )

  tools.push(
    textTool(
      'omd_session_search',
      'Search DSH session transcripts. If the profile disables full-text search, this returns the exact configuration fix.',
      {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text.' },
          session_id: { type: 'string', description: 'Limit search to one session.' },
          limit: { type: 'integer', description: 'Maximum hits (default 20).' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        await runtime.stateFor(parent)
        if (!ctx.get('sessionQuery')) throw new Error('the session query service is unavailable')
        const limit = Math.max(1, Math.min(100, Number(args.limit) || 20))
        try {
          if (args.session_id) {
            const page = await ctx.get('sessionQuery').searchEvents({
              sessionId: args.session_id,
              query: args.query,
              limit,
            })
            if (!page.items.length) return 'no matching events'
            return page.items
              .map((hit) => {
                const event = hit.event ?? hit
                return `${hit.sessionId ?? args.session_id}:${hit.seq ?? event.seq ?? ''}  ${event.type ?? hit.type ?? ''}  ${truncate(hit.snippet ?? hit.text ?? '', 500)}`
              })
              .join('\n')
          }
          const page = await ctx.get('sessionQuery').searchSessions({ query: args.query, limit })
          if (!page.items.length) return 'no matching sessions'
          return page.items
            .map((hit) => {
              const header = hit.header ?? hit.session?.header ?? hit.session ?? {}
              const snippet = hit.bestMatch?.snippet ?? hit.snippet ?? ''
              return `${header.id ?? hit.sessionId ?? ''}  ${new Date(header.createdAt ?? 0).toISOString()}  ${truncate(snippet, 500)}`
            })
            .join('\n')
        } catch (error) {
          const message = String(error?.message ?? error)
          if (/SESSION_QUERY_SEARCH_DISABLED|search is disabled|openAt/i.test(message)) {
            return [
              'Full-text session search is disabled in this profile.',
              'Enable it by patching `session-query-sqlite` (for example `openAt: first-search`) and, for durable search, a persistent `path`.',
              `Original error: ${message}`,
            ].join('\n')
          }
          throw error
        }
      },
      { isConcurrencySafe: () => true },
    ),
  )

  return tools
}


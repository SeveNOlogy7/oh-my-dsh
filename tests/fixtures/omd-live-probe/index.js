import fs from 'node:fs'

export const name = 'omd-live-probe'
export const inject = ['agents', 'agentPresets', 'tools', 'sessions', 'sessionQuery']

/**
 * Verification-only end-to-end probe. Creates a blank Agent with the Sisyphus
 * OMD preset on the working opencode-go route, asks it to call omd_status, and
 * records the durable session events. It is installed into a profile only for
 * this check.
 */
export async function apply(ctx) {
  const out = { at: new Date().toISOString(), steps: [] }
  const write = () => {
    try {
      fs.mkdirSync('E:/Oh-My-DSH/.omd', { recursive: true })
      fs.writeFileSync('E:/Oh-My-DSH/.omd/live-probe.json', JSON.stringify(out, null, 2))
    } catch {
      // probe only
    }
  }
  let handle
  try {
    handle = await ctx.agents.create({
      sessionId: `omd-live-${Date.now().toString(36)}`,
      agentOptions: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
      setup: async (agentCtx) => {
        out.mounted = await ctx.agentPresets.mount(agentCtx, 'omd-sisyphus')
      },
    })
    out.agent_id = handle.agent.id
    out.steps.push('created')
    write()
    handle.agent.followup({
      content: [
        {
          type: 'text',
          text: 'Call the omd_status tool exactly once. Then reply with only the first line of its result.',
        },
      ],
      source: { kind: 'user' },
    })
    out.steps.push('prompted')
    write()
    await Promise.race([
      handle.agent.whenIdle(),
      new Promise((resolve) => setTimeout(resolve, 120000)),
    ])
    out.steps.push('idle-or-timeout')
    const snapshot = await ctx.get('sessionQuery').readSession(handle.agent.id)
    out.events = (snapshot.events ?? [])
      .filter((event) => ['tool/call', 'tool/result', 'assistant/message', 'turn/end'].includes(event.type))
      .map((event) => {
        const data = event.data ?? {}
        if (event.type === 'tool/call') {
          return { type: event.type, name: data.name, arguments: data.arguments }
        }
        if (event.type === 'tool/result') {
          const text = (data.message?.content ?? [])
            .filter((block) => block?.type === 'text')
            .map((block) => block.text)
            .join('\n')
          return { type: event.type, text: text.slice(0, 4000), error: data.error ?? null }
        }
        if (event.type === 'assistant/message') {
          const text = (data.message?.content ?? [])
            .filter((block) => block?.type === 'text')
            .map((block) => block.text)
            .join('\n')
          return { type: event.type, text: text.slice(0, 4000) }
        }
        return { type: event.type, reason: data.reason ?? null }
      })
    write()
  } catch (error) {
    out.error = String(error?.stack ?? error)
  } finally {
    try {
      await handle?.dispose?.()
      out.steps.push('disposed')
    } catch {
      // probe only
    }
    write()
  }
}

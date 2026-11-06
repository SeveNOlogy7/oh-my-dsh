import fs from 'node:fs'

export const name = 'omd-probe'
export const inject = ['agents', 'agentPresets', 'tools', 'sessions']

const PRESETS = [
  'omd-sisyphus',
  'omd-hephaestus',
  'omd-prometheus',
  'omd-atlas',
  'omd-oracle',
  'omd-librarian',
  'omd-explore',
  'omd-multimodal-looker',
  'omd-metis',
  'omd-momus',
  'omd-sisyphus-junior',
]

function write(out) {
  try {
    fs.mkdirSync('E:/Oh-My-DSH/.omd', { recursive: true })
    fs.writeFileSync('E:/Oh-My-DSH/.omd/probe.json', JSON.stringify(out, null, 2))
  } catch {
    // probe only
  }
}

/** Verification-only: mount each OMD preset on a blank Agent, record tools. */
export async function apply(ctx) {
  const results = []
  for (const preset of PRESETS) {
    const entry = { preset }
    let handle
    try {
      handle = await ctx.agents.create({
        sessionId: `omd-probe-${Date.now().toString(36)}-${results.length}`,
        setup: async (agentCtx) => {
          entry.mounted = await ctx.agentPresets.mount(agentCtx, preset)
        },
      })
      entry.created = handle.agent.id
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        entry.tools = (ctx.tools.schemas(handle.agent) ?? []).map((schema) => schema.name)
      } catch (error) {
        entry.tools_error = String(error?.message ?? error)
      }
    } catch (error) {
      entry.error = String(error?.message ?? error)
    } finally {
      try {
        await handle?.dispose?.()
      } catch {
        // probe only
      }
    }
    results.push(entry)
    write({ at: new Date().toISOString(), results })
  }
}

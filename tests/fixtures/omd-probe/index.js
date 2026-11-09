import fs from 'node:fs'
import path from 'node:path'

export const name = 'omd-probe'
export const inject = ['agents', 'agentPresets', 'tools', 'sessions']

const PRESETS = [
  // A shipped, non-OMD preset. Under the global runtime row it must see the
  // whole `omd_*` surface with no persona; before the row moved to the profile
  // top level it saw none of it.
  'standard',
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
  // Written through a temp file and renamed: the probe rewrites after each
  // preset, and a half-written file is still valid JSON, so an incremental
  // write would let a reader trust a partial result.
  const target = process.env.OMD_PROBE_OUT ?? 'E:/Oh-My-DSH/.omd/probe.json'
  const staging = `${target}.partial`
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(staging, JSON.stringify(out, null, 2))
    fs.renameSync(staging, target)
  } catch {
    // probe only
  }
}

function names(ctx, agent) {
  try {
    return (ctx.tools.schemas(agent) ?? []).map((schema) => schema.name)
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}

/**
 * Verification-only: drive the real preset-selection path on a blank Agent and
 * record the visible tool set before and after.
 *
 * `ctx.agentPresets.select` is what the picker calls: it recomposes the Agent
 * and appends `agent-preset/selected` to the session, which is exactly what the
 * globally mounted runtime row resolves its role from. Mounting the preset in
 * `setup` instead would leave the session carrying no preset at all, so the
 * runtime would read every Agent as the capability-only identity.
 */
export async function apply(ctx) {
  const results = []
  for (const preset of PRESETS) {
    const entry = { preset }
    let handle
    try {
      handle = await ctx.agents.create({
        sessionId: `omd-probe-${Date.now().toString(36)}-${results.length}`,
        // A real new session starts blank on the default preset.
        setup: async (agentCtx) => {
          entry.initial = (await ctx.agentPresets.mount(agentCtx, 'standard'))?.id ?? null
        },
      })
      entry.created = handle.agent.id
      await new Promise((resolve) => setTimeout(resolve, 300))
      entry.tools_before = names(ctx, handle.agent)

      entry.selected = await ctx.agentPresets.select(handle.agent, preset)
      await new Promise((resolve) => setTimeout(resolve, 400))
      entry.tools = names(ctx, handle.agent)
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

import { createTools } from '../tools/index.js'
import { createCommands } from '../commands/index.js'
import { createSkills, createSkillProvider } from '../skills/index.js'
import { registerConfigTransport } from '../config-page/transport.js'
import { Runtime } from './runtime.js'
import fs from 'node:fs'
import path from 'node:path'

export const name = 'oh-my-dsh'
export const inject = ['tools', 'systemPrompt']

/**
 * Mount one OMD agent preset. The caller is the preset declaration; this
 * plugin owns that agent type's tools, commands, skills, prompt sections,
 * hooks, and durable .omd state.
 */
export function apply(ctx, config = {}) {
  const runtime = new Runtime(ctx, config)
  const disposers = []
  const toolDefs = createTools(runtime)
  for (const tool of toolDefs) {
    try {
      disposers.push(ctx.tools.register(tool))
    } catch (error) {
      throw new Error(`failed to register OMD tool ${tool.name}: ${error?.message ?? error}`)
    }
  }
  const commandDefs = ctx.get('commands') ? createCommands(runtime) : []
  const commandsService = ctx.get('commands')
  for (const command of commandDefs) {
    try {
      disposers.push(commandsService.register(command))
    } catch (error) {
      throw new Error(`failed to register OMD command ${command.name}: ${error?.message ?? error}`)
    }
  }
  const offCreated = ctx.on('agent/created', (payload) => runtime.onAgentCreated(payload))
  const offDisposed = ctx.on('agent/disposed', (payload) => runtime.onAgentDisposed(payload))

  // The settings page's transport: one exact Fetch route on DSH's authenticated
  // `/api` channel, so opening the page reads and writes `.omd/config.jsonc`
  // without executing anything in a session. `connection` is an OPTIONAL
  // dependency — a shell or headless composition has no browser channel and the
  // row must still mount there — so this listens for it instead of declaring it
  // in `inject` (which would keep the whole row from activating).
  const registerTransport = (ownerCtx) => {
    try {
      const dispose = registerConfigTransport(ownerCtx, {
        language: runtime.language,
        log: (event, data) => runtime.log('warn', event, data),
      })
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch (error) {
      runtime.log('warn', 'config-transport-registration-failed', { error: String(error?.message ?? error) })
    }
  }
  if (typeof ctx.inject === 'function') ctx.inject(['connection'], (connectionCtx) => registerTransport(connectionCtx))
  else registerTransport(ctx)

  if (process.env.OMD_DEBUG_APPLY) {
    try {
      const dir = path.join(process.cwd(), '.omd')
      fs.mkdirSync(dir, { recursive: true })
      const probe = { at: new Date().toISOString(), agent: runtime.configuredAgent }
      try {
        const modules = ctx.get('clientModules')
        probe.clientPath = typeof modules?.clientPath === 'function' ? modules.clientPath('oh-my-dsh') ?? null : 'service-absent'
        probe.bootEntries = (modules?.graph?.()?.entries ?? []).map((entry) => entry.id)
      } catch (error) {
        probe.clientPath = `error: ${error?.message ?? error}`
      }
      fs.appendFileSync(path.join(dir, 'apply-debug.jsonl'), `${JSON.stringify(probe)}\n`)
    } catch {
      // debug output must never affect activation
    }
  }

  // Skills are async to load; register them after the synchronous surface.
  const skillsService = ctx.get('skills')
  if (skillsService) {
    void (async () => {
      try {
        for (const skill of await createSkills(runtime)) {
          disposers.push(skillsService.register(skill))
        }
        const provider = createSkillProvider()
        disposers.push(skillsService.registerProvider(provider))
      } catch (error) {
        runtime.log('warn', 'skills-registration-failed', { error: String(error?.message ?? error) })
      }
    })()
  }

  const teardown = () => {
    try {
      offDisposed()
    } catch {
      // best effort
    }
    try {
      offCreated()
    } catch {
      // best effort
    }
    for (const dispose of disposers.reverse()) {
      try {
        dispose()
      } catch {
        // best effort
      }
    }
    runtime.dispose()
  }

  // The role a session ends up with is resolved asynchronously off its own
  // descriptor, so a caller cannot observe it the moment `agent/created`
  // settles. Exposing the runtime read-only lets a test await that settling
  // instead of guessing at a sleep, which is what makes the role channel
  // assertable at all. It grants nothing a caller could not already reach
  // through the context, and the disposer stays a plain call.
  Object.defineProperty(teardown, 'runtime', { value: runtime, enumerable: false })
  return teardown
}

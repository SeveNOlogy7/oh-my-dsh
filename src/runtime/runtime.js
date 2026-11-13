import os from 'node:os'
import { loadConfig, agentSettings } from '../core/config.js'
import { AGENTS, canDelegate, isReadOnly, skillsFor, agentIdFromPreset } from '../agents/registry.js'
import { loadAgentPrompt, loadModePrompt } from '../agents/prompts.js'
import { safeStem } from '../core/paths.js'
import { appendJsonl, writeJsonAtomic } from '../core/atomic.js'
import { omdPath } from '../core/paths.js'
import { readMode, writeMode, clearMode } from '../state/modes.js'
import { appendLedger } from '../state/ledger.js'
import { backgroundRegistry } from '../state/background.js'
import { resolveActivePreset } from '../state/active-preset.js'
import { resolveDescriptorRoleInfo } from '../state/active-role.js'
import { normalizeLanguage } from '../i18n/index.js'
import { Scheduler } from './scheduler.js'

export class Runtime {
  constructor(ctx, config = {}) {
    this.ctx = ctx
    this.config = config
    // A row that names `agent` mounts one fixed OMD role: the legacy layout,
    // where the row sits inside one OMD preset and that preset *is* the role.
    // A row that omits `agent` is the global capability row. It mounts once for
    // the whole profile, so the role cannot be a construction fact any more; it
    // is resolved per session from the delegation channel, and a session that
    // carries no role label gets the capability-only identity (`null`).
    this.configuredAgent = config.agent ?? null
    if (this.configuredAgent !== null && !AGENTS[this.configuredAgent]) {
      throw new Error(`unknown OMD agent: ${String(config.agent)}`)
    }
    this.global = this.configuredAgent === null
    this.agentId = this.configuredAgent
    this.definition = this.configuredAgent === null ? null : AGENTS[this.configuredAgent]
    // The plugin row's `language` key selects the description language the
    // model reads. Anything unsupported or absent degrades to English.
    this.language = normalizeLanguage(config.language)
    this.registry = backgroundRegistry()
    this.scheduler = new Scheduler(5)
    this.states = new Map()
    this.loading = new Map()
    this.disposers = []
  }

  get canDelegate() {
    // Globally mounted, every tool is registered and the per-agent policy hook
    // decides what each resolved role may actually see.
    if (this.global) return true
    return canDelegate(this.agentId)
  }

  get isReadOnly() {
    if (this.global) return false
    return isReadOnly(this.agentId)
  }

  /**
   * The OMD role this agent runs as, or `null` for capability-only.
   *
   * A row with a configured agent answers immediately; the global row asks the
   * session, which is why this is async. It is the single reader of the role,
   * so every other module can stay synchronous off `state.role`.
   */
  async roleFor(agent) {
    if (!this.global) return this.configuredAgent
    const state = await this.stateFor(agent)
    return state.role
  }

  /** Persona text for a role, honouring the per-role `promptAppend` override. */
  async personaFor(role, config) {
    const settings = agentSettings(config, role)
    const base = role ? await loadAgentPrompt(role) : ''
    if (!settings.promptAppend) return { personaText: base, settings }
    const appended = `## User append\n\n${settings.promptAppend}`
    return { personaText: base ? `${base}\n\n${appended}` : appended, settings }
  }

  async stateFor(agent) {
    if (!agent?.id) throw new Error('OMD tool requires an agent context')
    const existing = this.states.get(agent.id)
    if (existing?.ready) return existing
    if (this.loading.has(agent.id)) return this.loading.get(agent.id)
    const promise = this.#loadState(agent)
    this.loading.set(agent.id, promise)
    try {
      const state = await promise
      this.states.set(agent.id, state)
      return state
    } finally {
      this.loading.delete(agent.id)
    }
  }

  async #loadState(agent) {
    let cwd = process.cwd()
    try {
      const workingDirectory = this.ctx.get('workingDirectory')
      if (workingDirectory?.ensure) cwd = await workingDirectory.ensure(agent)
    } catch {
      // keep process cwd
    }
    const loaded = await loadConfig({ workspace: cwd, home: os.homedir() })
    // The header is a creation fact and reads `standard` for every interactive
    // session, so the picker choice is read through the session projection.
    const preset = this.configuredAgent ?? (await resolveActivePreset(this.ctx, agent))
    // A delegated child's role arrives on its own subagent descriptor, which
    // DSH appends during setup — before this listener is announced. The reader
    // is defensive because it touches two optional services, and the fallback to
    // the preset keeps every pre-existing `omd-<role>` session resolving as it
    // did before OMD stopped publishing one preset per role. The same descriptor
    // can carry the category a delegation routed through, which selects the
    // model chain the child falls back over.
    const resolved = await this.#resolveRoleInfo(agent, preset)
    const role = resolved.role
    const category = resolved.category
    const { personaText, settings } = await this.personaFor(role, loaded.config)
    const stem = safeStem(agent.id)
    const mode = await readMode(cwd, stem)
    this.scheduler.setLimit(loaded.config.delegation.maxConcurrent)
    return {
      ready: true,
      agent,
      cwd,
      preset,
      role,
      category,
      // The route inputs mirror what the delegation call used: a category
      // delegation names no subagent, so its chain comes from the category, not
      // from the junior role's own overrides.
      routeAgent: category ? null : role,
      roleResolved: role !== null,
      config: loaded.config,
      diagnostics: loaded.diagnostics,
      settings,
      personaText,
      stem,
      mode,
      modeText: '',
      rulesText: '',
      continuationRounds: mode?.continuation_rounds ?? 0,
      modelChain: null,
      modelIndex: 0,
      pendingFallback: null,
      stopped: false,
      dispose: null,
    }
  }

  /**
   * The role and category precedence, in one place: a row that pins an agent
   * answers immediately, a delegated child is read back off its descriptor
   * label, and the preset stays the compatibility fallback for the sessions
   * that were allocated back when one preset existed per role.
   */
  async #resolveRoleInfo(agent, preset) {
    if (this.configuredAgent !== null) return { role: this.configuredAgent, category: null }
    const fromSession = await resolveDescriptorRoleInfo(this.ctx, agent)
    if (fromSession) return fromSession
    return { role: agentIdFromPreset(preset), category: null }
  }

  /**
   * Re-resolve the role after the picker changes the preset.
   *
   * A globally mounted row is created before the session's preset is known, so
   * the first resolution happens too early by construction. Returns whether
   * anything changed, which is what the policy hook uses to decide whether to
   * re-apply the tool restriction.
   *
   * `presetHint` is the `agent-preset/selected` payload. It is authoritative
   * and is preferred over re-reading the session log, which would be a
   * redundant round trip that can also lag the event it is reacting to.
   *
   * `delegated` marks a call driven by the descriptor channel rather than by
   * the picker, so the outcome is recorded as the session's answer for good.
   * The session's own label outranks the hint in both cases: the hint is where a
   * role is *inferred* from the preset, the label is where it is *declared*.
   */
  async refreshRole(agent, presetHint = undefined, { delegated = false } = {}) {
    if (!this.global) return false
    const state = await this.stateFor(agent)
    const preset = presetHint ?? (await resolveActivePreset(this.ctx, agent))
    const resolved = await this.#resolveRoleInfo(agent, preset)
    const role = resolved.role
    const category = resolved.category
    state.preset = preset ?? null
    if (delegated) state.roleResolved = role !== null
    if (role === state.role && category === state.category) return false
    const { personaText, settings } = await this.personaFor(role, state.config)
    state.role = role
    state.category = category
    state.routeAgent = category ? null : role
    state.personaText = personaText
    state.settings = settings
    return true
  }

  async refreshMode(state) {
    state.mode = await readMode(state.cwd, state.stem)
    state.modeText = state.mode?.mode ? await loadModePrompt(state.mode.mode) : ''
    state.continuationRounds = state.mode?.continuation_rounds ?? 0
    return state.mode
  }

  async setMode(agent, mode, { runId = null } = {}) {
    const state = await this.stateFor(agent)
    const saved = await writeMode({ workspace: state.cwd, stem: state.stem, mode, runId })
    state.mode = saved
    state.modeText = await loadModePrompt(mode)
    state.continuationRounds = 0
    state.stopped = false
    return saved
  }

  async clearMode(agent) {
    const state = await this.stateFor(agent)
    await clearMode(state.cwd, state.stem)
    state.mode = null
    state.modeText = ''
    state.continuationRounds = 0
    state.stopped = true
  }

  async setStopped(agent, stopped = true) {
    const state = await this.stateFor(agent)
    state.stopped = stopped
  }

  async onAgentCreated(payload) {
    const agent = payload?.agent
    if (!agent?.id) return
    try {
      const state = await this.stateFor(agent)
      if (state.dispose) return
      const { installAgentHooks } = await import('../hooks/index.js')
      state.dispose = await installAgentHooks(this, agent, state)
      if (process.env.OMD_DEBUG_TOOLS) {
        try {
          const tools = (agent.ctx.tools.schemas(agent) ?? []).map((schema) => schema.name)
          await writeJsonAtomic(omdPath(state.cwd, 'debug-tools.json'), {
            at: new Date().toISOString(),
            agent_id: agent.id,
            runtime: this.configuredAgent,
            role: state.role,
            preset: state.preset ?? null,
            cwd: state.cwd,
            tools,
            sections: ['deployment:persona-prefix', 'omd:rules', 'omd:mode'],
            mode: state.mode?.mode ?? null,
          })
        } catch {
          // debug output must never affect creation
        }
      }
    } catch (error) {
      this.lastError = error
      this.log('warn', 'agent-setup-failed', { agentId: agent.id, error: String(error?.message ?? error) })
      if (process.env.OMD_DEBUG) console.error('[omd] agent setup failed', error)
    }
  }

  onAgentDisposed(payload) {
    const agent = payload?.agent
    if (!agent?.id) return
    const state = this.states.get(agent.id)
    if (!state) return
    for (const record of this.registry.list(agent.id)) {
      if (record.status === 'queued' || record.status === 'running') {
        this.registry
          .cancel(record.task_id, 'parent agent disposed')
          .catch(() => {})
      }
    }
    try {
      state.dispose?.()
    } catch {
      // best effort
    }
    this.states.delete(agent.id)
  }

  async workspaceFor(agent) {
    return (await this.stateFor(agent)).cwd
  }

  log(level, event, data = {}) {
    try {
      const state = data.agentId ? this.states.get(data.agentId) : null
      if (!state?.cwd) return
      const day = new Date().toISOString().slice(0, 10)
      appendJsonl(omdPath(state.cwd, 'logs', `omd-${day}.jsonl`), {
        ts: new Date().toISOString(),
        level,
        event,
        ...data,
      }).catch(() => {})
    } catch {
      // logging must never break orchestration
    }
  }

  async ledger(workspace, event) {
    try {
      await appendLedger(workspace, event)
    } catch {
      // ledger is evidence, not a gate
    }
  }

  dispose() {
    for (const state of this.states.values()) {
      try {
        state.dispose?.()
      } catch {
        // best effort
      }
    }
    this.states.clear()
  }

  skillNames() {
    return skillsFor(this.configuredAgent, {})
  }
}

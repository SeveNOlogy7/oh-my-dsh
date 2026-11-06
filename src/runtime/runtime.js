import os from 'node:os'
import { loadConfig, agentSettings } from '../core/config.js'
import { AGENTS, canDelegate, isReadOnly, skillsFor } from '../agents/registry.js'
import { loadAgentPrompt, loadModePrompt } from '../agents/prompts.js'
import { safeStem } from '../core/paths.js'
import { appendJsonl, writeJsonAtomic } from '../core/atomic.js'
import { omdPath } from '../core/paths.js'
import { readMode, writeMode, clearMode } from '../state/modes.js'
import { appendLedger } from '../state/ledger.js'
import { backgroundRegistry } from '../state/background.js'
import { resolveActivePreset } from '../state/active-preset.js'
import { normalizeLanguage } from '../i18n/index.js'
import { Scheduler } from './scheduler.js'

export class Runtime {
  constructor(ctx, config = {}) {
    this.ctx = ctx
    this.config = config
    this.agentId = config.agent
    if (!AGENTS[this.agentId]) throw new Error(`unknown OMD agent: ${String(config.agent)}`)
    this.definition = AGENTS[this.agentId]
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
    return canDelegate(this.agentId)
  }

  get isReadOnly() {
    return isReadOnly(this.agentId)
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
    const settings = agentSettings(loaded.config, this.agentId)
    let prompt = await loadAgentPrompt(this.agentId)
    if (settings.promptAppend) prompt = `${prompt}\n\n## User append\n\n${settings.promptAppend}`
    const stem = safeStem(agent.id)
    const mode = await readMode(cwd, stem)
    this.scheduler.setLimit(loaded.config.delegation.maxConcurrent)
    return {
      ready: true,
      agent,
      cwd,
      config: loaded.config,
      diagnostics: loaded.diagnostics,
      settings,
      prompt,
      stem,
      mode,
      modeText: '',
      rulesText: '',
      continuationRounds: mode?.continuation_rounds ?? 0,
      stopped: false,
      dispose: null,
    }
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
            runtime: this.agentId,
            preset: (await resolveActivePreset(this.ctx, agent)) ?? null,
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
    return skillsFor(this.agentId, {})
  }
}

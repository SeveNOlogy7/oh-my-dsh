import path from 'node:path'
import { roleLabelFor } from '../../src/agents/registry.js'

/**
 * The descriptor event a delegated child carries, as `resolveDescriptorRole`
 * reads it: the role travels on the durable creation `label`, because the
 * subagent composition accepts no OMD-specific field and its `persona` is only
 * replayed on cold resume.
 *
 * The label is built with the production writer rather than a literal, so this
 * fixture cannot drift away from what `delegate.js`/`lookat.js` actually write.
 * Without that, the two ends of the channel would be joined only by whichever
 * test happens to assert the prefix.
 */
export function descriptorEvent(role, category = null) {
  return { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: roleLabelFor(role, category) } }
}

/**
 * `events` are the session's OWN events — what `ownEvents()` answers with. Pass
 * `descriptorEvent(role)` to give the session a role through the delegation
 * channel, or a bare `role` to do the same thing more directly. Omitting both
 * leaves the session role-less, which is the capability-only identity.
 */
export function createFakeContext({ cwd, agentPreset = 'standard', events, role } = {}) {
  const ownEvents = events ?? (role ? [descriptorEvent(role)] : [])
  const state = {
    tools: [],
    restrictions: [],
    guards: [],
    commands: [],
    skills: [],
    providers: [],
    sections: [],
    listeners: new Map(),
    followups: [],
    steers: [],
    modelSelections: [],
    activations: [],
    settled: [],
  }

  const tools = {
    register(definition) {
      state.tools.push(definition)
      return () => {
        state.tools = state.tools.filter((tool) => tool !== definition)
      }
    },
    restrict(filter) {
      state.restrictions.push(filter)
      // Disposal really lifts the filter, as it does in DSH, so a test can
      // observe a restriction being re-applied on a preset switch.
      return () => {
        state.restrictions = state.restrictions.filter((entry) => entry !== filter)
      }
    },
    guard(guard) {
      state.guards.push(guard)
      return () => {}
    },
    schemas() {
      return state.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
    },
    get(name) {
      return state.tools.find((tool) => tool.name === name)
    },
  }

  const commands = {
    register(definition) {
      state.commands.push(definition)
      return () => {
        state.commands = state.commands.filter((command) => command !== definition)
      }
    },
  }

  const skills = {
    register(skill) {
      state.skills.push(skill)
      return () => {}
    },
    registerProvider(factory) {
      state.providers.push(factory({}))
      return () => {}
    },
    async get(name) {
      return { name, content: `skill body for ${name}`, description: name }
    },
    async list() {
      return state.skills.map((skill) => ({ name: skill.name, description: skill.description }))
    },
  }

  const systemPrompt = {
    section(section) {
      state.sections.push(section)
      return () => {
        state.sections = state.sections.filter((entry) => entry !== section)
      }
    },
    getSectionOrder() {
      return 0
    },
    context() {
      return () => {}
    },
    variable() {
      return () => {}
    },
    tools() {
      return () => {}
    },
    suppressRuntimeContext() {
      return () => {}
    },
  }

  const ctx = {
    state,
    tools,
    commands,
    skills,
    systemPrompt,
    workingDirectory: { async ensure() { return cwd } },
    sessions: {
      get() {
        // The real record is a live Session: an immutable creation header plus
        // the events appended afterwards. `agent-preset/selected` is what the
        // active-preset readers need, and `subagent/descriptor` is what the role
        // reader needs.
        return { header: { agentPreset, delegationDepth: 0, cwd }, ownEvents() { return ownEvents } }
      },
    },
    sessionQuery: {
      // Reads the session's OWN events through `this` on purpose: DSH's real
      // `readSession` is a class method reading `this._corpus`, so a caller that
      // extracts it and calls it detached throws here too. That is what makes
      // the disk fallbacks in `src/state/active-*.js` genuinely exercised.
      events: ownEvents,
      async listSessions() { return [{ header: { id: 's1', cwd, createdAt: Date.now() }, live: true }] },
      async readSession() { return { session: { id: 's1', cwd, createdAt: Date.now() }, events: this.events } },
      async searchSessions() { return { items: [] } },
      async searchEvents() { return { items: [] } },
    },
    subagents: {
      list() { return ['spawn'] },
      resolveMaxDepth() { return 1 },
      async startActivation(spec) {
        state.activations.push(spec)
        const activation = {
          childId: `child-${state.activations.length}`,
          result: Promise.resolve({
            output: [{ type: 'text', text: 'child result' }],
            structured: null,
            stopReason: 'completed',
          }),
          dispose: async () => {},
        }
        state.settled.push(activation)
        return activation
      },
      async sendMessage() { return 'msg-1' },
    },
    agentPresets: {
      // OMD registers no preset of its own any more: the picker lists every
      // registered preset and offers no way to hide one, so eleven per-role
      // entries could only mislead. Only the deployment's own presets remain,
      // and those belong to the host, not to this fake.
      async list() { return [] },
    },
    goals: { get() { return undefined } },
    lsp: { async query() { return { kind: 'locations', locations: [] } } },
    subprocess: {
      async resolveExecutable(command) { return command },
      spawn() {
        return {
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: { stdout: { readFrom() { return { text: 'ok' } } }, stderr: { readFrom() { return { text: '' } } } },
        }
      },
    },
    attachments: {
      async saveImages(inputs) {
        return inputs.map((input, index) => ({ attachmentId: `a${index}`, mediaType: input.mediaType, bytes: 1, width: 1, height: 1 }))
      },
    },
    fs: {
      async resolve(target) { return path.resolve(cwd, target) },
      async readBytes() { return new Uint8Array([1, 2, 3]) },
    },
    on(event, listener) {
      const list = state.listeners.get(event) ?? []
      list.push(listener)
      state.listeners.set(event, list)
      return () => {
        state.listeners.set(event, (state.listeners.get(event) ?? []).filter((entry) => entry !== listener))
      }
    },
    effect(fn) {
      return fn()
    },
    get(name) {
      return ctx[name]
    },
  }

  const agentCtx = {
    tools,
    systemPrompt,
    skills,
    commands,
    on: ctx.on,
    effect: ctx.effect,
    get: ctx.get,
  }

  const agent = {
    id: 'session-1',
    ctx: agentCtx,
    options: {},
    session: { header: { cwd } },
    inbox: { nextTurn: [], nextStep: [] },
    model: {
      current() {
        return state.modelSelections.at(-1) ?? undefined
      },
      select(selection) {
        state.modelSelections.push(selection)
      },
    },
    followup(message) { state.followups.push(message) },
    steer(message) { state.steers.push(message) },
  }

  ctx.agent = agent
  return { ctx, agent, state }
}

export async function emit(ctx, event, ...args) {
  const listeners = ctx.state.listeners.get(event) ?? []
  const results = []
  for (const listener of listeners) results.push(await listener(...args))
  return results
}

/**
 * Drive a waterfall event the way the real loop does: `await listener(payload, next)`.
 *
 * The terminal `next()` must be awaited, not merely returned. Without the
 * `await` the helper resolves to whatever the last listener returned *before*
 * its `next()` settled — the pre-decision value — so a listener that does its
 * work around `next()` would look like it ran while its hook body never
 * executed. DSH's own loop awaits it, so a test that does not would silently
 * pass without exercising the hook at all.
 */
export async function emitWaterfall(ctx, event, ...args) {
  const listeners = ctx.state.listeners.get(event) ?? []
  let index = 0
  const next = async () => {
    if (index >= listeners.length) return args[args.length - 1]
    const listener = listeners[index]
    index += 1
    return listener(...args.slice(0, -1), next)
  }
  return await next()
}

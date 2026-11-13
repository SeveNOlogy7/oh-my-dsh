import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { createFakeContext, descriptorEvent, emit, emitWaterfall } from './helpers/fake-context.mjs'

async function setup(agent = 'sisyphus', { config } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-runtime-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  if (config) {
    await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
    await fs.writeFile(path.join(workspace, '.omd', 'config.jsonc'), JSON.stringify(config))
  }
  const { ctx, agent: agentHandle, state } = createFakeContext({ cwd: workspace, agentPreset: `omd-${agent}` })
  // Base DSH tools the real preset also mounts.
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent: agentHandle })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { root, workspace, ctx, agent: agentHandle, state, dispose }
}

test('oracle preset registers read-only tools and persona', async () => {
  const env = await setup('oracle')
  const names = env.state.tools.map((tool) => tool.name)
  assert.ok(names.includes('omd_status'))
  assert.ok(names.includes('omd_session_read'))
  assert.ok(!names.includes('omd_delegate'))
  const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
  assert.ok(persona)
  // The persona is a lazy section: a globally mounted row is created before the
  // session's preset is known, so its text is read at request time.
  assert.match(persona.text(), /Oracle/)
  assert.ok(env.state.restrictions.some((filter) => filter.deny?.includes('write') && filter.deny?.includes('edit')))
  env.dispose()
})

test('sisyphus registers delegation and completes a background task', async () => {
  const env = await setup('sisyphus')
  const delegate = env.state.tools.find((tool) => tool.name === 'omd_delegate')
  assert.ok(delegate)
  const result = await delegate.execute(
    { prompt: 'inspect the repo', subagent_type: 'oracle', run_in_background: true, description: 'inspect' },
    { agent: env.agent, signal: new AbortController().signal },
  )
  assert.match(result, /started background task bg_/)
  const taskId = /bg_[a-f0-9]+/.exec(result)[0]
  await new Promise((resolve) => setTimeout(resolve, 80))
  const output = env.state.tools.find((tool) => tool.name === 'omd_background_output')
  const text = await output.execute({ task_id: taskId }, { agent: env.agent, signal: new AbortController().signal })
  assert.match(text, /status: completed/)
  assert.match(text, /child result/)
  const resultFile = path.join(env.workspace, '.omd', 'runtime', 'session-1', 'results', `${taskId}.json`)
  assert.equal((await fs.stat(resultFile)).isFile(), true)
  env.dispose()
})

test('foreground delegation returns the child output', async () => {
  const env = await setup('sisyphus')
  const delegate = env.state.tools.find((tool) => tool.name === 'omd_delegate')
  const text = await delegate.execute(
    { prompt: 'answer', category: 'quick' },
    { agent: env.agent, signal: new AbortController().signal },
  )
  assert.match(text, /status: completed/)
  assert.match(text, /child result/)
  env.dispose()
})

test('delegation rejects an unlisted target', async () => {
  const env = await setup('atlas')
  const delegate = env.state.tools.find((tool) => tool.name === 'omd_delegate')
  await assert.rejects(
    () =>
      delegate.execute(
        { prompt: 'x', subagent_type: 'momus' },
        { agent: env.agent, signal: new AbortController().signal },
      ),
    /not allowed/,
  )
  env.dispose()
})

test('commands initialize .omd, set modes, and render status', async () => {
  const env = await setup('sisyphus')
  const init = env.state.commands.find((command) => command.name === 'omd-init')
  const initResult = await init.handler({ agent: env.agent, rawInput: '', signal: new AbortController().signal })
  assert.equal(initResult.kind, 'success')
  assert.equal((await fs.stat(path.join(env.workspace, '.omd', 'config.jsonc'))).isFile(), true)
  assert.equal((await fs.stat(path.join(env.workspace, '.omd', 'plans'))).isDirectory(), true)
  // A report command settles in the UI command plane and must not wake the
  // agent; the Client half renders its text in the command row instead.
  assert.equal(env.state.followups.length, 0)

  const ulw = env.state.commands.find((command) => command.name === 'omd-ulw')
  const ulwResult = await ulw.handler({ agent: env.agent, rawInput: 'fix the tests', signal: new AbortController().signal })
  assert.equal(ulwResult.kind, 'success')
  assert.equal(env.state.followups.length, 1)
  const mode = JSON.parse(await fs.readFile(path.join(env.workspace, '.omd', 'runtime', 'session-1', 'mode.json'), 'utf8'))
  assert.equal(mode.mode, 'ultrawork')
  const modeSection = env.state.sections.find((section) => section.name === 'omd:mode')
  assert.ok(modeSection)
  assert.match(modeSection.text(), /ultrawork mode/i)

  const status = env.state.commands.find((command) => command.name === 'omd-status')
  const statusResult = await status.handler({ agent: env.agent, rawInput: '', signal: new AbortController().signal })
  assert.match(statusResult.text, /Oh-My-DSH status/)
  assert.match(statusResult.text, /ultrawork/)
  assert.equal(env.state.followups.length, 1)

  // The doctor is a skill driving the omd_doctor tool now, so it must register
  // no command, and calling the tool must still leave the agent asleep.
  assert.equal(env.state.commands.some((command) => command.name === 'omd-doctor'), false)
  const doctor = env.state.tools.find((tool) => tool.name === 'omd_doctor')
  assert.ok(doctor)
  const doctorResult = await doctor.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(doctorResult, /summary:/)
  assert.equal(env.state.followups.length, 1)
  env.dispose()
})

test('doctor reads the selected preset, not the creation-time header', async () => {
  const env = await setup('sisyphus')
  const doctor = env.state.tools.find((tool) => tool.name === 'omd_doctor')
  // DSH writes the creation-time preset into an immutable session header and
  // records the picker choice afterwards as an `agent-preset/selected` event,
  // so the header alone reports `standard` inside every OMD session.
  env.ctx.sessions.get = () => ({
    header: { agentPreset: 'standard', cwd: env.workspace },
    ownEvents: () => [{ type: 'agent-preset/selected', data: { agentPreset: 'omd-sisyphus' } }],
  })
  const selected = await doctor.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(selected, /PASS active-preset: omd-sisyphus/)

  // A session with no live record and no readable log still falls back to the
  // header instead of reporting `unknown`. A shipped preset is no longer a
  // degraded state: it is the capability-only identity.
  env.ctx.sessions.get = () => ({ header: { agentPreset: 'standard', cwd: env.workspace } })
  env.ctx.sessionQuery.readSession = async () => {
    throw new Error('unreadable log')
  }
  const fallback = await doctor.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(fallback, /PASS active-preset: standard \(capability-only/)

  // Only a preset that cannot be read at all still warns.
  env.ctx.sessions.get = () => ({ header: { cwd: env.workspace } })
  const unknown = await doctor.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(unknown, /WARN active-preset: current preset is unknown/)
  env.dispose()
})

test('keyword detection sets a mode and turn-stopping steers', async () => {
  const env = await setup('sisyphus')
  const session = { id: 'session-1' }
  // The real event shape for `user/message`: the MESSAGE is the event data — the
  // `{..., message}` wrapper belongs to assistant/system/tool records only
  // (`SessionEventMap['user/message'] = UserMessage` in dsh-session). A fixture
  // that wraps it makes the keyword hook read nothing and hides the bug.
  await emit(env.ctx, 'session/event', session, {
    type: 'user/message',
    data: {
      id: 'm-1',
      role: 'user',
      content: [{ type: 'text', text: 'ulw fix the parser' }],
      source: { kind: 'user' },
    },
  })
  const mode = JSON.parse(await fs.readFile(path.join(env.workspace, '.omd', 'runtime', 'session-1', 'mode.json'), 'utf8'))
  assert.equal(mode.mode, 'ultrawork')
  await emit(env.ctx, 'agent/turn-stopping', { agent: env.agent, turn: 1, signal: new AbortController().signal })
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD CONTINUATION/)
  env.dispose()
})

test('comment checker warns without blocking', async () => {
  const env = await setup('sisyphus')
  const listener = env.state.listeners.get('tools/post-execute')?.[0]
  assert.ok(listener)
  const decision = await listener(
    { name: 'write', arguments: { file_path: 'a.ts', content: '// increment\nx++\n' } },
    { isError: false },
    async () => ({ kind: 'accept' }),
  )
  assert.equal(decision.kind, 'accept')
  assert.ok(decision.additionalContexts?.length)
  assert.match(decision.additionalContexts[0].content[0].text, /comment checker/)
  env.dispose()
})

test('prometheus write scope guard denies outside .omd', async () => {
  const env = await setup('prometheus')
  const guard = env.state.guards[0]
  assert.ok(guard)
  const denied = guard({ name: 'write', arguments: { file_path: 'src/a.ts' } })
  assert.match(denied, /write scope/)
  const allowed = guard({ name: 'edit', arguments: { file_path: '.omd/plans/a.md' } })
  assert.equal(allowed, undefined)
  const notepad = guard({ name: 'write', arguments: { file_path: '.omd/notepads/x/learnings.md' } })
  assert.match(notepad, /append-only/)
  env.dispose()
})

test('task system tools are gated by configuration', async () => {
  const disabled = await setup('sisyphus')
  const create = disabled.state.tools.find((tool) => tool.name === 'omd_task_create')
  assert.ok(create)
  await assert.rejects(
    () => create.execute({ subject: 'x' }, { agent: disabled.agent, signal: new AbortController().signal }),
    /task system is disabled/,
  )
  assert.ok(disabled.state.restrictions.some((filter) => filter.deny?.some((name) => name.startsWith('omd_task_'))))
  disabled.dispose()

  const enabled = await setup('sisyphus', { config: { taskSystem: { enabled: true } } })
  const createEnabled = enabled.state.tools.find((tool) => tool.name === 'omd_task_create')
  const text = await createEnabled.execute(
    { subject: 'Run tests', blocked_by: [] },
    { agent: enabled.agent, signal: new AbortController().signal },
  )
  assert.match(text, /T-[a-f0-9]+/)
  assert.ok((await fs.stat(path.join(enabled.workspace, '.omd', 'tasks'))).isDirectory())
  assert.ok(enabled.state.restrictions.some((filter) => filter.deny?.includes('todo_write')))
  enabled.dispose()
})

test('session read tolerates the header-shaped snapshot and keeps user turns', async () => {
  const env = await setup('sisyphus')
  env.ctx.sessionQuery.readSession = async () => ({
    header: { id: 's1', cwd: env.workspace, createdAt: 0 },
    events: [
      // A `user/message` event's data IS the message (no `{message}` wrapper);
      // reading the wrapper dropped every user turn from the transcript.
      {
        type: 'user/message',
        data: { id: 'm-1', role: 'user', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } },
      },
      {
        type: 'assistant/message',
        data: { turn: 1, step: 1, message: { id: 'm-2', role: 'assistant', content: [{ type: 'text', text: 'hi there' }] } },
      },
    ],
  })
  const read = env.state.tools.find((tool) => tool.name === 'omd_session_read')
  const text = await read.execute({ session_id: 's1' }, { agent: env.agent, signal: new AbortController().signal })
  assert.match(text, /session: s1/)
  assert.match(text, /user: hello/)
  assert.match(text, /assistant: hi there/)
  env.dispose()
})

test('the handoff document keeps the user turns of the transcript', async () => {
  const env = await setup('sisyphus')
  env.ctx.sessionQuery.readSession = async () => ({
    header: { id: 's1', cwd: env.workspace, createdAt: 0 },
    events: [
      {
        type: 'user/message',
        data: { id: 'm-1', role: 'user', content: [{ type: 'text', text: 'ship the parser fix' }], source: { kind: 'user' } },
      },
      {
        type: 'assistant/message',
        data: { turn: 1, step: 1, message: { id: 'm-2', role: 'assistant', content: [{ type: 'text', text: 'on it' }] } },
      },
    ],
  })
  const handoff = env.state.commands.find((command) => command.name === 'omd-handoff')
  const result = await handoff.handler({ agent: env.agent, rawInput: '', signal: new AbortController().signal })
  assert.equal(result.kind, 'success')
  const file = /handoff written: (.+)/.exec(result.text)[1].trim()
  const body = await fs.readFile(file, 'utf8')
  assert.match(body, /user: ship the parser fix/, 'the handoff must carry the human instruction it hands over')
  assert.match(body, /assistant: on it/)
  env.dispose()
})

test('bundled skills and the workspace provider register', async () => {
  const env = await setup('sisyphus')
  assert.ok(env.state.skills.length >= 10)
  assert.ok(env.state.skills.some((skill) => skill.name === 'omd-ulw-plan'))
  assert.ok(env.state.skills.some((skill) => skill.name === 'omd-doctor'))
  assert.equal(env.state.providers.length, 1)
  assert.equal(env.state.providers[0].name, 'omd-workspace')
  env.dispose()
})

// ---------------------------------------------------------------------------
// The global runtime row: one mount, role resolved from the active preset
// ---------------------------------------------------------------------------

/**
 * Mount the row the way `presets/omd-runtime.patch.yml` does: no `agent` key at
 * all. The role then has to come from the session's preset.
 */
async function setupGlobal({ preset = 'standard', config, events, agentOptions } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-global-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  if (config) {
    await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
    await fs.writeFile(path.join(workspace, '.omd', 'config.jsonc'), JSON.stringify(config))
  }
  const { ctx, agent: agentHandle, state } = createFakeContext({ cwd: workspace, agentPreset: preset, events })
  if (agentOptions) {
    Object.assign(agentHandle.options, agentOptions)
    agentHandle.session.header.origin = 'subagent'
    agentHandle.session.header.parentSession = 'parent-session'
  }
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent: agentHandle })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { root, workspace, ctx, agent: agentHandle, state, dispose }
}

test('the global row registers the whole surface for a preset that is not an OMD one', async () => {
  const env = await setupGlobal({ preset: 'standard' })
  const names = env.state.tools.map((tool) => tool.name)
  // The capability set is registered once, for every preset.
  assert.ok(names.includes('omd_status'))
  assert.ok(names.includes('omd_mode'))
  assert.ok(names.includes('omd_delegate'), 'orchestration must be available outside OMD presets')
  assert.ok(names.includes('omd_doctor'))
  assert.ok(env.state.skills.some((skill) => skill.name === 'omd-ulw-execute'), 'ultrawork skills ship globally')
  assert.ok(env.state.commands.some((command) => command.name === 'omd-ulw'))
  env.dispose()
})

test('a non-OMD preset is capability-only: orchestration, but no persona and no role policy', async () => {
  const env = await setupGlobal({ preset: 'standard' })
  const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
  assert.ok(persona, 'the section still exists so the prompt composes')
  assert.equal(persona.text(), '', 'capability-only must inject no OMD persona')

  // Nothing restricts a session that has no role.
  assert.equal(
    env.state.restrictions.some((filter) => filter.deny?.includes('write')),
    false,
    'a capability-only session keeps its own write tools',
  )

  // Ultrawork is the point of the change, so drive it end to end.
  const mode = env.state.tools.find((tool) => tool.name === 'omd_mode')
  const set = await mode.execute(
    { action: 'set', mode: 'ultrawork' },
    { agent: env.agent, signal: new AbortController().signal },
  )
  assert.match(set, /ultrawork/)
  const saved = JSON.parse(
    await fs.readFile(path.join(env.workspace, '.omd', 'runtime', 'session-1', 'mode.json'), 'utf8'),
  )
  assert.equal(saved.mode, 'ultrawork')

  const status = env.state.tools.find((tool) => tool.name === 'omd_status')
  const board = await status.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(board, /ultrawork/)
  env.dispose()
})

test('the restriction is lifted again when the preset leaves the OMD roles', async () => {
  const env = await setupGlobal({ preset: 'standard' })
  const deniesWrite = () => env.state.restrictions.some((filter) => filter.deny?.includes('write'))
  assert.equal(deniesWrite(), false, 'capability-only starts unrestricted')

  env.ctx.sessions.get = () => ({
    header: { agentPreset: 'standard', cwd: env.workspace },
    ownEvents: () => [{ type: 'agent-preset/selected', data: { agentPreset: 'omd-oracle' } }],
  })
  await emit(env.ctx, 'agent-preset/selected', 'session-1', 'omd-oracle')
  assert.equal(deniesWrite(), true, 'the read-only role is enforced')

  // Switching back while the session is still blank must dispose the role
  // policy, not stack another one on top of it.
  await emit(env.ctx, 'agent-preset/selected', 'session-1', 'standard')
  assert.equal(deniesWrite(), false, 'the old role restriction must be lifted')
  const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
  assert.equal(persona.text(), '')
  env.dispose()
})

test('omd_look_at registers even when the row cannot resolve the agent services yet', async () => {
  // A top-level runtime row is applied before `attachments` and `fs` resolve
  // from its context. Probing them at registration time silently dropped the
  // tool, so the check moved to call time and resolves through the Agent.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-lookat-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
  await fs.writeFile(
    path.join(workspace, '.omd', 'config.jsonc'),
    JSON.stringify({
      agents: { 'multimodal-looker': { provider: 'vision-provider', model: 'vision-model', reasoningEffort: 'high' } },
    }),
  )
  const { ctx, agent: agentHandle, state } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  for (const name of ['read', 'write', 'edit']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const attachments = ctx.attachments
  const fsService = ctx.fs
  // Root context: agent-scoped services are not resolvable yet.
  ctx.get = (name) => (name === 'attachments' || name === 'fs' ? undefined : ctx[name])
  // Agent context: they are.
  agentHandle.ctx.get = (name) =>
    name === 'attachments' ? attachments : name === 'fs' ? fsService : ctx[name]

  const dispose = apply(ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent: agentHandle })
  await new Promise((resolve) => setTimeout(resolve, 10))

  const look = state.tools.find((tool) => tool.name === 'omd_look_at')
  assert.ok(look, 'the looker tool must register from the top-level row')
  const result = await look.execute(
    { paths: ['a.png'], prompt: 'what is this' },
    { agent: agentHandle, signal: new AbortController().signal },
  )
  assert.match(result, /child result/)
  // The looker child's role rides the descriptor label exactly as a delegated
  // child's does, and its preset is left to configuration. Both were unasserted
  // once: a bogus label plus a bogus pinned preset kept this whole suite green,
  // which would have shipped a looker with no role and an unresolvable preset.
  const activation = state.activations[0]
  assert.equal(activation.label, 'omd:multimodal-looker')
  assert.deepEqual(
    activation.request.agentOptions,
    { provider: 'vision-provider', model: 'vision-model', reasoningEffort: 'high' },
    'the looker child must start on the configured role route, not the parent model',
  )
  assert.equal(
    Object.hasOwn(activation.request, 'agentPreset'),
    false,
    'the looker preset is omitted by default so the child inherits the parent one',
  )
  dispose()
})

test('the step-boundary retry picks up a descriptor that lands after the session starts', async () => {
  // The role is resolved from the session's own log, and nothing orders that
  // read against the descriptor's append. On the shipped spawn path the append
  // happens inside the child's `setup`, before `agent/created`, so the first
  // resolution already sees it — this covers the provider that writes later.
  //
  // The whole refresh path used to be unexercised: neutering the listener left
  // the entire suite green, so nothing noticed if it stopped working.
  const env = await setupGlobal({ preset: 'standard' })
  try {
    const runtime = env.dispose.runtime
    // Started with no descriptor at all: capability-only, exactly like a root session.
    assert.equal(await runtime.roleFor(env.agent), null)

    const late = [{ type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'omd:oracle' } }]
    env.ctx.sessions.get = () => ({ header: { agentPreset: 'standard', cwd: env.workspace }, ownEvents: () => late })

    await emitWaterfall(env.ctx, 'agent/pre-step', { agent: env.agent }, async () => ({ kind: 'enter' }))

    assert.equal(await runtime.roleFor(env.agent), 'oracle', 'the retry must adopt the descriptor role')
    const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
    assert.match(persona.text(), /Oracle/, 'and re-apply the role persona')

    // Bounded: a second boundary must not read the log again, so a genuinely
    // role-less session does not pay for this on every step of its life.
    const before = env.ctx.sessions.get
    let reads = 0
    env.ctx.sessions.get = (...args) => {
      reads += 1
      return before(...args)
    }
    await emitWaterfall(env.ctx, 'agent/pre-step', { agent: env.agent }, async () => ({ kind: 'enter' }))
    assert.equal(reads, 0, 'the retry is one-shot')
  } finally {
    env.dispose()
  }
})

test('an unknown subagent_type is refused instead of silently writing a rol-less label', async () => {
  const env = await setupGlobal({ preset: 'standard' })
  try {
    const delegate = env.state.tools.find((tool) => tool.name === 'omd_delegate')
    await assert.rejects(
      () =>
        delegate.execute(
          { prompt: 'do it', subagent_type: 'not-a-role', run_in_background: true },
          { agent: env.agent, signal: new AbortController().signal },
        ),
      /unknown subagent_type: not-a-role/,
    )
    assert.equal(env.state.activations.length, 0, 'nothing may be spawned for a role that does not exist')
  } finally {
    env.dispose()
  }
})

test('capability-only inherits no role override', async () => {
  // `agents.<id>` is keyed by role. A capability-only session has no role, so a
  // per-role `promptAppend` must not reach it — which is what a lookup miss
  // falling back to another role's defaults would have done.
  const env = await setupGlobal({
    preset: 'standard',
    config: { agents: { sisyphus: { promptAppend: 'SISYPHUS-ONLY APPEND' } } },
  })
  const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
  assert.equal(persona.text(), '', 'a role override must not leak into capability-only')
  assert.equal(env.state.tools.some((tool) => tool.name === 'omd_delegate'), true)
  env.dispose()
})

test('an OMD preset still resolves to its role under the global row', async () => {
  const env = await setupGlobal({ preset: 'omd-atlas' })
  const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
  assert.match(persona.text(), /Atlas/)
  // Atlas is the read-only conductor: it delegates, but it does not write.
  assert.ok(
    env.state.restrictions.some((filter) => filter.deny?.includes('write') && filter.deny?.includes('edit')),
    'the role policy is applied per agent',
  )
  assert.ok(env.state.tools.some((tool) => tool.name === 'omd_delegate'))
  env.dispose()
})

test('the policy follows the picker when the preset changes under a global row', async () => {
  const env = await setupGlobal({ preset: 'standard' })
  const persona = env.state.sections.find((section) => section.name === 'deployment:persona-prefix')
  assert.equal(persona.text(), '')

  // The picker choice arrives after creation, as an `agent-preset/selected`.
  env.ctx.sessions.get = () => ({
    header: { agentPreset: 'standard', cwd: env.workspace },
    ownEvents: () => [{ type: 'agent-preset/selected', data: { agentPreset: 'omd-prometheus' } }],
  })
  await emit(env.ctx, 'agent-preset/selected', 'session-1', 'omd-prometheus')

  assert.match(persona.text(), /Prometheus/, 'the persona must follow the switch')
  // Prometheus may only write inside `.omd/`, enforced by the tool guard whose
  // closure reads the role at call time.
  const guard = env.state.guards[0]
  assert.ok(guard)
  assert.match(guard({ name: 'write', arguments: { file_path: 'src/a.ts' } }), /write scope/)
  assert.equal(guard({ name: 'edit', arguments: { file_path: '.omd/plans/a.md' } }), undefined)
  env.dispose()
})

// Model routing and fallback

async function waitFor(predicate, timeout = 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for the runtime')
}

const CHAIN_CONFIG = {
  models: {
    catalog: {
      strong: { provider: 'primary-provider', model: 'primary-model', reasoningEffort: 'max' },
      backup: { provider: 'backup-provider', model: 'backup-model' },
    },
  },
  agents: {
    oracle: { chain: ['strong', 'backup'] },
  },
  categories: {
    quick: { chain: ['backup', 'strong'] },
  },
}

test('model routing selects the primary chain route through agent.model.select', async () => {
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    assert.deepEqual(env.state.modelSelections.at(-1), {
      provider: 'primary-provider',
      model: 'primary-model',
      reasoningEffort: 'max',
    })
    // The deprecated agent/request hook must not try to change provider/model:
    // DSH rejects such a step before it commits input.
    const seed = { provider: 'primary-provider', model: 'primary-model', reasoningEffort: 'max' }
    const proposal = await emitWaterfall(env.ctx, 'agent/request', { agent: env.agent }, seed)
    assert.deepEqual(proposal, seed)
  } finally {
    env.dispose()
  }
})

test('a delegated category session selects the category chain, not the junior role chain', async () => {
  const env = await setupGlobal({
    preset: 'standard',
    events: [descriptorEvent('sisyphus-junior', 'quick')],
    config: {
      ...CHAIN_CONFIG,
      agents: { 'sisyphus-junior': { chain: ['strong'] } },
    },
  })
  try {
    assert.equal(env.dispose.runtime.states.get(env.agent.id).category, 'quick')
    assert.deepEqual(env.state.modelSelections.at(-1), {
      provider: 'backup-provider',
      model: 'backup-model',
    })
  } finally {
    env.dispose()
  }
})

test('a delegated creation route outranks the configured primary and keeps the fallbacks', async () => {
  const env = await setupGlobal({
    preset: 'standard',
    events: [descriptorEvent('oracle')],
    agentOptions: { provider: 'creation-provider', model: 'creation-model' },
    config: {
      models: {
        catalog: {
          backup: { provider: 'backup-provider', model: 'backup-model' },
          third: { provider: 'third-provider', model: 'third-model' },
        },
      },
      agents: {
        oracle: {
          chain: [
            { provider: 'invalid-provider', model: 'invalid-model' },
            'backup',
            'third',
          ],
        },
      },
    },
  })
  try {
    assert.deepEqual(env.state.modelSelections.at(-1), {
      provider: 'creation-provider',
      model: 'creation-model',
    })
    await emitWaterfall(
      env.ctx,
      'agent/request-error',
      { failure: { code: 'PROVIDER_ERROR' }, signal: new AbortController().signal },
      undefined,
    )
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await waitFor(() => env.state.followups.length === 1)
    assert.deepEqual(env.state.modelSelections.at(-1), {
      provider: 'backup-provider',
      model: 'backup-model',
    })
  } finally {
    env.dispose()
  }
})

test('a failed model request advances to the next chain step and starts a fallback turn', async () => {
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    assert.equal(env.state.followups.length, 0)
    const signal = new AbortController().signal
    const decision = await emitWaterfall(
      env.ctx,
      'agent/request-error',
      { failure: { code: 'PROVIDER_ERROR', message: 'provider is down' }, signal },
      undefined,
    )
    assert.equal(decision, undefined, 'no in-place retry: the route is fixed for this step')
    assert.equal(env.state.followups.length, 0, 'the fallback waits for the failed turn to close')

    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await waitFor(() => env.state.followups.length === 1)
    assert.deepEqual(env.state.modelSelections.at(-1), {
      provider: 'backup-provider',
      model: 'backup-model',
    })
    const message = env.state.followups[0]
    assert.equal(message.role, 'user')
    assert.equal(message.source.kind, 'omd')
    assert.equal(message.source.form, 'model-fallback')
    assert.match(message.content[0].text, /backup-provider\/backup-model/)
    assert.match(message.content[0].text, /PROVIDER_ERROR/)
    assert.ok(message.id.length > 0)
  } finally {
    env.dispose()
  }
})

test('a completed fallback turn selects the primary route for the next turn', async () => {
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    await emitWaterfall(
      env.ctx,
      'agent/request-error',
      { failure: { code: 'PROVIDER_ERROR' }, signal: new AbortController().signal },
      undefined,
    )
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await waitFor(() => env.state.modelSelections.length >= 2)

    await emit(env.ctx, 'agent/turn-stopping', { agent: env.agent })
    assert.deepEqual(env.state.modelSelections.at(-1), {
      provider: 'primary-provider',
      model: 'primary-model',
      reasoningEffort: 'max',
    })
  } finally {
    env.dispose()
  }
})

test('an outer always-retry policy owns the attempt and suppresses the fallback turn', async () => {
  // The shipped `llm-retry` row is mounted at boot, so it is OUTER in the
  // request-error waterfall relative to OMD's per-agent listener. In `always`
  // mode it calls downstream recovery first and then retries unconditionally;
  // OMD must not stage a fallback turn that would run after the retry succeeds.
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    const listeners = env.ctx.state.listeners.get('agent/request-error') ?? []
    const outer = async (_payload, next) => {
      const decision = await next()
      assert.equal(decision, undefined)
      return { kind: 'retry' }
    }
    listeners.unshift(outer)
    try {
      const decision = await emitWaterfall(
        env.ctx,
        'agent/request-error',
        { failure: { code: 'RATE_LIMIT' }, retryPolicy: { mode: 'always' }, signal: new AbortController().signal },
        undefined,
      )
      assert.deepEqual(decision, { kind: 'retry' })
      await emit(env.ctx, 'agent/status', { status: 'idle' })
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(env.state.followups.length, 0, 'a retried attempt is not also a fallback turn')
    } finally {
      listeners.splice(listeners.indexOf(outer), 1)
    }
  } finally {
    env.dispose()
  }
})

test('a user-aborted failed turn never wakes a fallback', async () => {
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    const controller = new AbortController()
    await emitWaterfall(
      env.ctx,
      'agent/request-error',
      { failure: { code: 'PROVIDER_ERROR' }, signal: controller.signal },
      undefined,
    )
    controller.abort()
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(env.state.followups.length, 0)
    assert.equal(env.state.modelSelections.length, 1, 'only the primary selection was recorded')
  } finally {
    env.dispose()
  }
})

test('an aborted request never falls back', async () => {
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    await emitWaterfall(
      env.ctx,
      'agent/request-error',
      { failure: { code: 'ABORTED' }, signal: new AbortController().signal },
      undefined,
    )
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(env.state.followups.length, 0)
    assert.equal(env.state.modelSelections.length, 1, 'only the primary selection was recorded')
  } finally {
    env.dispose()
  }
})

test('an exhausted chain does not queue another turn', async () => {
  const env = await setup('oracle', { config: CHAIN_CONFIG })
  try {
    const signal = new AbortController().signal
    await emitWaterfall(env.ctx, 'agent/request-error', { failure: { code: 'PROVIDER_ERROR' }, signal }, undefined)
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await waitFor(() => env.state.followups.length === 1)
    assert.deepEqual(env.state.modelSelections.at(-1), { provider: 'backup-provider', model: 'backup-model' })

    // The fallback turn fails too: there is no third step, so the error stays
    // terminal and no further continuation is queued.
    await emitWaterfall(env.ctx, 'agent/request-error', { failure: { code: 'PROVIDER_ERROR' }, signal }, undefined)
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(env.state.followups.length, 1)
    assert.equal(env.state.modelSelections.length, 2)
  } finally {
    env.dispose()
  }
})

test('hooks.modelRouting=false disables both the selection and the fallback', async () => {
  const env = await setup('oracle', {
    config: { ...CHAIN_CONFIG, hooks: { modelRouting: false } },
  })
  try {
    assert.equal(env.state.modelSelections.length, 0)
    await emitWaterfall(
      env.ctx,
      'agent/request-error',
      { failure: { code: 'PROVIDER_ERROR' }, signal: new AbortController().signal },
      undefined,
    )
    await emit(env.ctx, 'agent/status', { status: 'idle' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(env.state.followups.length, 0)
  } finally {
    env.dispose()
  }
})


import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

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
  assert.match(persona.text, /Oracle/)
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
  // header instead of reporting `unknown`.
  env.ctx.sessions.get = () => ({ header: { agentPreset: 'standard', cwd: env.workspace } })
  env.ctx.sessionQuery.readSession = async () => {
    throw new Error('unreadable log')
  }
  const fallback = await doctor.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(fallback, /WARN active-preset: current preset is standard/)
  env.dispose()
})

test('keyword detection sets a mode and turn-stopping steers', async () => {
  const env = await setup('sisyphus')
  const session = { id: 'session-1' }
  await emit(
    env.ctx,
    'session/event',
    session,
    { type: 'user/message', data: { message: { content: [{ type: 'text', text: 'ulw fix the parser' }] } } },
  )
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

test('session read tolerates the header-shaped snapshot', async () => {
  const env = await setup('sisyphus')
  env.ctx.sessionQuery.readSession = async () => ({
    header: { id: 's1', cwd: env.workspace, createdAt: 0 },
    events: [
      { type: 'user/message', data: { message: { content: [{ type: 'text', text: 'hello' }] } } },
    ],
  })
  const read = env.state.tools.find((tool) => tool.name === 'omd_session_read')
  const text = await read.execute({ session_id: 's1' }, { agent: env.agent, signal: new AbortController().signal })
  assert.match(text, /session: s1/)
  assert.match(text, /user: hello/)
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

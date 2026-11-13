/**
 * The ultrawork gates that used to exist only in the mode prompt.
 *
 * `requirePlanGate` and `dualEvidence` were schema keys the runtime never read,
 * and "run a baseline before editing" had no mechanism at all. These tests pin
 * the enforcement: the tool guard refuses deliverable writes, the post-execute
 * tally records verification and artifact writes, and the turn-stopping hook
 * keeps a turn open only while work or evidence is missing.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { detectMode } from '../src/hooks/keyword.js'
import {
  isDeliverableFile,
  isVerificationCommand,
  qualifyingPlan,
  resultFailed,
} from '../src/hooks/ultrawork.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

async function setup({ config } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-ulw-gates-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  if (config) {
    await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
    await fs.writeFile(path.join(workspace, '.omd', 'config.jsonc'), JSON.stringify(config))
  }
  const { ctx, agent, state } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent: 'sisyphus' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { root, workspace, ctx, agent, state, dispose }
}

async function setUltrawork(env) {
  const tool = env.state.tools.find((entry) => entry.name === 'omd_mode')
  await tool.execute({ action: 'set', mode: 'ultrawork' }, { agent: env.agent, signal: new AbortController().signal })
}

function guard(env, file, name = 'write') {
  return env.state.guards[0]({ name, arguments: { file_path: file } })
}

async function post(env, exec, result) {
  const listener = env.state.listeners.get('tools/post-execute')?.[0]
  assert.ok(listener, 'tools/post-execute listener is installed')
  return listener(exec, result, async () => ({ kind: 'accept' }))
}

function textResult(text) {
  return { content: [{ type: 'text', text }] }
}

async function writePlan(env, { status = 'active', tasks = 1, checked = 0, slug = 'demo' } = {}) {
  const dir = path.join(env.workspace, '.omd', 'plans')
  await fs.mkdir(dir, { recursive: true })
  const lines = ['---', `plan: "${slug}"`, `status: ${status}`, 'created: 2026-11-13', '---', '', `# Plan: ${slug}`, '', '## TODOs', '']
  for (let index = 1; index <= tasks; index += 1) {
    lines.push(`- [${index <= checked ? 'x' : ' '}] ${index}. Task ${index}`, '  Recommended task executor category: deep')
  }
  await fs.writeFile(path.join(dir, `${slug}.md`), lines.join('\n'))
}

async function stop(env) {
  await emit(env.ctx, 'agent/turn-stopping', { agent: env.agent, turn: 1, signal: new AbortController().signal })
}

// Helpers

test('verification commands are recognized and failed results are detected', () => {
  for (const command of ['npm test', 'npm run check', 'pnpm run test', 'node --test tests/', 'node scripts/check.mjs', 'pytest -q', 'go test ./...', 'cargo test']) {
    assert.equal(isVerificationCommand(command), true, command)
  }
  // The bundled Node is invoked by absolute path with shell quoting.
  assert.equal(isVerificationCommand(`& 'C:\\Users\\Loren\\.dsh\\runtime\\node.exe' --test "tests/**/*.test.mjs"`), true)
  assert.equal(isVerificationCommand(`& 'C:\\node.exe' scripts/check.mjs`), true)
  for (const command of ['git status', 'npm install', 'node app.js', 'echo test']) {
    assert.equal(isVerificationCommand(command), false, command)
  }
  assert.equal(resultFailed({ isError: true }), true)
  assert.equal(resultFailed(textResult('boom\n[exit code: 1]')), true)
  assert.equal(resultFailed(textResult('ok\n[exit code: 0]')), false)
  assert.equal(resultFailed(textResult('all good')), false)
  // A run that timed out or was killed is a successful tool call with no
  // numeric exit code; it must not count as evidence.
  assert.equal(resultFailed(textResult('(no output)\n[timed out after 120000ms]\n[exit code: null]')), true)
  assert.equal(resultFailed(textResult('partial\n[killed by signal: SIGKILL]')), true)
  // A command that merely prints the marker text is not a failed run.
  assert.equal(resultFailed(textResult('docs say [exit code: 1] in a paragraph')), false)
})

test('deliverable files are workspace files outside .omd', () => {
  const workspace = 'E:\\ws'
  assert.equal(isDeliverableFile(workspace, 'src/a.js'), true)
  assert.equal(isDeliverableFile(workspace, path.join(workspace, 'docs', 'a.md')), true)
  assert.equal(isDeliverableFile(workspace, '.omd/tmp/a.py'), false)
  assert.equal(isDeliverableFile(workspace, path.join(workspace, '.omd', 'plans', 'x.md')), false)
  assert.equal(isDeliverableFile(workspace, 'E:\\other\\a.js'), false)
})

test('a draft plan or a plan without task rows does not qualify', async () => {
  const env = await setup()
  assert.equal(qualifyingPlan(env.workspace), null)
  await writePlan(env, { status: 'draft' })
  assert.equal(qualifyingPlan(env.workspace), null)
  await writePlan(env, { slug: 'empty', tasks: 0, status: 'active' })
  assert.equal(qualifyingPlan(env.workspace), null)
  await writePlan(env, { slug: 'real', status: 'active', tasks: 2 })
  assert.ok(qualifyingPlan(env.workspace))
  env.dispose()
})

// Plan gate

test('the plan gate refuses deliverable writes until a plan exists', async () => {
  const env = await setup({ config: { ultrawork: { requireBaseline: false } } })
  await setUltrawork(env)
  assert.match(guard(env, 'src/a.js'), /plan gate/)
  assert.match(guard(env, 'docs/readme.md', 'edit'), /plan gate/)
  assert.equal(guard(env, '.omd/tmp/scratch.py'), undefined, '.omd scratch is exempt')
  assert.equal(guard(env, path.join(env.root, 'outside.txt')), undefined, 'outside the workspace is exempt')
  await writePlan(env)
  assert.equal(guard(env, 'src/a.js'), undefined, 'a non-draft plan with task rows satisfies the gate')
  env.dispose()
})

test('a plan from before this ultrawork run does not satisfy the plan gate', async () => {
  const env = await setup({ config: { ultrawork: { requireBaseline: false } } })
  await writePlan(env, { slug: 'old' })
  await new Promise((resolve) => setTimeout(resolve, 10))
  await setUltrawork(env)
  assert.match(guard(env, 'src/a.js'), /plan gate/, 'a plan left over from an earlier session does not unlock a new run')
  await writePlan(env, { slug: 'fresh' })
  assert.equal(guard(env, 'src/a.js'), undefined)
  env.dispose()
})

test('the plan gate does not apply outside ultrawork or when disabled', async () => {
  const idle = await setup()
  assert.equal(guard(idle, 'src/a.js'), undefined)
  idle.dispose()

  const disabled = await setup({ config: { ultrawork: { requirePlanGate: false, requireBaseline: false } } })
  await setUltrawork(disabled)
  assert.equal(guard(disabled, 'src/a.js'), undefined)
  disabled.dispose()
})

// Baseline gate

test('the baseline gate refuses the first deliverable edit until a verification command runs', async () => {
  const env = await setup({ config: { ultrawork: { requirePlanGate: false } } })
  await setUltrawork(env)
  assert.match(guard(env, 'src/a.js'), /baseline gate/)
  await post(env, { name: 'pwsh', arguments: { command: 'npm test' } }, textResult('ok'))
  assert.equal(guard(env, 'src/a.js'), undefined)
  env.dispose()
})

test('a failing baseline still counts: the point is to know the starting state', async () => {
  const env = await setup({ config: { ultrawork: { requirePlanGate: false } } })
  await setUltrawork(env)
  await post(env, { name: 'pwsh', arguments: { command: 'npm test' } }, textResult('boom\n[exit code: 1]'))
  assert.equal(guard(env, 'src/a.js'), undefined)
  env.dispose()
})

// Dual evidence

test('dual evidence keeps the turn open until a successful verification is recorded', async () => {
  const env = await setup()
  await setUltrawork(env)
  await post(env, { name: 'write', arguments: { file_path: 'src/a.js' } }, textResult('written'))
  await stop(env)
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD DUAL EVIDENCE/)

  await post(env, { name: 'pwsh', arguments: { command: 'npm run check' } }, textResult('check ok'))
  await stop(env)
  assert.equal(env.state.steers.length, 1, 'a completed, verified turn closes without another steer')
  env.dispose()
})

test('a failing verification is not evidence and keeps the turn open', async () => {
  const env = await setup()
  await setUltrawork(env)
  await post(env, { name: 'write', arguments: { file_path: 'src/a.js' } }, textResult('written'))
  await post(env, { name: 'pwsh', arguments: { command: 'npm test' } }, textResult('fail\n[exit code: 2]'))
  await stop(env)
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD DUAL EVIDENCE/)
  env.dispose()
})

test('a baseline run from before the write does not satisfy dual evidence', async () => {
  const env = await setup()
  await setUltrawork(env)
  await post(env, { name: 'pwsh', arguments: { command: 'npm test' } }, textResult('ok'))
  await post(env, { name: 'write', arguments: { file_path: 'src/a.js' } }, textResult('written'))
  await stop(env)
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD DUAL EVIDENCE/)
  env.dispose()
})

test('a write after the last verification reopens the evidence gate', async () => {
  const env = await setup()
  await setUltrawork(env)
  await post(env, { name: 'write', arguments: { file_path: 'src/a.js' } }, textResult('written'))
  await post(env, { name: 'pwsh', arguments: { command: 'npm test' } }, textResult('ok'))
  await post(env, { name: 'edit', arguments: { file_path: 'src/b.js' } }, textResult('edited'))
  await stop(env)
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD DUAL EVIDENCE/)
  env.dispose()
})

test('a completed plan with no evidence keeps the turn open', async () => {
  const env = await setup()
  await setUltrawork(env)
  await writePlan(env, { status: 'complete', tasks: 1, checked: 1 })
  const dir = path.join(env.workspace, '.omd', 'boulder')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'session-1.json'),
    JSON.stringify({ schema: 1, stem: 'session-1', session_ids: [], active_plan: 'demo', plan_name: 'demo', status: 'active' }),
  )
  await stop(env)
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD DUAL EVIDENCE/)
  env.dispose()
})

test('ultrawork with nothing written still pushes for a first concrete step', async () => {
  const env = await setup()
  await setUltrawork(env)
  await stop(env)
  assert.equal(env.state.steers.length, 1)
  assert.match(env.state.steers[0].content[0].text, /OMD CONTINUATION/)
  env.dispose()
})

// Keyword detection

test('mode keywords only fire in directive position', () => {
  assert.equal(detectMode('ulw fix the parser'), 'ultrawork')
  assert.equal(detectMode('ULW: fix it'), 'ultrawork')
  assert.equal(detectMode('/ulw fix it'), 'ultrawork')
  assert.equal(detectMode('[ultrawork] fix it'), 'ultrawork')
  assert.equal(detectMode('ultrawork'), 'ultrawork')
  assert.equal(detectMode('team: review this'), 'team')
  assert.equal(detectMode('[team] review this'), 'team')
  assert.equal(detectMode('hyperplan: harden this'), 'hyperplan')
  assert.equal(detectMode('hyperplan-ulw: do both'), 'hyperplan-ulw')

  assert.equal(detectMode('检查 session 是否正确使用了 omd 的 ultrawork 模式'), null)
  assert.equal(detectMode('please use ultrawork for this'), null)
  assert.equal(detectMode('the team reviewed the change'), null)
  assert.equal(detectMode('a message about hyperplan'), null)
  assert.equal(detectMode('```\nulw\n```'), null)
  assert.equal(detectMode('`ulw` fix it'), null)
  assert.equal(detectMode('mass ulw'), null)
})

test('a disabled keyword no longer selects its mode', () => {
  assert.equal(detectMode('ulw fix it', { ultrawork: false }), null)
  assert.equal(detectMode('team: review', { team: false }), null)
  assert.equal(detectMode('hyperplan: harden', { hyperplan: false }), null)
})

// omd_ui_status loader scan

test('omd_ui_status scans iterable loader entries instead of failing', async () => {
  const env = await setup()
  env.ctx.clientModules = {
    clientPath: () => 'E:\\Oh-My-DSH\\ui\\client.js',
    graph: () => ({ entries: [{ id: 'omd-ui' }], batches: [] }),
  }
  const tool = env.state.tools.find((entry) => entry.name === 'omd_ui_status')
  assert.ok(tool)

  env.ctx.loader = { entries: () => new Map([['omd-ui', { options: { name: 'omd-ui' }, disabled: false, fiber: {} }]]) }
  const mapText = await tool.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(mapText, /loader rows for the bundle \(1\)/)
  assert.match(mapText, /omd-ui disabled=false fiber=live/)
  assert.doesNotMatch(mapText, /loader scan failed/)

  env.ctx.loader = {
    entries: function* entries() {
      yield { options: { name: '@jhcai11/oh-my-dsh' }, disabled: true }
    },
  }
  const generatorText = await tool.execute({}, { agent: env.agent, signal: new AbortController().signal })
  assert.match(generatorText, /loader rows for the bundle \(1\)/)
  assert.match(generatorText, /@jhcai11\/oh-my-dsh disabled=true fiber=none/)
  assert.doesNotMatch(generatorText, /loader scan failed/)
  env.dispose()
})

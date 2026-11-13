/**
 * Regression tests for two state defects recorded in
 * `docs/feature-verification-2026-11-13.md`:
 *
 * D3 — `/omd-stop-continuation` on a session that never ran `/omd-start-work`
 *      manufactured `.omd/boulder/<stem>.json` (`status:"paused"`,
 *      `active_plan:null`) and refreshed the derived view, so the board reported
 *      an open paused boulder nobody had created. The fix reads the slot first:
 *      missing means "nothing to pause", reports it honestly, and writes nothing.
 *
 * D12 — a soft-deleted (`status:"deleted"`) task was still counted by
 *      `TaskStore.summary()`, and a deleted task with blockers counted as
 *      blocked, so the board kept showing work that `omd_task_list` already
 *      labels `[deleted]`.
 *
 * Both tests drive the production registration path (`src/runtime/index.js#apply`
 * and its commands/tools) against a real temp workspace, then assert from disk.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { boulderSlotPath, writeBoulderView } from '../src/state/boulder.js'
import { TaskStore } from '../src/state/tasks.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

const TASK_LINE = /^tasks: (\d+) total, (\d+) in progress, (\d+) done, (\d+) blocked$/m

function planDoc(title) {
  return [
    '---',
    `plan: ${JSON.stringify(title)}`,
    'status: approved',
    'created: 2026-11-13',
    '---',
    '',
    `# Plan: ${title}`,
    '',
    '## TODOs',
    '',
    '- [ ] 1. Only task',
    '  Recommended task executor category: deep',
    '',
  ].join('\n')
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function readdirNames(dir) {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function readLedger(workspace) {
  const text = await fs.readFile(path.join(workspace, '.omd', 'ledger.jsonl'), 'utf8')
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

async function setup({ config, preset = 'omd-sisyphus', agent = 'sisyphus' } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-state-fixes-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  if (config) {
    await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
    await fs.writeFile(path.join(workspace, '.omd', 'config.jsonc'), JSON.stringify(config))
  }
  const { ctx, agent: agentHandle, state } = createFakeContext({ cwd: workspace, agentPreset: preset })
  // The base DSH tools every real preset also mounts.
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent: agentHandle })
  await new Promise((resolve) => setTimeout(resolve, 10))

  const command = (name) => {
    const definition = state.commands.find((candidate) => candidate.name === name)
    assert.ok(definition, `${name} must be registered by the runtime row`)
    return definition
  }
  const invoke = (name, rawInput = '') =>
    command(name).handler({ agent: agentHandle, rawInput, signal: new AbortController().signal })
  const tool = (name) => {
    const definition = state.tools.find((candidate) => candidate.name === name)
    assert.ok(definition, `${name} must be registered by the runtime row`)
    return (args) => definition.execute(args, { agent: agentHandle, signal: new AbortController().signal })
  }
  return { root, workspace, ctx, agent: agentHandle, state, dispose, runtime: dispose.runtime, invoke, tool }
}

// D3: a stop must not manufacture a boulder.

test('D3: stop-continuation with no boulder pauses nothing, says so, and writes nothing', async () => {
  const env = await setup()
  try {
    const receipt = await env.invoke('omd-stop-continuation')
    assert.equal(receipt.kind, 'success')
    assert.equal(
      receipt.text,
      'continuations stopped; no boulder to pause; no active goal',
      'the receipt must report the effect that actually happened',
    )

    // The defect: a phantom `.omd/boulder/<stem>.json` (status "paused",
    // active_plan null) plus a refreshed derived view.
    const boulderDir = path.join(env.workspace, '.omd', 'boulder')
    assert.deepEqual(await readdirNames(boulderDir), [], 'a stop must not write a boulder slot')
    assert.equal(
      await exists(path.join(env.workspace, '.omd', 'boulder.json')),
      false,
      'a stop must not refresh the derived view for a boulder that never existed',
    )

    // Stopping is still an event, and the session is still marked stopped.
    assert.equal((await readLedger(env.workspace)).filter((line) => line.event === 'stop-continuation').length, 1)
    const state = await env.runtime.stateFor(env.agent)
    assert.equal(state.mode, null, 'the mode is still cleared')
    assert.equal(state.stopped, true)

    // A board refreshed from disk reports idle, not an open paused boulder.
    const view = await writeBoulderView(env.workspace)
    assert.equal(view.open_count, 0)
    assert.deepEqual(view.open_stems, [])
    assert.equal(view.status, 'idle')
    const viewOnDisk = await readJson(path.join(env.workspace, '.omd', 'boulder.json'))
    assert.equal(viewOnDisk.open_count, 0)
    assert.equal(viewOnDisk.status, 'idle')

    const board = await env.invoke('omd-status')
    assert.equal(board.kind, 'success')
    assert.match(board.text, /^boulder: none$/m, 'the board must not report a boulder that was never started')
    assert.match(board.text, /^plans: 0 {2}open boulders: 0$/m)

    // The same holds once the `.omd` layout exists, which is the common case: a
    // real session runs `/omd-init` long before it ever considers a boulder.
    await env.invoke('omd-init')
    assert.equal(await exists(boulderDir), true, 'omd-init created the boulder directory')
    const second = await env.invoke('omd-stop-continuation')
    assert.equal(second.text, 'continuations stopped; no boulder to pause; no active goal')
    assert.deepEqual(await readdirNames(boulderDir), [], 'even with the directory present, no slot is written')
  } finally {
    env.dispose()
  }
})

test('D3: stop-continuation still pauses an existing boulder and reports the pause', async () => {
  const env = await setup()
  try {
    await fs.mkdir(path.join(env.workspace, '.omd', 'plans'), { recursive: true })
    await fs.writeFile(path.join(env.workspace, '.omd', 'plans', 'stop-plan.md'), planDoc('Stop plan'))

    const started = await env.invoke('omd-start-work')
    assert.equal(started.kind, 'success', started.text)
    const slotPath = boulderSlotPath(env.workspace, 'session-1')
    const active = await readJson(slotPath)
    assert.equal(active.status, 'active')
    assert.equal(active.plan_name, 'Stop plan')

    const receipt = await env.invoke('omd-stop-continuation')
    assert.equal(receipt.kind, 'success')
    assert.equal(
      receipt.text,
      'continuations stopped; boulder paused; no active goal',
      'a paused slot keeps the original receipt',
    )
    const paused = await readJson(slotPath)
    assert.equal(paused.status, 'paused')
    assert.equal(paused.plan_name, 'Stop plan', 'pausing keeps the plan the slot was started on')
    assert.ok(!Number.isNaN(Date.parse(paused.finished_at)), 'pausing records the pause time')

    // The derived view now really has one open (paused) slot.
    const view = await readJson(path.join(env.workspace, '.omd', 'boulder.json'))
    assert.equal(view.open_count, 1)
    assert.deepEqual(view.open_stems, ['session-1'])

    // Only a truly missing slot takes the no-boulder branch: a second stop sees
    // the paused slot and reports the pause again.
    const second = await env.invoke('omd-stop-continuation')
    assert.equal(second.text, 'continuations stopped; boulder paused; no active goal')
  } finally {
    env.dispose()
  }
})

// D12: soft-deleted tasks are not live work.

function taskId(rendered) {
  const match = /^(T-[a-z0-9]+)\b/i.exec(String(rendered))
  assert.ok(match, `the task tool must answer with the task id; got ${JSON.stringify(rendered)}`)
  return match[1]
}

test('D12: a soft-deleted task is not counted by summary(), including as blocked', async () => {
  const env = await setup({ config: { taskSystem: { enabled: true } } })
  try {
    const create = env.tool('omd_task_create')
    const update = env.tool('omd_task_update')
    const list = env.tool('omd_task_list')
    const store = new TaskStore(env.workspace)

    const parent = taskId(await create({ subject: 'Parent task' }))
    const child = taskId(await create({ subject: 'Child task', blocked_by: [parent] }))
    assert.equal((await store.summary()).total, 2)

    // The tool path is the way a session deletes a task: a soft delete, so the
    // row stays on disk and stays visible to omd_task_list.
    const deleted = await update({ id: child, status: 'deleted' })
    assert.match(deleted, /\[deleted\]/)
    assert.equal(await exists(path.join(env.workspace, '.omd', 'tasks', `${child}.json`)), true)

    // One pending + one deleted (the deleted one had a blocker) => total 1 and
    // blocked 0. Before the fix this read "total 2 ... blocked 1".
    assert.deepEqual(await store.summary(), { total: 1, pending: 1, in_progress: 0, completed: 0, blocked: 0 })
    const board = await env.invoke('omd-status')
    const line = TASK_LINE.exec(board.text)
    assert.ok(line, `the board must carry a tasks line; got ${JSON.stringify(board.text)}`)
    assert.deepEqual(line.slice(1), ['1', '0', '0', '0'])

    // `list()` keeps the deleted row: `omd_task_list` and dependency validation
    // must still see it.
    assert.deepEqual(
      (await store.list()).map((task) => [task.id, task.status]).sort(),
      [
        [child, 'deleted'],
        [parent, 'pending'],
      ].sort(),
    )
    assert.deepEqual((await store.list({ status: 'deleted' })).map((task) => task.id), [child])
    assert.match(await list({ status: 'deleted' }), /Child task/)

    // Every task deleted is the state the report measured: the board must read
    // zero, not the two soft-deleted rows.
    await update({ id: parent, status: 'deleted' })
    assert.deepEqual(await store.summary(), { total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 })
    const emptyBoard = await env.invoke('omd-status')
    assert.match(emptyBoard.text, /^tasks: 0 total, 0 in progress, 0 done, 0 blocked$/m)
    assert.equal((await store.list()).length, 2, 'the deleted rows are still there for dependency validation')
  } finally {
    env.dispose()
  }
})

test('D12: summary() still counts every non-deleted status and completion clears blocked', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-task-summary-'))
  const store = new TaskStore(workspace)
  try {
    const a = await store.create({ subject: 'A' })
    const b = await store.create({ subject: 'B', blockedBy: [a.id] })
    const c = await store.create({ subject: 'C' })
    await store.update({ id: c.id, status: 'completed' })

    // A live task with blockers is blocked; a completed one is not.
    assert.deepEqual(await store.summary(), { total: 3, pending: 2, in_progress: 0, completed: 1, blocked: 1 })

    await store.update({ id: a.id, status: 'in_progress' })
    await store.update({ id: b.id, status: 'completed' })
    assert.deepEqual(await store.summary(), { total: 3, pending: 0, in_progress: 1, completed: 2, blocked: 0 })
  } finally {
    await fs.rm(workspace, { recursive: true, force: true })
  }
})

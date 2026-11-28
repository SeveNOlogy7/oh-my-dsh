/**
 * The continuation gate is mode-aware.
 *
 * Session 826b4892 finished `hyperplan` — plan approved, five lanes reviewed —
 * and then got a `[OMD CONTINUATION]` steer on every turn close until it hit
 * the round cap. The hook only asked "is work open?" for ultrawork; every other
 * continuable mode fell through to an unconditional nudge. These tests pin the
 * per-mode answer, the explicit-stop signal, and the stalled-loop backstop.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { continuationDecision, MAX_IDLE_ROUNDS } from '../src/hooks/continuation.js'
import { parsePlan, planDeferred, planSince } from '../src/state/plan.js'
import { readMode } from '../src/state/modes.js'
import { readLedger } from '../src/state/ledger.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

const planText = ({ status = 'approved', execution = null, tasks = 2, checked = 0, slug = 'demo' } = {}) => {
  const head = ['---', `plan: "${slug}"`, `status: ${status}`]
  if (execution) head.push(`execution: ${execution}`)
  head.push('created: 2026-11-28', '---', '', `# Plan: ${slug}`, '', '## TODOs', '')
  for (let index = 1; index <= tasks; index += 1) {
    head.push(`- [${index <= checked ? 'x' : ' '}] ${index}. Task ${index}`, '  Recommended task executor category: deep')
  }
  return head.join('\n')
}

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-continuation-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  const { ctx, agent, state } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent: 'sisyphus' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { root, workspace, ctx, agent, state, dispose }
}

async function setMode(env, mode) {
  const tool = env.state.tools.find((entry) => entry.name === 'omd_mode')
  await tool.execute({ action: 'set', mode }, { agent: env.agent, signal: new AbortController().signal })
}

async function writePlan(env, options) {
  const dir = path.join(env.workspace, '.omd', 'plans')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${options?.slug ?? 'demo'}.md`), planText(options))
}

async function stop(env) {
  await emit(env.ctx, 'agent/turn-stopping', { agent: env.agent, turn: 1, signal: new AbortController().signal })
}

async function runTool(env, name, args = {}, text = 'ok') {
  const listener = env.state.listeners.get('tools/post-execute')?.[0]
  assert.ok(listener, 'tools/post-execute listener is installed')
  return listener({ name, arguments: args }, { content: [{ type: 'text', text }] }, async () => ({ kind: 'accept' }))
}

const doc = (options) => parsePlan(planText(options))
const idleState = (mode) => ({ mode: { mode } })

// The reported bug

test('a finished hyperplan does not keep the turn open', async () => {
  const env = await setup()
  await setMode(env, 'hyperplan')
  await writePlan(env, { status: 'approved', tasks: 2, checked: 0 })
  await stop(env)
  assert.equal(env.state.steers.length, 0, 'approved planning is finished work, even with unchecked execution rows')
  await stop(env)
  assert.equal(env.state.steers.length, 0)
  const saved = await readMode(env.workspace, 'session-1')
  assert.equal(saved.continuation_rounds, 0, 'no continuation round was recorded')
  env.dispose()
})

test('hyperplan still nudges while its own deliverable is missing', async () => {
  const env = await setup()
  await setMode(env, 'hyperplan')
  await stop(env)
  assert.equal(env.state.steers.length, 1, 'no plan at all is unfinished planning')
  assert.match(env.state.steers[0].content[0].text, /OMD CONTINUATION/)
  assert.match(env.state.steers[0].content[0].text, /mode: hyperplan/)

  await writePlan(env, { status: 'draft', tasks: 2 })
  await stop(env)
  assert.equal(env.state.steers.length, 2, 'a draft plan is not a hardened plan')
  env.dispose()
})

test('the plan is found in .omd/plans when no boulder names it', async () => {
  const env = await setup()
  await setMode(env, 'hyperplan')
  await new Promise((resolve) => setTimeout(resolve, 10))
  await writePlan(env, { status: 'approved' })
  const found = await planSince(env.workspace, (await readMode(env.workspace, 'session-1')).since)
  assert.ok(found, 'a plan written after the mode started is this run\'s plan')
  assert.equal(found.status, 'approved')
  // The boulder slot is what the old code required; it never exists for a
  // keyword mode, so the plan stayed invisible and no gate could fire.
  const slot = path.join(env.workspace, '.omd', 'boulder', 'session-1.json')
  await assert.rejects(fs.access(slot))
  env.dispose()
})

test('an explicitly deferred plan stops the nudging in every mode', async () => {
  const env = await setup()
  await setMode(env, 'ultrawork')
  await new Promise((resolve) => setTimeout(resolve, 10))
  await writePlan(env, { status: 'approved', execution: 'deferred — user chose to stop after planning', tasks: 3 })
  await stop(env)
  assert.equal(env.state.steers.length, 0, 'the owner said stop; open rows do not override that')
  const ledger = await readLedger(env.workspace, { limit: 5 })
  const skip = ledger.findLast((entry) => entry.event === 'continuation-skip')
  assert.ok(skip, 'the stop is recorded in the ledger')
  assert.equal(skip.reason, 'plan-deferred')
  env.dispose()
})

test('planDeferred reads both the status and the execution field', () => {
  assert.equal(planDeferred(doc({ status: 'approved', execution: 'deferred — stop here' })), true)
  assert.equal(planDeferred(doc({ status: 'deferred' })), true)
  assert.equal(planDeferred(doc({ status: 'cancelled' })), true)
  assert.equal(planDeferred(doc({ status: 'approved', execution: 'active' })), false)
  assert.equal(planDeferred(doc({ status: 'approved' })), false)
  assert.equal(planDeferred(null), false)
})

// The decision table

test('the decision is mode-aware', () => {
  const approved = doc({ status: 'approved', tasks: 3, checked: 0 })
  const draft = doc({ status: 'draft', tasks: 3 })
  const complete = doc({ status: 'approved', tasks: 2, checked: 2 })

  const hyperplan = continuationDecision(idleState('hyperplan'), { plan: approved })
  assert.equal(hyperplan.steer, false)
  assert.equal(hyperplan.reason, 'plan-approved')

  assert.equal(continuationDecision(idleState('hyperplan'), { plan: draft }).steer, true)
  assert.equal(continuationDecision(idleState('hyperplan'), {}).steer, true)

  const openRows = continuationDecision(idleState('ultrawork'), { plan: approved })
  assert.equal(openRows.steer, true)
  assert.equal(openRows.gate, 'open-work')

  const done = continuationDecision(idleState('ultrawork'), {
    plan: complete,
    tracked: { artifacts: 1, verification: 1, verifiedAt: 1 },
  })
  assert.equal(done.steer, false)
  assert.equal(done.reason, 'work-complete')

  const unverified = continuationDecision(idleState('ultrawork'), { plan: complete, tracked: { artifacts: 1, verification: 0, verifiedAt: 0 } })
  assert.equal(unverified.steer, true)
  assert.equal(unverified.gate, 'dual-evidence')

  // Team executes the plan, so open rows are its work.
  assert.equal(continuationDecision(idleState('team'), { plan: approved }).steer, true)
  assert.equal(continuationDecision(idleState('team'), { plan: complete, tasks: { open: 0 } }).steer, false)
})

test('two idle rounds end a loop the model cannot advance', () => {
  const open = doc({ status: 'approved', tasks: 3 })
  const busy = continuationDecision(idleState('ultrawork'), { plan: open, idleRounds: 0 })
  assert.equal(busy.steer, true, 'one idle round is tolerated')
  const stalled = continuationDecision(idleState('ultrawork'), { plan: open, idleRounds: MAX_IDLE_ROUNDS })
  assert.equal(stalled.steer, false)
  assert.equal(stalled.reason, 'stalled')
})

// The stall backstop, through the hook

test('the hook closes a session that answers two continuations without a tool call', async () => {
  const env = await setup()
  await setMode(env, 'ultrawork')
  await stop(env)
  assert.equal(env.state.steers.length, 1, 'first close with nothing produced opens the turn')
  await stop(env)
  assert.equal(env.state.steers.length, 2, 'one text-only round is still tolerated')
  await stop(env)
  assert.equal(env.state.steers.length, 2, 'the second text-only round ends the loop')
  const ledger = await readLedger(env.workspace, { limit: 5 })
  assert.equal(ledger.findLast((entry) => entry.event === 'continuation-skip')?.reason, 'stalled')
  env.dispose()
})

test('a tool call resets the stall counter', async () => {
  const env = await setup()
  await setMode(env, 'ultrawork')
  await stop(env)
  await stop(env)
  assert.equal(env.state.steers.length, 2)
  await runTool(env, 'read', { file_path: 'README.md' })
  await stop(env)
  assert.equal(env.state.steers.length, 3, 'progress reopens the turn instead of ending the loop')
  env.dispose()
})

test('a boulder that names the plan outranks the deferred marker', () => {
  const deferred = doc({ status: 'approved', execution: 'deferred — owner stopped after planning' })
  const ultrawork = idleState('ultrawork')
  assert.deepEqual(continuationDecision(ultrawork, { plan: deferred }), { steer: false, reason: 'plan-deferred' })
  const started = continuationDecision(ultrawork, { plan: deferred, executing: true })
  assert.equal(started.steer, true, 'starting the plan is a newer instruction than the marker in the file')
  assert.equal(started.gate, 'open-work')
})

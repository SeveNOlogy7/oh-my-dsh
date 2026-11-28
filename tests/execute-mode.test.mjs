/**
 * Starting execution must also enter the execution mode.
 *
 * Session c943560a stayed in `hyperplan` (round 18) after the user ran
 * `/omd-ulw-execute`. No such command existed, so DSH resolved the token to the
 * bundled `omd-ulw-execute` skill, which only injects text: the mode never
 * changed, hyperplan's system-prompt section ("do not execute the plan") stayed
 * installed, and the planning continuation gate kept asking for a plan while the
 * user asked for code.
 *
 * `/omd-start-work` had the same hole from the other side — it wrote the boulder
 * and sent the Atlas protocol without entering ultrawork — so a session that
 * started work from `plan` ran ungoverned: no continuation, no dual evidence.
 *
 * These tests drive the production runtime row. Both names must select the plan,
 * write the boulder, enter ultrawork, and ledger the transition; the execute
 * skill keeps a mode gate for the path where DSH resolves the skill first.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { readMode } from '../src/state/modes.js'
import { readLedger } from '../src/state/ledger.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

const EXECUTION_COMMANDS = ['omd-start-work', 'omd-ulw-execute']

function planDoc({ title = 'unit-plan', execution = null } = {}) {
  const head = ['---', `plan: ${JSON.stringify(title)}`, 'status: approved']
  if (execution) head.push(`execution: ${execution}`)
  head.push('created: 2026-11-28', '---', '', `# Plan: ${title}`, '', '## TODOs', '')
  head.push('- [ ] 1. Ship the change', '  Recommended task executor category: deep', '')
  return head.join('\n')
}

async function setup({ plan = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-execute-mode-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(path.join(workspace, '.omd', 'plans'), { recursive: true })
  await fs.writeFile(path.join(workspace, '.omd', 'plans', 'unit-plan.md'), planDoc(plan))
  const { ctx, agent, state } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent: 'sisyphus' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { root, workspace, ctx, agent, state, dispose, runtime: dispose.runtime }
}

async function invoke(env, name, rawInput = '') {
  const definition = env.state.commands.find((candidate) => candidate.name === name)
  assert.ok(definition, `${name} must be registered by the runtime row`)
  return definition.handler({ agent: env.agent, rawInput, signal: new AbortController().signal })
}

async function setMode(env, mode) {
  const tool = env.state.tools.find((entry) => entry.name === 'omd_mode')
  await tool.execute({ action: 'set', mode }, { agent: env.agent, signal: new AbortController().signal })
}

async function stop(env) {
  await emit(env.ctx, 'agent/turn-stopping', { agent: env.agent, turn: 1, signal: new AbortController().signal })
}

for (const name of EXECUTION_COMMANDS) {
  test(`/${name} enters ultrawork, not just a skill's text`, async () => {
    const env = await setup()
    const result = await invoke(env, name)
    assert.equal(result.kind, 'success', `${name} answers with a receipt`)
    assert.match(result.text, /execution started in ultrawork: unit-plan/, 'the receipt names the mode it entered')
    const live = await env.runtime.stateFor(env.agent)
    assert.equal(live.mode.mode, 'ultrawork', 'the live state answers the new mode')

    const saved = await readMode(env.workspace, 'session-1')
    assert.equal(saved.mode, 'ultrawork', 'the mode is persisted for the next process')
    assert.equal(saved.continuation_rounds, 0, 'the transition resets the continuation counter')

    const ledger = await readLedger(env.workspace)
    const events = ledger.map((entry) => entry.event)
    assert.ok(events.includes('start-work'), 'the work start is ledgered')
    const modeSet = ledger.find((entry) => entry.event === 'mode-set')
    assert.ok(modeSet, 'the mode transition is ledgered')
    assert.equal(modeSet.mode, 'ultrawork')
    assert.equal(modeSet.agent, env.agent.id)

    const slot = JSON.parse(
      await fs.readFile(path.join(env.workspace, '.omd', 'boulder', 'session-1.json'), 'utf8'),
    )
    assert.equal(slot.status, 'active', 'the boulder is running')
    assert.match(slot.active_plan, /\.omd[\\/]plans[\\/]unit-plan\.md$/)
    env.dispose()
  })
}

test('starting execution from hyperplan leaves the planning mode behind', async () => {
  const env = await setup()
  await setMode(env, 'hyperplan')
  assert.equal((await env.runtime.stateFor(env.agent)).mode.mode, 'hyperplan')
  await invoke(env, 'omd-ulw-execute')
  const saved = await readMode(env.workspace, 'session-1')
  assert.equal(saved.mode, 'ultrawork', 'the planning mode does not survive the start')
  env.dispose()
})

test('a plan marked deferred is supervised once the owner starts it', async () => {
  const env = await setup({ plan: { execution: 'deferred — owner stopped after planning' } })
  await invoke(env, 'omd-start-work')
  await stop(env)
  assert.equal(env.state.steers.length, 1, 'the open task is nudged: the boulder outranks the deferred marker')
  const ledger = await readLedger(env.workspace)
  const continuation = ledger.find((entry) => entry.event === 'continuation')
  assert.ok(continuation, 'a continuation round was recorded')
  assert.notEqual(continuation.gate, 'plan-deferred')
  env.dispose()
})

test('the execute skill tells the model to enter ultrawork', async () => {
  const text = await fs.readFile(new URL('../skills/omd-ulw-execute/SKILL.md', import.meta.url), 'utf8')
  assert.match(text, /## Mode gate/, 'the skill carries the mode gate')
  assert.match(text, /hyperplan/, 'the gate names the planning modes it must replace')
  assert.match(text, /"action":"set","mode":"ultrawork"/, 'the gate gives the exact tool call')
})

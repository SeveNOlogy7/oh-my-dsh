/**
 * A continued delegation must not claim to be running.
 *
 * `subagents.sendMessage` only accepts a message: the child's next result
 * arrives as a completion notice in the parent's inbox, and OMD has no channel
 * that observes the continued child's end. Recording `running` made the status
 * board count a finished child as active forever (verification finding D4); the
 * honest state is the same `unknown` a restart assigns to a record it cannot
 * observe.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

async function setup(agent = 'sisyphus') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-continuation-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  const { ctx, agent: agentHandle, state } = createFakeContext({ cwd: workspace, agentPreset: `omd-${agent}` })
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent: agentHandle })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { root, workspace, ctx, agent: agentHandle, state, dispose }
}

const signal = () => new AbortController().signal
const tool = (env, name) => env.state.tools.find((entry) => entry.name === name)

test('a continued background task is recorded as unknown, not running', async () => {
  const env = await setup('sisyphus')
  try {
    const delegate = tool(env, 'omd_delegate')
    const started = await delegate.execute(
      { prompt: 'first run', subagent_type: 'oracle', run_in_background: true, description: 'probe' },
      { agent: env.agent, signal: signal() },
    )
    const taskId = /bg_[a-f0-9]+/.exec(started)[0]
    await new Promise((resolve) => setTimeout(resolve, 80))

    const before = JSON.parse(await fs.readFile(path.join(env.workspace, '.omd', 'background', `${taskId}.json`), 'utf8'))
    assert.equal(before.status, 'completed')
    assert.equal(before.continuation_accepted, undefined)

    const continued = await delegate.execute(
      { prompt: 'second run', subagent_type: 'oracle', task_id: taskId },
      { agent: env.agent, signal: signal() },
    )
    assert.match(continued, /accepted message/)
    assert.match(continued, /cannot observe a continued run/)

    const after = JSON.parse(await fs.readFile(path.join(env.workspace, '.omd', 'background', `${taskId}.json`), 'utf8'))
    assert.equal(after.status, 'unknown', 'a continued record must not claim to be running')
    assert.notEqual(after.status, 'running')
    assert.equal(after.continuation_accepted, true)
    assert.equal(after.finished_at, null)

    const rendered = await tool(env, 'omd_background_output').execute({ task_id: taskId }, { agent: env.agent, signal: signal() })
    assert.match(rendered, /status: unknown/)
    assert.match(rendered, /the result arrives as a completion notice/)

    // The board counts only running/queued as active, so a continued record is
    // settled rather than an activity that never ends.
    const board = await tool(env, 'omd_status').execute({}, { agent: env.agent, signal: signal() })
    assert.match(board, /background: 0 active/)
    assert.match(board, /1 settled/)
  } finally {
    env.dispose()
  }
})

test('a continuation still requires a role and an existing task', async () => {
  const env = await setup('sisyphus')
  try {
    const delegate = tool(env, 'omd_delegate')
    await assert.rejects(
      () => delegate.execute({ prompt: 'x', task_id: 'bg_0000000000' }, { agent: env.agent, signal: signal() }),
      /pass subagent_type or category/,
    )
    await assert.rejects(
      () => delegate.execute({ prompt: 'x', subagent_type: 'oracle', task_id: 'bg_0000000000' }, { agent: env.agent, signal: signal() }),
      /unknown task/,
    )
  } finally {
    env.dispose()
  }
})

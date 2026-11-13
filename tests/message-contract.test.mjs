import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { userMessage } from '../src/core/message.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

/**
 * DSH types `Agent.followup()` / `Agent.steer()` as `UserMessage` and fills in
 * nothing on the way in: the object goes straight into the agent inbox and is
 * committed verbatim as a `user/message` record. A partial object therefore
 * persists with `role: undefined`, and every later request of that session is
 * rejected with `Unsupported message role: undefined` (UNSUPPORTED_CONTENT) —
 * one bad message poisons the session for good, because the record is durable.
 *
 * These tests assert the whole contract on every message OMD constructs, so a
 * future edit cannot reintroduce the partial shape that DSH's own README example
 * (which omits `role` and `id`) makes look correct.
 */
function assertUserMessage(message, label, expectedSource = 'user') {
  assert.ok(message && typeof message === 'object', `${label}: a message object is required`)
  assert.equal(
    message.role,
    'user',
    `${label}: role must be 'user'; DSH persists this object verbatim and the provider rejects an undefined role`,
  )
  assert.equal(typeof message.id, 'string', `${label}: the inbox projection keys pending messages by id`)
  assert.ok(message.id.length > 0, `${label}: id must not be empty`)
  assert.ok(Array.isArray(message.content), `${label}: content must be a block array`)
  assert.equal(message.source && message.source.kind, expectedSource, `${label}: source.kind must be ${expectedSource}`)
}

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-message-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })
  const { ctx, agent, state } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob', 'todo_write']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, { agent: 'sisyphus' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent })
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { workspace, ctx, agent, state, dispose }
}

test('userMessage builds a complete UserMessage with a fresh identity', () => {
  const first = userMessage('hello')
  assertUserMessage(first, 'userMessage')
  assert.equal(first.content[0].text, 'hello')
  const second = userMessage('hello')
  assert.notEqual(first.id, second.id, 'each message needs its own identity')
  assert.equal(userMessage(undefined).content[0].text, '', 'a missing body becomes empty text, never "undefined"')
})

test('every command that wakes the agent hands DSH a complete user message', async () => {
  const env = await setup()
  const signal = new AbortController().signal
  const cases = [
    ['omd-ulw', 'fix the failing test'],
    ['omd-plan', 'plan the migration'],
    ['omd-hyperplan', 'harden the plan'],
    ['omd-team', 'run as a team'],
    ['omd-init-deep', ''],
    ['omd-refactor', 'src/core/config.js'],
    ['omd-remove-ai-slops', ''],
  ]
  for (const [name, rawInput] of cases) {
    const command = env.state.commands.find((candidate) => candidate.name === name)
    assert.ok(command, `${name} must be registered`)
    await command.handler({ agent: env.agent, rawInput, signal, commandId: 'cmd-1', attachments: [] })
  }
  assert.equal(env.state.followups.length, cases.length, 'each of those commands wakes the agent exactly once')
  for (const [index, message] of env.state.followups.entries()) {
    assertUserMessage(message, `/${cases[index][0]} followup`)
  }
  const ids = env.state.followups.map((message) => message.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids would make the inbox claim the wrong message')
  env.dispose()
})

test('the continuation steer hands DSH a complete user message', async () => {
  const env = await setup()
  // Real `user/message` shape: the message is the event data.
  await emit(env.ctx, 'session/event', { id: 'session-1' }, {
    type: 'user/message',
    data: {
      id: 'm-1',
      role: 'user',
      content: [{ type: 'text', text: 'ulw fix the parser' }],
      source: { kind: 'user' },
    },
  })
  await emit(env.ctx, 'agent/turn-stopping', { agent: env.agent, turn: 1, signal: new AbortController().signal })
  assert.equal(env.state.steers.length, 1)
  // OMD injected this text itself, so it must not read back as a human turn:
  // the keyword hook only reads `source.kind: 'user'`.
  assertUserMessage(env.state.steers[0], 'turn-stopping steer', 'omd')
  assert.match(env.state.steers[0].content[0].text, /OMD CONTINUATION/)
  env.dispose()
})

test('a command follow-up reads as a human turn, tool feedback does not', async () => {
  const env = await setup()
  const ulw = env.state.commands.find((command) => command.name === 'omd-ulw')
  await ulw.handler({ agent: env.agent, rawInput: 'fix the tests', signal: new AbortController().signal })
  assert.equal(env.state.followups[0].source.kind, 'user', 'a typed /omd-ulw stands for the user turn')
  env.dispose()
})

test('tool feedback contexts handed to DSH are complete user messages', async () => {
  const env = await setup()
  const listener = env.state.listeners.get('tools/post-execute')?.[0]
  assert.ok(listener)
  const decision = await listener(
    { name: 'write', arguments: { file_path: 'a.ts', content: '// increment\nx++\n' } },
    { isError: false },
    async () => ({ kind: 'accept' }),
  )
  assert.ok(decision.additionalContexts?.length, 'the comment checker reports through additionalContexts')
  for (const [index, message] of decision.additionalContexts.entries()) {
    // `additionalContexts` is typed `UserMessage[]` by DSH, so the id and role
    // are load-bearing here too, and the source marks it as OMD-injected.
    assertUserMessage(message, `additionalContexts[${index}]`, 'omd')
  }
  env.dispose()
})

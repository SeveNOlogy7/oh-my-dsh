/**
 * Attachments on the commands that wake the agent.
 *
 * A composer that can attach images and files asks the command catalog whether
 * the command accepts them: a command whose `input.attachments` is not `true`
 * is refused before dispatch with `/{command} 不接受附件，请先移除附件`, and the
 * Host executor enforces the same rule for callers that bypass the client. The
 * OMD commands that hand a message to the agent therefore must declare
 * acceptance and forward the admitted blocks; forwarding them only as text
 * would lose the images the user actually attached.
 *
 * Report-only commands (`/omd-init`, `/omd-status`, `/omd-stop-continuation`,
 * `/omd-handoff`, `/omd-config`) deliberately keep refusing: they never submit
 * a model message, so accepting the attachment would silently drop it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { userMessage } from '../src/core/message.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

const IMAGE_BLOCK = {
  type: 'image',
  attachment: { attachmentId: 'attachment-1', mediaType: 'image/png', bytes: 2048, width: 64, height: 64 },
}
const FILE_BLOCK = {
  type: 'file',
  attachment: { attachmentId: 'attachment-2', name: 'brief.md', mediaType: 'text/markdown', bytes: 512 },
}

// Commands whose handler ends in `agent.followup(...)`: the attachment belongs
// in that message, so the catalog must admit it.
const AGENT_WAKING = [
  'omd-ulw',
  'omd-plan',
  'omd-hyperplan',
  'omd-team',
  'omd-start-work',
  'omd-ulw-execute',
  'omd-refactor',
  'omd-init-deep',
  'omd-remove-ai-slops',
]

// Commands that only report, write a file, or edit local configuration. They
// have no model-facing message to put blocks in and must keep the refusal.
const REPORT_ONLY = ['omd-init', 'omd-status', 'omd-stop-continuation', 'omd-handoff', 'omd-config']

function planDoc() {
  return [
    '---',
    'plan: "attachment-plan"',
    'status: approved',
    'created: 2026-11-28',
    '---',
    '',
    '# Plan: attachment plan',
    '',
    '## TODOs',
    '',
    '- [ ] 1. Ship the change',
    '  Recommended task executor category: deep',
    '',
  ].join('\n')
}

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-attachments-'))
  t?.after(() => fs.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, 'project')
  await fs.mkdir(path.join(workspace, '.omd', 'plans'), { recursive: true })
  await fs.writeFile(path.join(workspace, '.omd', 'plans', 'attachment-plan.md'), planDoc())
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

function commandOf(env, name) {
  const definition = env.state.commands.find((candidate) => candidate.name === name)
  assert.ok(definition, `${name} must be registered`)
  return definition
}

async function invoke(env, name, rawInput, attachments) {
  return commandOf(env, name).handler({
    agent: env.agent,
    rawInput,
    attachments,
    signal: new AbortController().signal,
    commandId: 'cmd-1',
  })
}

test('userMessage places admitted blocks before the text and drops an empty text block', () => {
  const message = userMessage('fix this', { kind: 'user' }, [IMAGE_BLOCK, FILE_BLOCK])
  assert.equal(message.role, 'user')
  assert.equal(typeof message.id, 'string')
  assert.equal(message.content.length, 3)
  assert.equal(message.content[0], IMAGE_BLOCK, 'the block object is forwarded, not reshaped')
  assert.equal(message.content[1], FILE_BLOCK)
  assert.equal(message.content[2].type, 'text')
  assert.equal(message.content[2].text, 'fix this')

  const attachmentOnly = userMessage('', { kind: 'user' }, [IMAGE_BLOCK])
  assert.deepEqual(attachmentOnly.content, [IMAGE_BLOCK], 'an attachment-only turn carries no empty text block')

  const textOnly = userMessage('')
  assert.deepEqual(textOnly.content, [{ type: 'text', text: '' }], 'no attachments keeps the old shape')
})

test('the commands that wake the agent declare attachment acceptance', async (t) => {
  const env = await setup(t)
  for (const name of AGENT_WAKING) {
    const definition = commandOf(env, name)
    assert.equal(
      definition.input?.attachments,
      true,
      `${name} must declare input.attachments or the composer refuses the attachment before dispatch`,
    )
  }
  for (const name of REPORT_ONLY) {
    const definition = commandOf(env, name)
    assert.notEqual(
      definition.input?.attachments,
      true,
      `${name} has no model-facing message and must keep the standing refusal instead of dropping the block`,
    )
  }
  env.dispose()
})

test('every command that wakes the agent forwards the admitted blocks', async (t) => {
  const env = await setup(t)
  const attachments = [IMAGE_BLOCK, FILE_BLOCK]
  const cases = [
    ['omd-ulw', 'fix the failing test'],
    ['omd-plan', 'plan the migration'],
    ['omd-hyperplan', 'harden the plan'],
    ['omd-team', 'run as a team'],
    ['omd-start-work', 'attachment-plan'],
    ['omd-ulw-execute', 'attachment-plan'],
    ['omd-refactor', 'src/core/config.js'],
    ['omd-init-deep', ''],
    ['omd-remove-ai-slops', ''],
  ]
  for (const [name, rawInput] of cases) {
    const result = await invoke(env, name, rawInput, attachments)
    assert.equal(result.kind, 'success', `${name} accepts the invocation`)
  }
  assert.equal(env.state.followups.length, cases.length, 'each command wakes the agent exactly once')
  for (const [index, message] of env.state.followups.entries()) {
    const name = cases[index][0]
    assert.equal(message.role, 'user', `${name}: role must be 'user'`)
    assert.equal(typeof message.id, 'string', `${name}: the inbox keys pending messages by id`)
    assert.equal(message.source.kind, 'user', `${name}: a typed command stands for the user turn`)
    assert.equal(message.content[0], IMAGE_BLOCK, `${name}: the image must be the first block`)
    assert.equal(message.content[1], FILE_BLOCK, `${name}: the file must follow in order`)
    const text = message.content[message.content.length - 1]
    assert.equal(text.type, 'text', `${name}: the instruction text stays last`)
    assert.ok(text.text.length > 0, `${name}: the protocol or instruction text must not be empty`)
  }
  env.dispose()
})

test('a handler invoked without an attachments field still sends the plain text turn', async (t) => {
  const env = await setup(t)
  // Older Hosts and direct callers may omit the field entirely; the handler
  // default keeps the message complete instead of producing an undefined block.
  const result = await commandOf(env, 'omd-ulw').handler({
    agent: env.agent,
    rawInput: 'fix the failing test',
    signal: new AbortController().signal,
    commandId: 'cmd-2',
  })
  assert.equal(result.kind, 'success')
  assert.equal(env.state.followups.length, 1)
  assert.deepEqual(env.state.followups[0].content, [{ type: 'text', text: '[ultrawork] fix the failing test' }])
  env.dispose()
})

test('omd-plan still forwards attachments when the goal falls back to the generic text', async (t) => {
  const env = await setup(t)
  const result = await invoke(env, 'omd-plan', '', [IMAGE_BLOCK])
  assert.equal(result.kind, 'success')
  assert.equal(env.state.followups.length, 1)
  const message = env.state.followups[0]
  assert.equal(message.content[0], IMAGE_BLOCK)
  assert.equal(message.content[1].text, '[plan] Plan the work I just described.')
  env.dispose()
})

test('a missing goal or target still errors without sending a followup', async (t) => {
  const env = await setup(t)
  const ulw = await invoke(env, 'omd-ulw', '', [IMAGE_BLOCK])
  assert.equal(ulw.kind, 'error', 'a bare /omd-ulw with an attachment has no goal yet')
  assert.match(ulw.text, /usage: \/omd-ulw/)
  const refactor = await invoke(env, 'omd-refactor', '', [IMAGE_BLOCK])
  assert.equal(refactor.kind, 'error')
  assert.match(refactor.text, /usage: \/omd-refactor/)
  assert.equal(env.state.followups.length, 0, 'a rejected invocation must keep the composer holding the attachment')
  env.dispose()
})

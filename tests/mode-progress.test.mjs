/**
 * ultrawork's visible-progress protocol.
 *
 * The measurement behind it: in a 29-minute ultrawork run, 224 of 226 assistant
 * messages carried no text at all, so the transcript collapsed into one folded
 * tool block and the user could not tell a working run from a hung one. These
 * tests pin the prompt text that asks for readable checkpoints, and that the
 * hooks deliver that text in the mode section the model receives.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../src/runtime/index.js'
import { clearPromptCache, loadModePrompt, loadProtocol } from '../src/agents/prompts.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

test('the ultrawork prompt asks for plan, work and evidence checkpoints', async () => {
  clearPromptCache()
  const text = await loadModePrompt('ultrawork')

  assert.match(text, /## Visible progress/)
  assert.match(text, /\*\*Plan checkpoint\.\*\*/)
  assert.match(text, /\*\*Work checkpoint\.\*\*/)
  assert.match(text, /\*\*Evidence checkpoint\.\*\*/)
  assert.match(text, /every 20 tool\s+calls or 10 minutes/)
  assert.match(text, /in the user's language/)
  assert.match(text, /A silent `omd_status` call is not a status update/)

  // The section must sit before the hard rules, and one hard rule must carry
  // the silence budget so it survives a scan of the rules alone.
  assert.ok(text.indexOf('## Visible progress') < text.indexOf('## Hard rules'))
  assert.match(text, /silence reads as a hang/)
  // The planning gate points at the announcement it precedes.
  assert.match(text, /Announce the plan before the first edit/)
  // The section is a shared partial, expanded at load time.
  assert.doesNotMatch(text, /<!--\s*include:/)
})

test('the hyperplan-ulw prompt inherits the checkpoint text', async () => {
  clearPromptCache()
  const text = await loadModePrompt('hyperplan-ulw')

  assert.match(text, /# Mode: hyperplan \+ ultrawork/)
  assert.match(text, /## Visible progress/)
  assert.match(text, /\*\*Plan checkpoint\.\*\*/)
  assert.match(text, /\*\*Work checkpoint\.\*\*/)
  assert.match(text, /\*\*Evidence checkpoint\.\*\*/)
  assert.match(text, /every 20 tool\s+calls or 10 minutes/)
  // An unexpanded marker would mean the model never receives the protocol.
  assert.doesNotMatch(text, /<!--\s*include:/)
})

test('the mode section handed to the model carries the checkpoint text', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-mode-progress-'))
  const workspace = path.join(root, 'project')
  await fs.mkdir(workspace, { recursive: true })

  const { ctx, agent, state } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  const dispose = apply(ctx, { agent: 'sisyphus' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  await emit(ctx, 'agent/created', { agent })
  await new Promise((resolve) => setTimeout(resolve, 10))

  try {
    const modeTool = state.tools.find((tool) => tool.name === 'omd_mode')
    assert.ok(modeTool, 'omd_mode is registered')
    await modeTool.execute(
      { action: 'set', mode: 'ultrawork' },
      { agent, signal: new AbortController().signal },
    )

    const section = state.sections.find(
      (entry) => typeof entry.text === 'function' && entry.text().includes('# Mode: ultrawork'),
    )
    assert.ok(section, 'the mode prompt is registered as a section')
    assert.match(section.text(), /## Visible progress/)
  } finally {
    dispose()
    await fs.rm(root, { recursive: true, force: true })
  }
})

const EXECUTING_MODES = ['ultrawork', 'hyperplan-ulw', 'team']
const READING_MODES = ['plan', 'hyperplan', 'analyze', 'search']

test('every executing mode carries the visible-progress checkpoints', async () => {
  clearPromptCache()
  for (const mode of EXECUTING_MODES) {
    const text = await loadModePrompt(mode)
    assert.match(text, /## Visible progress/, `${mode} carries the checkpoint section`)
    assert.match(text, /\*\*Work checkpoint\.\*\*/, `${mode} asks for a work checkpoint`)
    assert.doesNotMatch(text, /<!--\s*include:/, `${mode} expands its marker`)
  }
})

test('every read-only mode carries the read-progress note', async () => {
  clearPromptCache()
  for (const mode of READING_MODES) {
    const text = await loadModePrompt(mode)
    assert.match(text, /## Progress while you read/, `${mode} carries the read-progress note`)
    assert.match(text, /Every 20\s+tool calls — or 10 minutes/, `${mode} names the cadence`)
    assert.doesNotMatch(text, /<!--\s*include:/, `${mode} expands its marker`)
  }
})

test('every mode prompt has a progress shape, none is left silent', async () => {
  const files = await fs.readdir(new URL('../prompts/modes/', import.meta.url))
  const modes = files
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .map((name) => name.slice(0, -'.md'.length))
    .sort()
  assert.deepEqual(modes, [...EXECUTING_MODES, ...READING_MODES].sort())
})

test('both shared partials exist and are not empty', async () => {
  for (const name of ['_visible-progress.md', '_read-progress.md']) {
    const text = await fs.readFile(new URL(`../prompts/shared/${name}`, import.meta.url), 'utf8')
    assert.ok(text.trim().length > 0, `${name} is non-empty`)
  }
})

test('protocols that run without a mode carry the same progress text', async () => {
  clearPromptCache()
  for (const name of ['refactor', 'remove-ai-slops', 'init-deep']) {
    const text = await loadProtocol(name)
    assert.match(text, /## Visible progress/, `${name} carries the checkpoints`)
    assert.doesNotMatch(text, /<!--\s*include:/, `${name} expands its marker`)
  }
  const review = await loadProtocol('review')
  assert.match(review, /## Progress while you read/, 'review carries the read-progress note')
  assert.doesNotMatch(review, /<!--\s*include:/, 'review expands its marker')
})

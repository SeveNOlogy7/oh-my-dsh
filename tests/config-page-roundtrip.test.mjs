/**
 * End-to-end round trip: the real Host half (`src/config-page`) against the
 * browser half (`ui/client.js`) rendered in the React stub.
 *
 * Each half is covered on its own elsewhere, and both could pass while
 * disagreeing about the wire: the client would stage a removal the patch code
 * never sends, or send a patch the store reads as something else. This file
 * drives the page's own request through the route's own parser into a real
 * temp workspace and back, so the protocol between them is measured, not
 * assumed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseJsonc } from '../src/core/jsonc.js'
import { createConfigPage, parseConfigInput } from '../src/config-page/index.js'
import { rawInputOf } from '../src/config-page/transport.js'
import { byId, buttonByText, createHarness, fieldByLabel, find, flatten } from './helpers/client-harness.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** A throwaway directory, optionally pre-filled with files. */
async function tempDir(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-roundtrip-'))
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
  }
  return dir
}

/** The route handler's work without HTTP: parse the page's line, answer an outcome. */
function responder(page, workspace) {
  return async (line) => {
    const parsed = parseConfigInput(rawInputOf(line))
    if (parsed.kind === 'usage') return { error: { kind: 'command', message: parsed.message } }
    if (parsed.kind === 'read') return { envelope: await page.read({ workspace, agentId: null, language: 'en' }) }
    const result = await page.set({ workspace, agentId: null, language: 'en', patch: parsed.patch, unset: parsed.unset })
    if (result.ok === false) return { error: { kind: 'command', message: result.error.message } }
    return { envelope: result }
  }
}

/** Click Save and wait until the page is clean again, i.e. the Host answered. */
async function savePage(harness) {
  const before = harness.calls.length
  buttonByText(harness.render(), 'Save changes').props.onClick()
  await harness.waitUntil(() => {
    // While the save is in flight the button reads "Saving…" and is absent
    // under the "Save changes" label, so only a resolved, cleaned page counts.
    const button = buttonByText(harness.render(), 'Save changes')
    return harness.calls.length > before && button !== null && button.props.disabled === true
  })
  return harness.render()
}

test('the page reads, edits, resets, and saves through the real Host half', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc': [
      '{',
      '  // keep this comment',
      '  "keywordHook": true,',
      '  "delegation": {',
      '    "maxConcurrent": 3',
      '  },',
      '}',
      '',
    ].join('\n'),
  })
  const file = path.join(workspace, '.omd', 'config.jsonc')
  const page = createConfigPage({ home, packageRoot: root })
  const respond = responder(page, workspace)
  const harness = createHarness({ responses: [respond, respond, respond, respond, respond] })

  // The real store does file I/O, so wait for the rendered page rather than a
  // fixed number of ticks.
  harness.render()
  await harness.waitUntil(() => buttonByText(harness.render(), 'Save changes') !== null)
  let tree = harness.render()
  assert.equal(byId(tree, 'omd-cfg-delegation.maxConcurrent').props.value, '3')
  assert.equal(byId(tree, 'omd-cfg-keywordHook').props.checked, true)
  assert.ok(flatten(fieldByLabel(tree, 'Max concurrent delegations')).includes('in file'))

  // Reset the value the file sets: the page must send a removal, the Host must
  // splice it out without disturbing the comment, and the emptied parent object
  // must be pruned rather than left as `"delegation": {}`.
  find(fieldByLabel(tree, 'Max concurrent delegations'), (node) => node.props && node.props.className === 'omd-cfg-reset').props.onClick()
  tree = harness.render()
  tree = await savePage(harness)

  const afterReset = await fs.readFile(file, 'utf8')
  assert.match(afterReset, /\/\/ keep this comment/, 'the comment survives a removal')
  assert.equal(parseJsonc(afterReset).delegation, undefined, 'the emptied delegation object is pruned')
  assert.equal(parseJsonc(afterReset).keywordHook, true)
  assert.equal(byId(tree, 'omd-cfg-delegation.maxConcurrent').props.value, '5', 'the inherited default shows after the removal')
  assert.ok(!flatten(fieldByLabel(tree, 'Max concurrent delegations')).includes('in file'))
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true, 'a saved page is clean again')

  // A plain edit still writes only its own key, through the legacy form.
  byId(tree, 'omd-cfg-keywordHook').props.onChange({ target: { checked: false } })
  tree = await savePage(harness)

  const afterEdit = parseJsonc(await fs.readFile(file, 'utf8'))
  assert.deepEqual(afterEdit, { keywordHook: false })
  assert.ok(harness.calls[2].startsWith('/omd-config set {'), 'a removal-free save keeps the legacy payload')
  assert.ok(!harness.calls[2].includes('unset'))

  // A list control round-trips into the documented object form.
  byId(tree, 'omd-cfg-diagnostics.commands').props.onChange({ target: { value: 'node --test tests\nnpm run check' } })
  tree = harness.render()
  await savePage(harness)

  const afterList = parseJsonc(await fs.readFile(file, 'utf8'))
  assert.deepEqual(afterList.diagnostics.commands, [
    { command: 'node', args: ['--test', 'tests'] },
    { command: 'npm', args: ['run', 'check'] },
  ])
  assert.equal(afterList.keywordHook, false, 'an earlier save is not undone by a later one')
})

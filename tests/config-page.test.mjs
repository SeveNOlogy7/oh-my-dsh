import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_CONFIG } from '../src/core/defaults.js'
import { parseJsonc } from '../src/core/jsonc.js'
import { createCommands } from '../src/commands/index.js'
import { createFakeContext } from './helpers/fake-context.mjs'
import {
  CONFIG_PAGE_PROTOCOL,
  createConfigPage,
  parseConfigInput,
} from '../src/config-page/index.js'
import { applyPathRemovals, applyPathUpdates, dropNestedPaths, scanJsonc } from '../src/config-page/jsonc-spans.js'
import { collectProblems, unsupportedKeywordsIn, validate } from '../src/config-page/schema.js'
import {
  buildLanguageSnippet,
  languageInfo,
  routingTiers,
} from '../src/config-page/plugin-info.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = JSON.parse(await fs.readFile(path.join(root, 'schema', 'omd-config.schema.json'), 'utf8'))

/** A throwaway directory, optionally pre-filled with files. */
async function tempDir(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-config-page-'))
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
  }
  return dir
}

/** The page service with an isolated home layer, so layer discovery is deterministic. */
function page(home) {
  return createConfigPage({ home, packageRoot: root })
}

// ---------------------------------------------------------------------------
// Schema validator
// ---------------------------------------------------------------------------

test('the shipped schema stays inside the supported keyword subset and accepts the defaults', () => {
  assert.deepEqual(unsupportedKeywordsIn(schema), [], 'the validator would silently skip a schema keyword')
  assert.deepEqual(collectProblems(schema, DEFAULT_CONFIG), [])
  assert.deepEqual(validate(schema, DEFAULT_CONFIG), { ok: true })
})

test('the schema accepts ordered model chains on agents and categories', () => {
  const valid = {
    agents: {
      oracle: {
        chain: [
          'strong',
          { modelRef: 'backup', reasoningEffort: 'high' },
          { provider: 'p', model: 'm', temperature: 0.2, maxTokens: 8000 },
          'provider/model',
        ],
      },
    },
    categories: { deep: { chain: ['strong', 'backup'] } },
  }
  assert.deepEqual(validate(schema, valid), { ok: true })

  for (const bad of [
    { agents: { oracle: { chain: 'strong' } } },
    { agents: { oracle: { chain: [null] } } },
    { agents: { oracle: { chain: [7] } } },
    { categories: { deep: { chain: {} } } },
    { categories: { deep: { chain: [{ temperature: 3 }] } } },
  ]) {
    assert.equal(validate(schema, bad).ok, false, `${JSON.stringify(bad)} must be rejected`)
  }
})

test('the validator names the field and the expectation for a bad value', () => {
  const cases = [
    [{ keywordHook: 'yes' }, /keywordHook must be boolean \(got string "yes"\)/],
    [{ delegation: { maxConcurrent: 0 } }, /delegation\.maxConcurrent must be integer >= 1 \(got 0\)/],
    [{ delegation: { maxDepth: -1 } }, /delegation\.maxDepth must be integer >= 0 \(got -1\)/],
    [{ delegation: { waitTimeoutMs: 1.5 } }, /delegation\.waitTimeoutMs must be integer >= 1 \(got 1\.5\)/],
    [{ delegation: { nope: 1 } }, /delegation\.nope is not an allowed key here/],
    [{ taskSystem: { enabled: 'no' } }, /taskSystem\.enabled must be boolean \(got string "no"\)/],
    [{ diagnostics: { commands: [7] } }, /diagnostics\.commands\.0 must be string \(got 7\)/],
    [{ diagnostics: { commands: [{ args: [] }] } }, /diagnostics\.commands\.0\.command is required/],
    [{ hooks: { commentChecker: 'loud' } }, /hooks\.commentChecker must be one of "off", "warn", "block" \(got string "loud"\)/],
    [{ models: { catalog: { fast: { provider: 'p' } } } }, /models\.catalog\.fast\.model is required/],
    [{ agents: { sisyphus: { temperature: 3 } } }, /agents\.sisyphus\.temperature must be number \| null >= 0 <= 2 \(got 3\)/],
  ]
  for (const [value, expected] of cases) {
    const result = validate(schema, value)
    assert.equal(result.ok, false, `${JSON.stringify(value)} must be rejected`)
    assert.match(result.message, expected)
  }
})

// ---------------------------------------------------------------------------
// JSONC splicing
// ---------------------------------------------------------------------------

test('the splicer keeps comments, trailing commas, and untouched text', () => {
  const source = '{\n  // keep me\n  "a": 1,\n  "b": {\n    "c": 2, // inner\n  },\n}\n'
  const patched = applyPathUpdates(source, [{ path: ['b', 'c'], value: 3 }])
  assert.ok(patched, 'the document must be patchable')
  assert.equal(patched.mode, 'patch')
  assert.match(patched.text, /\/\/ keep me/)
  assert.match(patched.text, /"c": 3, \/\/ inner/)
  assert.match(patched.text, /,\n\}/)
  assert.deepEqual(parseJsonc(patched.text), { a: 1, b: { c: 3 } })
})

test('the splicer inserts missing keys, including whole subtrees and empty objects', () => {
  const inserted = applyPathUpdates('{\n  "a": 1,\n}\n', [{ path: ['b'], value: true }])
  assert.ok(inserted)
  assert.deepEqual(parseJsonc(inserted.text), { a: 1, b: true })
  assert.match(inserted.text, /"a": 1,\n  "b": true/)

  const nested = applyPathUpdates('{\n  "a": 1,\n}\n', [{ path: ['taskSystem', 'enabled'], value: true }])
  assert.ok(nested)
  assert.deepEqual(parseJsonc(nested.text), { a: 1, taskSystem: { enabled: true } })

  const empty = applyPathUpdates('{}', [{ path: ['keywordHook'], value: false }])
  assert.ok(empty)
  assert.deepEqual(parseJsonc(empty.text), { keywordHook: false })

  const two = applyPathUpdates('{}', [
    { path: ['keywordHook'], value: false },
    { path: ['taskSystem'], value: { enabled: true } },
  ])
  assert.ok(two)
  assert.deepEqual(parseJsonc(two.text), { keywordHook: false, taskSystem: { enabled: true } })
})

test('the splicer refuses a document it cannot patch instead of mangling it', () => {
  assert.equal(applyPathUpdates('{ "a": ', [{ path: ['a'], value: 1 }]), null)
  assert.equal(applyPathUpdates('[1, 2]', [{ path: ['a'], value: 1 }]), null)
  assert.throws(() => scanJsonc('{ "a": }'), /expected/)
})

test('a removal deletes the middle member through its own comma and keeps the rest', () => {
  const source = '{\n  // keep this header\n  "a": 1,\n  "b": 2, // about b\n  "c": 3,\n}\n'
  const removed = applyPathRemovals(source, [['b']])
  assert.ok(removed, 'the document must be removable')
  assert.equal(removed.mode, 'patch')
  assert.equal(removed.text, '{\n  // keep this header\n  "a": 1,\n  "c": 3,\n}\n')
  assert.deepEqual(parseJsonc(removed.text), { a: 1, c: 3 })
})

test('a removal of the last member takes the comma before it, not the previous comment', () => {
  // No trailing comma after "b", so the separator is the comma of "a".
  const source = '{\n  "a": 1, // keep a\n  "b": 2\n}\n'
  const removed = applyPathRemovals(source, [['b']])
  assert.ok(removed)
  assert.equal(removed.text, '{\n  "a": 1 // keep a\n}\n', "the previous member's trailing comment survives")
  assert.deepEqual(parseJsonc(removed.text), { a: 1 })

  // With a trailing comma the member's own line goes, and the comma of "a" stays.
  const trailing = applyPathRemovals('{\n  "a": 1, // keep a\n  "b": 2,\n}\n', [['b']])
  assert.ok(trailing)
  assert.equal(trailing.text, '{\n  "a": 1, // keep a\n}\n')
  assert.deepEqual(parseJsonc(trailing.text), { a: 1 })
})

test('a removal that empties a nested object prunes that object too', () => {
  const source = '{\n  "keywordHook": true,\n  "delegation": {\n    "childPreset": null,\n  },\n}\n'
  const removed = applyPathRemovals(source, [['delegation', 'childPreset']])
  assert.ok(removed)
  assert.equal(removed.text, '{\n  "keywordHook": true,\n}\n', 'the emptied parent key is gone, not left as {}')
  assert.deepEqual(parseJsonc(removed.text), { keywordHook: true })

  // Pruning climbs: provider is the only key of fast, of catalog, of models.
  const deep = applyPathRemovals('{ "a": 1, "models": { "catalog": { "fast": { "provider": "p" } } } }', [
    ['models', 'catalog', 'fast', 'provider'],
  ])
  assert.ok(deep)
  assert.deepEqual(parseJsonc(deep.text), { a: 1 })
})

test('a removal handles inline objects, CRLF line endings, and every member of the root', () => {
  const inline = applyPathRemovals('{ "a": 1, "b": 2, "c": 3 }', [['b']])
  assert.ok(inline)
  assert.equal(inline.text.includes('"b"'), false)
  assert.deepEqual(parseJsonc(inline.text), { a: 1, c: 3 })

  const crlf = applyPathRemovals('{\r\n  "a": 1,\r\n  "b": 2,\r\n}\r\n', [['b']])
  assert.ok(crlf)
  assert.equal(crlf.text, '{\r\n  "a": 1,\r\n}\r\n')

  // The document root is never pruned: emptying every key leaves `{}`.
  const swept = applyPathRemovals('{\n  // header\n  "a": 1,\n  "b": 2,\n}\n', [['a'], ['b']])
  assert.ok(swept)
  assert.deepEqual(parseJsonc(swept.text), {})
  assert.match(swept.text, /\/\/ header/, 'a comment above the first member is not the removal of a member')
})

test('a removal path that is not in the document changes nothing, and a nested path is implied', () => {
  const untouched = applyPathRemovals('{\n  "a": 1,\n}\n', [['b'], ['a', 'b']])
  assert.ok(untouched)
  assert.equal(untouched.text, '{\n  "a": 1,\n}\n')
  assert.deepEqual(dropNestedPaths([['a', 'b'], ['a'], ['a'], ['b']]), [['a'], ['b']])

  const nested = applyPathRemovals('{\n  "a": 1,\n  "delegation": {\n    "maxConcurrent": 5,\n  },\n}\n', [
    ['delegation', 'maxConcurrent'],
    ['delegation'],
  ])
  assert.ok(nested)
  assert.deepEqual(parseJsonc(nested.text), { a: 1 })
})

test('the splicer returns null where it cannot compute the span confidently', () => {
  assert.equal(applyPathRemovals('{ "a": ', [['a']]), null)
  assert.equal(applyPathRemovals('[1, 2]', [['a']]), null)
  assert.equal(applyPathRemovals('{ "a": 1, "a": 2 }', [['a']]), null, 'a duplicate key names two members')
})

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

test('read returns the effective configuration, its sources, and its raw object', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc': '{\n  // project layer\n  "keywordHook": false,\n  "delegation": { "maxConcurrent": 3, },\n}\n',
  })
  const read = await page(home).read({ workspace, agentId: 'sisyphus', language: 'zh' })

  assert.equal(read.ok, true)
  assert.equal(read.protocol, CONFIG_PAGE_PROTOCOL)
  assert.equal(read.workspace, path.resolve(workspace))
  assert.equal(read.file, path.join(path.resolve(workspace), '.omd', 'config.jsonc'))
  assert.equal(read.exists, true)
  assert.equal(read.bom, false)
  assert.deepEqual(read.parse, { ok: true })
  assert.equal(read.sources.at(-1), read.file)
  assert.deepEqual(read.diagnostics.filter((entry) => entry.path === read.file), [])
  assert.equal(read.config.keywordHook, false)
  assert.equal(read.config.delegation.maxConcurrent, 3)
  assert.equal(read.config.delegation.maxDepth, 1, 'unset keys keep the documented default')
  assert.deepEqual(read.fileConfig, { keywordHook: false, delegation: { maxConcurrent: 3 } })
})

test('read reports a parse failure and an unknown key as diagnostics', async () => {
  const home = await tempDir()
  const broken = await tempDir({ '.omd/config.jsonc': '{ "keywordHook": tru }\n' })
  const brokenRead = await page(home).read({ workspace: broken, agentId: 'sisyphus', language: 'en' })
  assert.equal(brokenRead.parse.ok, false)
  assert.equal(brokenRead.parse.reason, 'parse')
  assert.equal(brokenRead.fileConfig, null)
  assert.match(brokenRead.parse.detail, /invalid JSONC/)
  assert.equal(brokenRead.config.keywordHook, true, 'the effective config falls back to the default')

  const stray = await tempDir({ '.omd/config.jsonc': '{ "keywordHook": true, "nope": 1 }\n' })
  const strayRead = await page(home).read({ workspace: stray, agentId: 'sisyphus', language: 'en' })
  assert.deepEqual(
    strayRead.diagnostics.filter((entry) => entry.reason === 'unknown-key').map((entry) => entry.detail),
    ['nope'],
  )
})

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

test('write round-trips a valid change and preserves comments and trailing commas', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc':
      '{\n  // Oh-My-DSH project configuration. Comments and trailing commas are allowed.\n  "keywordHook": true,\n  "delegation": {\n    "maxConcurrent": 5,\n    "waitTimeoutMs": 600000,\n  },\n}\n',
  })
  const result = await page(home).set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: { keywordHook: false, delegation: { maxConcurrent: 3 } },
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.write, { mode: 'patch', keys: ['keywordHook', 'delegation.maxConcurrent'], unset: [] })
  assert.equal(result.config.keywordHook, false)
  assert.equal(result.config.delegation.maxConcurrent, 3)
  assert.equal(result.config.delegation.waitTimeoutMs, 600000)

  const text = await fs.readFile(result.file, 'utf8')
  assert.match(text, /\/\/ Oh-My-DSH project configuration\. Comments and trailing commas are allowed\./)
  assert.match(text, /"maxConcurrent": 3/)
  assert.match(text, /"waitTimeoutMs": 600000,/)
  assert.deepEqual(parseJsonc(text), { keywordHook: false, delegation: { maxConcurrent: 3, waitTimeoutMs: 600000 } })
})

test('a model chain round-trips through the write path', async () => {
  const home = await tempDir()
  const workspace = await tempDir({ '.omd/config.jsonc': '{\n  "keywordHook": true\n}\n' })
  const pageService = page(home)
  const chain = ['strong', { provider: 'inline-provider', model: 'inline-model', reasoningEffort: 'high' }]
  const written = await pageService.set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: {
      agents: { oracle: { chain } },
      categories: { deep: { chain: ['inline-provider/inline-model'] } },
      models: { catalog: { strong: { provider: 'deepseek-account', model: 'deepseek-v4' } } },
    },
  })
  assert.equal(written.ok, true)
  const read = await pageService.read({ workspace, agentId: 'sisyphus', language: 'en' })
  assert.deepEqual(read.fileConfig.agents.oracle.chain, chain)
  assert.deepEqual(read.config.agents.oracle.chain, chain)
  assert.deepEqual(read.fileConfig.categories.deep.chain, ['inline-provider/inline-model'])
  assert.deepEqual(read.fileConfig.models.catalog.strong, { provider: 'deepseek-account', model: 'deepseek-v4' })
})

test('write creates a missing file without a BOM and strips one that is present', async () => {
  const home = await tempDir()
  const fresh = await tempDir()
  const created = await page(home).set({ workspace: fresh, agentId: 'sisyphus', language: 'en', patch: { keywordHook: false } })
  assert.equal(created.ok, true)
  assert.equal(created.write.mode, 'create')
  const createdBytes = await fs.readFile(created.file)
  assert.notDeepEqual([...createdBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'a written file must not start with a BOM')
  assert.equal(String.fromCharCode(createdBytes[0]), '{')

  const withBom = await tempDir({ '.omd/config.jsonc': '\uFEFF{ "keywordHook": true }\n' })
  const beforeRead = await page(home).read({ workspace: withBom, agentId: 'sisyphus', language: 'en' })
  assert.equal(beforeRead.bom, true)
  const rewritten = await page(home).set({ workspace: withBom, agentId: 'sisyphus', language: 'en', patch: { keywordHook: false } })
  assert.equal(rewritten.ok, true)
  assert.equal(rewritten.bom, false)
  const bytes = await fs.readFile(rewritten.file)
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'the incoming BOM must not survive a write')
})

test('write rejects an invalid value with the validator message and leaves the file alone', async () => {
  const home = await tempDir()
  const workspace = await tempDir({ '.omd/config.jsonc': '{\n  "keywordHook": true,\n}\n' })
  const pageService = page(home)
  const read = await pageService.read({ workspace, agentId: 'sisyphus', language: 'en' })
  const before = await fs.readFile(read.file, 'utf8')

  const rejected = await pageService.set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: { delegation: { maxConcurrent: 0 } },
  })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.kind, 'validation')
  assert.equal(rejected.error.message, 'delegation.maxConcurrent must be integer >= 1 (got 0)')
  assert.deepEqual(rejected.error.path, ['delegation', 'maxConcurrent'])
  assert.equal(await fs.readFile(read.file, 'utf8'), before, 'a rejected write must not touch the file')

  const unknown = await pageService.set({ workspace, agentId: 'sisyphus', language: 'en', patch: { nope: 1 } })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.kind, 'unknown-key')
  assert.match(unknown.error.message, /^nope is not an allowed key here/)

  const empty = await pageService.set({ workspace, agentId: 'sisyphus', language: 'en', patch: {} })
  assert.equal(empty.ok, false)
  assert.equal(empty.error.kind, 'usage')

  const malformed = await pageService.set({
    workspace: await tempDir({ '.omd/config.jsonc': '{ "keywordHook": tru }\n' }),
    agentId: 'sisyphus',
    language: 'en',
    patch: { keywordHook: false },
  })
  assert.equal(malformed.ok, false)
  assert.equal(malformed.error.kind, 'parse')
  assert.match(malformed.error.message, /cannot be edited until it parses/)
})

test('write reports a pre-existing schema problem instead of blocking on it', async () => {
  const home = await tempDir()
  const workspace = await tempDir({ '.omd/config.jsonc': '{ "keywordHook": true, "skills": { "paths": "nope" } }\n' })
  const result = await page(home).set({ workspace, agentId: 'sisyphus', language: 'en', patch: { keywordHook: false } })
  assert.equal(result.ok, true)
  assert.equal(result.config.keywordHook, false)
  assert.deepEqual(
    result.schemaProblems.map((problem) => problem.path),
    [['skills', 'paths']],
  )
  assert.match(result.schemaProblems[0].message, /skills\.paths must be array/)
})

test('write removes a key path, prunes the object it emptied, and keeps every other comment', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc':
      '{\n  // Oh-My-DSH project configuration.\n  "keywordHook": true,\n  "delegation": {\n    "maxConcurrent": 5,\n    "childPreset": null,\n  },\n}\n',
  })
  const result = await page(home).set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: {},
    unset: [['delegation', 'childPreset']],
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.write, { mode: 'patch', keys: [], unset: ['delegation.childPreset'] })
  assert.deepEqual(result.fileConfig, { keywordHook: true, delegation: { maxConcurrent: 5 } }, 'the file no longer sets the key')
  assert.equal(result.config.delegation.childPreset, null, 'so the shipped default applies again')
  const text = await fs.readFile(result.file, 'utf8')
  assert.match(text, /\/\/ Oh-My-DSH project configuration\./, 'an unrelated comment survives')
  assert.equal(text.includes('childPreset'), false)
  assert.deepEqual(parseJsonc(text), { keywordHook: true, delegation: { maxConcurrent: 5 } })
})

test('a removal the file does not perform changes nothing, and still lets the patch through', async () => {
  const home = await tempDir()
  const workspace = await tempDir({ '.omd/config.jsonc': '{\n  "keywordHook": true,\n}\n' })
  const pageService = page(home)
  const before = await fs.readFile(path.join(workspace, '.omd', 'config.jsonc'), 'utf8')

  // Delegation is inherited from another layer, so there is nothing here to
  // remove: the removal is a no-op and the file stays byte-identical.
  const alone = await pageService.set({ workspace, agentId: 'sisyphus', language: 'en', patch: {}, unset: [['delegation', 'maxDepth']] })
  assert.equal(alone.ok, false)
  assert.equal(alone.error.kind, 'usage')
  assert.match(alone.error.message, /nothing to write/)
  assert.equal(await fs.readFile(path.join(workspace, '.omd', 'config.jsonc'), 'utf8'), before)

  const withPatch = await pageService.set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: { keywordHook: false },
    unset: [['delegation', 'maxDepth']],
  })
  assert.equal(withPatch.ok, true)
  assert.deepEqual(withPatch.write, { mode: 'patch', keys: ['keywordHook'], unset: [] })
  assert.equal(withPatch.config.keywordHook, false)
})

test('patch and unset travel in one request, and the patch wins where they overlap', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc':
      '{\n  "delegation": {\n    "maxConcurrent": 5,\n    "maxDepth": 1,\n  },\n  "taskSystem": { "enabled": false },\n}\n',
  })
  const pageService = page(home)

  const disjoint = await pageService.set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: { delegation: { maxConcurrent: 2 } },
    unset: [['delegation', 'maxDepth']],
  })
  assert.equal(disjoint.ok, true)
  assert.deepEqual(disjoint.write, { mode: 'patch', keys: ['delegation.maxConcurrent'], unset: ['delegation.maxDepth'] })
  assert.deepEqual(disjoint.fileConfig, { delegation: { maxConcurrent: 2 }, taskSystem: { enabled: false } })

  // The same path in both halves: the removal runs first and the patch decides.
  const overlapping = await pageService.set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: { delegation: { maxConcurrent: 4 } },
    unset: [['delegation']],
  })
  assert.equal(overlapping.ok, true)
  assert.deepEqual(overlapping.write, { mode: 'patch', keys: ['delegation.maxConcurrent'], unset: ['delegation'] })
  assert.deepEqual(overlapping.fileConfig, { delegation: { maxConcurrent: 4 }, taskSystem: { enabled: false } })
  assert.equal(overlapping.config.delegation.maxDepth, 1, 'the removed key falls back to the default')
})

test('a removal the schema rejects leaves the file byte-identical', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc': '{ "models": { "catalog": { "fast": { "provider": "p", "model": "m" } } } }\n',
  })
  const pageService = page(home)
  const read = await pageService.read({ workspace, agentId: 'sisyphus', language: 'en' })
  const before = await fs.readFile(read.file, 'utf8')

  const rejected = await pageService.set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: {},
    unset: [['models', 'catalog', 'fast', 'model']],
  })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.kind, 'validation')
  assert.equal(rejected.error.message, 'models.catalog.fast.model is required', "the validator's own message")
  assert.deepEqual(rejected.error.path, ['models', 'catalog', 'fast', 'model'])
  assert.equal(await fs.readFile(read.file, 'utf8'), before, 'a rejected removal must not touch the file')
})

test('a removal the splicer cannot place falls back to a rewrite that still removes it', async () => {
  const home = await tempDir()
  // A duplicate key names two members, so which span to delete is undecidable:
  // the write has to fall back to rewriting the document, and that rewrite must
  // reflect the removal (the alternative is a file that disagrees with the
  // validated document the page just showed).
  const workspace = await tempDir({
    '.omd/config.jsonc': '{ "keywordHook": true, "delegation": { "maxDepth": 1, "maxDepth": 2 } }\n',
  })
  const result = await page(home).set({
    workspace,
    agentId: 'sisyphus',
    language: 'en',
    patch: {},
    unset: [['delegation', 'maxDepth']],
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.write, { mode: 'rewrite', keys: [], unset: ['delegation.maxDepth'] })
  assert.deepEqual(parseJsonc(await fs.readFile(result.file, 'utf8')), { keywordHook: true })
})

test('the envelope carries the shipped defaults and every layer with the keys it sets', async () => {
  const home = await tempDir({ '.omd/config.jsonc': '{\n  "keywordHook": false,\n  "agents": { "sisyphus": { "model": "m" } },\n}\n' })
  const workspace = await tempDir({ '.omd/config.jsonc': '{\n  "delegation": { "maxConcurrent": 2 },\n}\n' })
  const pageService = page(home)

  const read = await pageService.read({ workspace, agentId: 'sisyphus', language: 'en' })
  assert.deepEqual(read.defaults, DEFAULT_CONFIG, 'the page shows what an unset key would inherit')
  assert.deepEqual(read.layers, [
    { file: path.join(home, '.omd', 'config.jsonc'), keys: ['agents', 'keywordHook'] },
    { file: read.file, keys: ['delegation'] },
  ])
  assert.deepEqual(read.layers.map((layer) => layer.file), read.sources, 'layers follow the source order')

  const written = await pageService.set({ workspace, agentId: 'sisyphus', language: 'en', patch: { keywordHook: true } })
  assert.equal(written.ok, true)
  assert.deepEqual(written.defaults, DEFAULT_CONFIG)
  assert.deepEqual(written.layers.map((layer) => layer.keys), [['agents', 'keywordHook'], ['delegation', 'keywordHook']])
})

// ---------------------------------------------------------------------------
// Command input grammar and the plugin section
// ---------------------------------------------------------------------------

test('parseConfigInput separates the read, set, and usage forms', () => {
  assert.deepEqual(parseConfigInput(''), { kind: 'read' })
  assert.deepEqual(parseConfigInput('   '), { kind: 'read' })
  assert.deepEqual(parseConfigInput(' set {"keywordHook":false} '), { kind: 'set', patch: { keywordHook: false }, unset: [] })
  assert.equal(parseConfigInput('set').kind, 'usage')
  assert.equal(parseConfigInput('set [1]').kind, 'usage')
  assert.match(parseConfigInput('set {').message, /not valid JSON/)
  assert.match(parseConfigInput('bogus').message, /usage: \/omd-config/)
})

test('parseConfigInput reads the structured patch+unset form for both of its optional keys', () => {
  assert.deepEqual(parseConfigInput('set {"patch":{"keywordHook":false},"unset":[["delegation","maxDepth"]]}'), {
    kind: 'set',
    patch: { keywordHook: false },
    unset: [['delegation', 'maxDepth']],
  })
  // Either key may stand alone: the page sends `{patch:{},unset:[…]}` when only
  // removals are staged, and a hand-typed request may name only a patch.
  assert.deepEqual(parseConfigInput('set {"unset":[["delegation","maxDepth"]]}'), {
    kind: 'set',
    patch: {},
    unset: [['delegation', 'maxDepth']],
  })
  assert.deepEqual(parseConfigInput('set {"patch":{"keywordHook":false}}'), {
    kind: 'set',
    patch: { keywordHook: false },
    unset: [],
  })
  // Nothing to do is the grammar's business, not the parser's: both are empty,
  // so the write path answers its "nothing to write" usage error.
  assert.deepEqual(parseConfigInput('set {"patch":{},"unset":[]}'), { kind: 'set', patch: {}, unset: [] })
  // A real key next to the structured ones makes it a patch object, which the
  // write path then refuses as an unknown top-level key.
  assert.deepEqual(parseConfigInput('set {"keywordHook":true,"patch":{}}'), {
    kind: 'set',
    patch: { keywordHook: true, patch: {} },
    unset: [],
  })
})

test('parseConfigInput refuses a malformed unset path with the usage line for both forms', () => {
  const cases = [
    ['set {"unset":"delegation.maxDepth"}', /unset must be an array of key paths/],
    ['set {"unset":[["delegation",7]]}', /every unset path segment must be a non-empty string/],
    ['set {"unset":[[""]]}', /every unset path segment must be a non-empty string/],
    ['set {"unset":[[]]}', /an unset path must name at least one key/],
    ['set {"unset":[["a"],"b"]}', /each unset path must be an array of key names/],
    ['set {"unset":null}', /unset must be an array of key paths/],
    ['set {"patch":5}', /"patch" must be a JSON object/],
  ]
  for (const [input, expected] of cases) {
    const parsed = parseConfigInput(input)
    assert.equal(parsed.kind, 'usage', `${input} must be refused`)
    assert.match(parsed.message, expected)
    assert.match(parsed.message, /usage: \/omd-config \[set <json object> \| set \{"patch"/, 'both write forms are documented')
  }
})

test('the plugin section reports the row language and generates the exact profile override', async () => {
  assert.deepEqual(languageInfo('zh'), {
    value: 'zh',
    supported: ['en', 'zh'],
    source: 'plugin row Config (cordis.patch.yml)',
    recognized: true,
  })
  assert.equal(languageInfo(undefined).value, 'en')

  // The runtime is one top-level row now, so the override is that row plus the
  // one key it carries; there is no nested preset row left to restate.
  const snippet = buildLanguageSnippet({ language: 'zh' })
  assert.equal(snippet.rowId, 'omd-runtime')
  assert.equal(snippet.presetFile, 'presets/omd-runtime.patch.yml')
  assert.match(snippet.text, /^- id: omd-runtime$/m)
  assert.match(snippet.text, /^  config:$/m)
  assert.match(snippet.text, /^\s+language: "zh"$/m)
  // The row's specifier is the package name, which a release rename changes;
  // derive it rather than pinning the pre-rename value.
  const pkgName = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name
  const rowLine = `name: ${JSON.stringify(pkgName)}`
  assert.ok(
    snippet.text.split('\n').some((line) => line.trim() === rowLine),
    `the override names the runtime package (${rowLine})`,
  )
})

test('the routing tiers resolve per category and name their source', () => {
  const tiers = routingTiers({ categories: { quick: { modelRef: 'fast' } }, models: { catalog: { fast: { provider: 'p', model: 'm' } } } })
  const quick = tiers.find((tier) => tier.name === 'quick')
  assert.deepEqual({ source: quick.source, modelRef: quick.modelRef, provider: quick.provider, model: quick.model }, {
    source: 'project',
    modelRef: 'fast',
    provider: 'p',
    model: 'm',
  })
  const deep = tiers.find((tier) => tier.name === 'deep')
  assert.equal(deep.source, 'builtin')
  assert.equal(deep.modelRef, null)
  assert.equal(deep.model, null, 'a built-in tier inherits the session model')
  assert.equal(tiers.length, 8, 'every built-in category is listed')
})

// ---------------------------------------------------------------------------
// The session-scoped command the page drives
// ---------------------------------------------------------------------------

test('the /omd-config command serves the page: read, write, and a rejected value', async () => {
  const workspace = await tempDir({
    '.omd/config.jsonc': '{\n  // keep this comment\n  "keywordHook": true,\n}\n',
  })
  const { ctx } = createFakeContext({ cwd: workspace })
  const runtime = { ctx, agentId: 'sisyphus', language: 'en', stateFor: async () => ({ cwd: workspace }) }
  const definition = createCommands(runtime).find((command) => command.name === 'omd-config')
  assert.ok(definition, 'the runtime row still registers omd-config')
  assert.equal(definition.input.hint, 'set <json>')

  const agent = { id: 'session-1' }
  const signal = new AbortController().signal

  const read = await definition.handler({ agent, rawInput: '', signal })
  assert.equal(read.kind, 'success')
  const envelope = JSON.parse(read.text)
  assert.equal(envelope.protocol, CONFIG_PAGE_PROTOCOL)
  assert.equal(envelope.workspace, path.resolve(workspace))
  assert.equal(envelope.file, path.join(path.resolve(workspace), '.omd', 'config.jsonc'))
  assert.equal(envelope.config.keywordHook, true)
  assert.ok(envelope.sources.includes(envelope.file))
  assert.equal(envelope.plugin.language.value, 'en')
  assert.ok(Array.isArray(envelope.plugin.tiers))

  const written = await definition.handler({
    agent,
    rawInput: 'set {"keywordHook":false,"delegation":{"maxConcurrent":2}}',
    signal,
  })
  assert.equal(written.kind, 'success')
  const writtenEnvelope = JSON.parse(written.text)
  assert.equal(writtenEnvelope.config.keywordHook, false)
  assert.equal(writtenEnvelope.config.delegation.maxConcurrent, 2)
  const text = await fs.readFile(writtenEnvelope.file, 'utf8')
  assert.match(text, /\/\/ keep this comment/)
  assert.notDeepEqual([...(await fs.readFile(writtenEnvelope.file)).subarray(0, 3)], [0xef, 0xbb, 0xbf])

  // A rejected value answers as an error result whose text is the validator's
  // own message, which is what the page shows and what the chat cell renders.
  const rejected = await definition.handler({ agent, rawInput: 'set {"delegation":{"maxDepth":-1}}', signal })
  assert.equal(rejected.kind, 'error')
  assert.equal(rejected.text, 'delegation.maxDepth must be integer >= 0 (got -1)')

  // The structured form reaches the store through the human command too: the
  // handler forwards both halves, so a typed request can remove keys as well.
  const removed = await definition.handler({
    agent,
    rawInput: 'set {"patch":{"taskSystem":{"enabled":true}},"unset":[["keywordHook"]]}',
    signal,
  })
  assert.equal(removed.kind, 'success')
  const removedEnvelope = JSON.parse(removed.text)
  assert.deepEqual(removedEnvelope.write, { mode: 'patch', keys: ['taskSystem.enabled'], unset: ['keywordHook'] })
  assert.equal(removedEnvelope.config.keywordHook, true, 'the inherited value applies again')
  assert.equal(Object.hasOwn(removedEnvelope.fileConfig, 'keywordHook'), false)
  assert.match(await fs.readFile(removedEnvelope.file, 'utf8'), /\/\/ keep this comment/)

  const usage = await definition.handler({ agent, rawInput: 'bogus', signal })
  assert.equal(usage.kind, 'error')
  assert.match(usage.text, /usage: \/omd-config/)

  // Every other OMD command keeps its original shape.
  assert.equal(createCommands(runtime).length, 13)
  assert.deepEqual(
    createCommands(runtime).filter((command) => command.name === 'omd-config').map((command) => Object.keys(command).sort()),
    [['description', 'handler', 'input', 'name']],
  )
})

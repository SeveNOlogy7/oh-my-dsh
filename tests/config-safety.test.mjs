/**
 * Regression tests for D1 in `docs/feature-verification-2026-11-13.md`: blocked
 * key stripping was only as deep as the level `mergeDeep` happened to iterate.
 *
 * The two load-bearing cases are the paths that copy a whole subtree — the
 * assignment branch of `mergeDeep` when the target path does not already exist,
 * and `normalizeConfig`'s top-level copy — because both used to carry a nested
 * `__proto__`/`prototype`/`constructor` into the resolved configuration. The
 * store test drives the write path, where the leaked key made the JSONC splice
 * unfaithful and silently degraded the write to a comment-losing whole-document
 * rewrite. `Object.prototype` was never polluted in any of these cases; the
 * payload stayed an own data property, which is why the assertions below check
 * ownership and the serialized form, not just a global.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { loadConfig, mergeDeep, normalizeConfig, sanitizeValue } from '../src/core/config.js'
import { createConfigStore } from '../src/config-page/index.js'
import { parseJsonc } from '../src/core/jsonc.js'

const BLOCKED = ['__proto__', 'prototype', 'constructor']
/** The payload every fixture carries, so one string ties the leak to the values. */
const PAYLOAD = 'polluted'

/** A throwaway directory, optionally pre-filled with files. */
async function tempDir(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-config-safety-'))
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
  }
  return dir
}

/** Write one workspace layer and load it through the real loader, that layer only. */
async function loadLayer(text) {
  const workspace = await tempDir({ '.omd/config.jsonc': text })
  const file = path.join(workspace, '.omd', 'config.jsonc')
  const loaded = await loadConfig({ workspace, home: await tempDir(), candidates: [file] })
  return { ...loaded, file }
}

/** The resolved config carries neither a blocked key nor its payload. */
function assertClean(config, where) {
  for (const key of BLOCKED) {
    assert.equal(Object.hasOwn(config, key), false, `${where}: ${key} must not be an own key of the resolved config`)
  }
  const json = JSON.stringify(config)
  assert.equal(json.includes(PAYLOAD), false, `${where}: no blocked-key payload reaches the resolved config`)
  assert.equal(json.includes('__proto__'), false, `${where}: no __proto__ token survives serialization`)
  assert.equal(Object.prototype[PAYLOAD], undefined, `${where}: Object.prototype must not be polluted`)
  assert.equal(Object.getPrototypeOf(config), Object.prototype, `${where}: the config prototype is still Object.prototype`)
}

test('sanitizeValue deep-copies a value while dropping blocked keys at every depth', () => {
  const source = JSON.parse(
    '{"fresh":{"__proto__":{"polluted":"fresh"},"keep":1},' +
      '"list":[{"constructor":{"prototype":{"polluted":"ctor"}},"keep":2}],' +
      '"prototype":{"polluted":"proto"},"plain":3,"text":"v","nil":null,"flag":false}',
  )
  assert.equal(Object.hasOwn(source.fresh, '__proto__'), true, 'the fixture really carries an own __proto__ key')

  const clean = sanitizeValue(source)
  assert.deepEqual(clean, { fresh: { keep: 1 }, list: [{ keep: 2 }], plain: 3, text: 'v', nil: null, flag: false })
  assert.notEqual(clean.fresh, source.fresh, 'the copy never aliases the caller object')
  assert.notEqual(clean.list, source.list)
  assert.equal(Object.getPrototypeOf(clean), Object.prototype)
  // Everything that is not a plain object is returned as-is, so values a caller
  // passes through keep their identity and their type.
  assert.equal(sanitizeValue(5), 5)
  assert.equal(sanitizeValue('v'), 'v')
  assert.equal(sanitizeValue(null), null)
  assert.equal(sanitizeValue(undefined), undefined)
})

test('mergeDeep strips blocked keys from a whole subtree it assigns', () => {
  const merged = mergeDeep({ base: true }, JSON.parse('{"brandNew":{"__proto__":{"polluted":"merge"},"promptAppend":"ok"},"a":1}'))
  assert.deepEqual(merged, { base: true, brandNew: { promptAppend: 'ok' }, a: 1 })
  assert.equal(Object.hasOwn(merged.brandNew, '__proto__'), false, 'the target path did not exist, so this was the assignment hole')
  assert.equal(Object.getPrototypeOf(merged.brandNew), Object.prototype)
  assert.equal(Object.prototype[PAYLOAD], undefined)

  // The recursion branch already stripped its own level; it must keep doing so.
  const nested = mergeDeep({ a: { b: 1 } }, JSON.parse('{"a":{"b":2,"__proto__":{"polluted":"deep"}}}'))
  assert.deepEqual(nested, { a: { b: 2 } })
})

test('normalizeConfig strips a nested blocked key from the top-level copy it makes', () => {
  const diagnostics = []
  const config = normalizeConfig(
    JSON.parse(
      '{"agents":{"oracle":{"__proto__":{"polluted":"normalize"},"promptAppend":"ok"}},' +
        '"constructor":{"prototype":{"polluted":"ctor"}}}',
    ),
    diagnostics,
  )
  assert.equal(config.agents.oracle.promptAppend, 'ok')
  assert.equal(Object.hasOwn(config.agents.oracle, '__proto__'), false)
  assertClean(config, 'normalizeConfig')
  assert.deepEqual(
    diagnostics.filter((entry) => entry.reason === 'unknown-key'),
    [],
    'every key in the fixture is a real top-level configuration key',
  )
})

test('a nested blocked key under a path the defaults do not own never reaches the resolved config', async () => {
  const loaded = await loadLayer(
    '{\n  // keep me: a comment is not a configuration key\n  "agents": {\n    "oracle": {\n      "__proto__": { "polluted": "file" },\n      "promptAppend": "ok"\n    }\n  },\n  "telemetry": true\n}\n',
  )
  const oracle = loaded.config.agents.oracle
  assert.equal(oracle.promptAppend, 'ok', 'the legitimate sibling of the blocked key still resolves')
  assert.equal(
    Object.hasOwn(oracle, '__proto__'),
    false,
    'agents.oracle does not exist in the defaults, so this is the whole-subtree assignment',
  )
  assert.equal(Object.getPrototypeOf(oracle), Object.prototype)
  assert.equal(loaded.config.telemetry, true)
  assertClean(loaded.config, 'loadConfig')
})

test('a blocked key directly under an object path the defaults own is still stripped', async () => {
  const loaded = await loadLayer(
    '{\n  "hooks": { "__proto__": { "polluted": "hooks" }, "commentChecker": "off" },\n  "delegation": { "__proto__": { "polluted": "delegation" }, "maxConcurrent": 3 }\n}\n',
  )
  assert.equal(loaded.config.hooks.commentChecker, 'off')
  assert.equal(Object.hasOwn(loaded.config.hooks, '__proto__'), false)
  assert.equal(loaded.config.delegation.maxConcurrent, 3)
  assert.equal(Object.hasOwn(loaded.config.delegation, '__proto__'), false)
  assertClean(loaded.config, 'loadConfig')
})

test('blocked keys deep inside an array element are stripped', async () => {
  const loaded = await loadLayer(
    '{\n  "agents": {\n    "fresh-agent": {\n      "chain": [\n' +
      '        { "provider": "p", "model": "m", "constructor": { "prototype": { "polluted": "chain" } } },\n' +
      '        { "model": "n", "prototype": { "polluted": "chain2" } }\n' +
      '      ]\n    }\n  }\n}\n',
  )
  const chain = loaded.config.agents['fresh-agent'].chain
  assert.equal(Array.isArray(chain), true)
  assert.equal(chain.length, 2, 'the array keeps its shape and every legitimate element')
  assert.equal(chain[0].provider, 'p')
  assert.equal(Object.hasOwn(chain[0], 'constructor'), false)
  assert.equal(chain[1].model, 'n')
  assert.equal(Object.hasOwn(chain[1], 'prototype'), false)
  assertClean(loaded.config, 'loadConfig')
})

test('the config-store splices a nested-blocked-key patch faithfully instead of rewriting the file', async () => {
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc': '{\n  // Oh-My-DSH project configuration. This comment must survive.\n  "keywordHook": true,\n}\n',
  })
  const store = createConfigStore({ home })
  const file = path.join(workspace, '.omd', 'config.jsonc')
  const patch = JSON.parse('{"agents":{"oracle":{"__proto__":{"polluted":"store"},"promptAppend":"ok"}}}')
  assert.equal(Object.hasOwn(patch.agents.oracle, '__proto__'), true, 'the wire patch really carries an own __proto__ key')

  const result = await store.write(workspace, patch)
  assert.equal(result.ok, true)
  assert.equal(result.write.mode, 'patch', 'the splice is faithful, so no whole-document rewrite')
  assert.deepEqual(result.write.keys, ['agents.oracle.promptAppend'], 'only the legitimate leaf is written')
  assert.equal(result.config.agents.oracle.promptAppend, 'ok')
  assert.equal(Object.hasOwn(result.config.agents.oracle, '__proto__'), false)

  const text = await fs.readFile(file, 'utf8')
  assert.match(text, /\/\/ Oh-My-DSH project configuration\. This comment must survive\./)
  assert.equal(text.includes('__proto__'), false, 'the blocked key never reaches the file')
  assert.equal(text.includes(PAYLOAD), false)
  assert.deepEqual(parseJsonc(text), { keywordHook: true, agents: { oracle: { promptAppend: 'ok' } } })
  assert.equal(Object.prototype[PAYLOAD], undefined)

  // With no file to splice into, the store serializes the validated document,
  // so the create branch is the other path that must be equally clean.
  const created = await store.write(await tempDir(), patch)
  assert.equal(created.ok, true)
  assert.equal(created.write.mode, 'create')
  const createdText = await fs.readFile(created.file, 'utf8')
  assert.equal(createdText.includes('__proto__'), false)
  assert.equal(created.config.agents.oracle.promptAppend, 'ok')
})

test('a patch made only of blocked keys is refused instead of rewriting the file', async () => {
  // The sanitized patch leaves empty parents the JSONC splicer never emits, so
  // writing it used to degrade to a whole-document rewrite for no change and
  // lose every comment. A patch with no writable leaf must be a usage refusal.
  const home = await tempDir()
  const workspace = await tempDir({
    '.omd/config.jsonc': '{\n  // This comment must survive.\n  "keywordHook": true,\n}\n',
  })
  const store = createConfigStore({ home })
  const file = path.join(workspace, '.omd', 'config.jsonc')
  const before = await fs.readFile(file, 'utf8')
  const patch = JSON.parse('{"agents":{"oracle":{"__proto__":{"polluted":"only"}}}}')

  const result = await store.write(workspace, patch)
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'usage')
  assert.match(result.error.message, /no writable keys/)
  assert.equal(await fs.readFile(file, 'utf8'), before, 'the file is byte-identical, so the comment survives')
  assert.equal(Object.prototype[PAYLOAD], undefined)
})

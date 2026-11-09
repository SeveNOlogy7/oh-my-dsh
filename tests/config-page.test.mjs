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
import { applyPathUpdates, scanJsonc } from '../src/config-page/jsonc-spans.js'
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

// ---------------------------------------------------------------------------
// Schema validator
// ---------------------------------------------------------------------------

test('the shipped schema stays inside the supported keyword subset and accepts the defaults', () => {
  assert.deepEqual(unsupportedKeywordsIn(schema), [], 'the validator would silently skip a schema keyword')
  assert.deepEqual(collectProblems(schema, DEFAULT_CONFIG), [])
  assert.deepEqual(validate(schema, DEFAULT_CONFIG), { ok: true })
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
  assert.deepEqual(result.write, { mode: 'patch', keys: ['keywordHook', 'delegation.maxConcurrent'] })
  assert.equal(result.config.keywordHook, false)
  assert.equal(result.config.delegation.maxConcurrent, 3)
  assert.equal(result.config.delegation.waitTimeoutMs, 600000)

  const text = await fs.readFile(result.file, 'utf8')
  assert.match(text, /\/\/ Oh-My-DSH project configuration\. Comments and trailing commas are allowed\./)
  assert.match(text, /"maxConcurrent": 3/)
  assert.match(text, /"waitTimeoutMs": 600000,/)
  assert.deepEqual(parseJsonc(text), { keywordHook: false, delegation: { maxConcurrent: 3, waitTimeoutMs: 600000 } })
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

// ---------------------------------------------------------------------------
// Command input grammar and the plugin section
// ---------------------------------------------------------------------------

test('parseConfigInput separates the read, set, and usage forms', () => {
  assert.deepEqual(parseConfigInput(''), { kind: 'read' })
  assert.deepEqual(parseConfigInput('   '), { kind: 'read' })
  assert.deepEqual(parseConfigInput(' set {"keywordHook":false} '), { kind: 'set', patch: { keywordHook: false } })
  assert.equal(parseConfigInput('set').kind, 'usage')
  assert.equal(parseConfigInput('set [1]').kind, 'usage')
  assert.match(parseConfigInput('set {').message, /not valid JSON/)
  assert.match(parseConfigInput('bogus').message, /usage: \/omd-config/)
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
  const { ctx } = createFakeContext({ cwd: workspace, agentPreset: 'omd-sisyphus' })
  const runtime = { ctx, agentId: 'sisyphus', language: 'en', stateFor: async () => ({ cwd: workspace }) }
  const definition = createCommands(runtime).find((command) => command.name === 'omd-config')
  assert.ok(definition, 'the preset still registers omd-config')
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

// ---------------------------------------------------------------------------
// Client half: structure and render smoke tests (no browser available)
// ---------------------------------------------------------------------------

/** Minimal React runtime: enough to render a hook-using function component. */
function createReactStub() {
  const states = []
  const refs = []
  let effects = []
  let cursor = 0
  const lib = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat() }
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [
        states[index],
        (next) => {
          states[index] = typeof next === 'function' ? next(states[index]) : next
        },
      ]
    },
    useRef(initial) {
      const index = cursor
      cursor += 1
      if (!(index in refs)) refs[index] = { current: initial }
      return refs[index]
    },
    useEffect(fn) {
      cursor += 1
      effects.push(fn)
    },
  }
  return {
    lib,
    render(component, props) {
      cursor = 0
      effects = []
      const tree = component(props)
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      return tree
    },
  }
}

function flatten(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out)
    return out
  }
  if (node.children) flatten(node.children, out)
  return out
}

function find(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate)
      if (hit !== null) return hit
    }
    return null
  }
  if (node.props && predicate(node)) return node
  return node.children ? find(node.children, predicate) : null
}

/** Load ui/client.js the way the browser module table does. */
function loadClientModule() {
  const registrations = []
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  try {
    // client.js is a classic script (no imports or exports): running its body is
    // exactly what the browser does, and it only registers one factory.
    const source = readFileSync(path.join(root, 'ui', 'client.js'), 'utf8')
    new Function(source)()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  assert.equal(registrations.length, 1, 'client.js must register exactly one module')
  return registrations[0]
}

test('the client half registers its command cells and the settings section', async () => {
  const source = await fs.readFile(path.join(root, 'ui', 'client.js'), 'utf8')
  assert.equal((source.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
  assert.ok(!/<[A-Za-z][^>]*>/.test(source), 'client.js must not contain JSX or HTML markup')
  assert.match(source, /id: 'omd-ui'/)

  const registration = loadClientModule()
  assert.equal(registration.id, 'omd-ui')

  const react = createReactStub()
  const clientModule = registration.factory((specifier) => {
    if (specifier === 'react') return react.lib
    throw new Error(`unexpected require("${specifier}")`)
  })
  // The Client context refuses a property access it was not injected with, so
  // the list names every service the half reaches: `remote.commands` is a
  // separate declaration from `remote` and omitting it broke the live page.
  assert.deepEqual(clientModule.inject, ['slots', 'locale', 'sessions', 'remote', 'remote.commands'])

  const injectionKeys = []
  const registered = []
  const dictionaries = {}
  const ctx = {
    slots: {
      inject(key, callback) {
        injectionKeys.push(key)
        callback()
        return () => {}
      },
      register(options, Component) {
        const handle = { options, Component }
        registered.push(handle)
        return () => {}
      },
    },
    get(name) {
      if (name !== 'locale') return undefined
      return {
        register(ns, dictionary) {
          dictionaries[ns] = dictionary
          return () => {}
        },
        bind(ns) {
          return (key) => {
            const dictionary = dictionaries[ns]
            return dictionary && dictionary.en[key] !== undefined ? dictionary.en[key] : key
          }
        },
      }
    },
    effect(fn) {
      return fn()
    },
  }
  clientModule.apply(ctx)

  assert.deepEqual(injectionKeys, ['conversation.chat.commandview', 'settings.section'])
  const cells = registered.filter((handle) => handle.options.name === 'conversation.chat.commandview')
  assert.ok(cells.length >= 10, 'every OMD command keeps its cell')
  assert.ok(cells.some((handle) => handle.options.key === 'omd-config'))

  const section = registered.find((handle) => handle.options && handle.options.name === 'settings.section')
  assert.ok(section, 'the settings section is registered')
  assert.equal(section.options.id, 'omd-config')
  assert.equal(section.options.locale, 'omd-config-page')
  assert.equal(section.options.label(), 'OMD')
  const injected = section.options.inject()
  assert.equal(typeof injected.controller.run, 'function')
  assert.equal(typeof injected.fallbackT, 'function')
  assert.equal(injected.fallbackT('title'), 'OMD configuration')

  const dictionary = dictionaries['omd-config-page']
  assert.ok(dictionary, 'the page registers its own locale dictionaries')
  assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.zh).sort())
  assert.ok(Object.keys(dictionary.en).length > 20)

  // Render the loaded page with a stubbed transport, then change one field and
  // save: this exercises the page's own patch building without a browser.
  const envelope = {
    protocol: CONFIG_PAGE_PROTOCOL,
    ok: true,
    workspace: 'C:\\ws',
    file: 'C:\\ws\\.omd\\config.jsonc',
    exists: true,
    bom: false,
    parse: { ok: true },
    sources: ['C:\\ws\\.omd\\config.jsonc'],
    diagnostics: [],
    config: {
      keywordHook: true,
      delegation: { maxConcurrent: 5, maxDepth: 1, defaultBackground: false, waitTimeoutMs: 600000 },
      taskSystem: { enabled: false },
      diagnostics: { commands: [] },
      agents: {},
      categories: {},
      models: { catalog: {} },
    },
    plugin: {
      compositionTime: true,
      language: { value: 'en', supported: ['en', 'zh'], source: 'plugin row Config', recognized: true },
      tiers: [{ name: 'quick', description: '', modelRef: null, provider: 'p', model: 'm', source: 'builtin' }],
      snippet: '- id: preset-omd-sisyphus\n  name: "@deepseek-ai/dsh-agent-preset"\n  config:\n    id: omd-sisyphus\n',
    },
  }
  const calls = []
  const controller = {
    async run(line) {
      calls.push(line)
      return { envelope }
    },
  }
  const props = { controller }
  let tree = react.render(section.Component, props)
  await settle()
  tree = react.render(section.Component, props)

  const text = flatten(tree).join('\n')
  assert.ok(text.includes('OMD configuration'), 'the section renders its localized title')
  assert.ok(text.includes('C:\\ws\\.omd\\config.jsonc'), 'the section shows the workspace file')
  assert.ok(text.includes('Save changes'), 'the save action is rendered')
  assert.deepEqual(calls, ['/omd-config'])

  const checkbox = find(tree, (node) => node.type === 'input' && node.props.type === 'checkbox')
  assert.ok(checkbox, 'the keyword-hook toggle is rendered')
  checkbox.props.onChange({ target: { checked: false } })
  tree = react.render(section.Component, props)
  const save = find(tree, (node) => typeof node.props.onClick === 'function' && Array.isArray(node.children) && node.children.includes('Save changes'))
  assert.ok(save && typeof save.props.onClick === 'function', 'the save button is clickable')
  save.props.onClick()
  await settle()
  assert.deepEqual(calls, ['/omd-config', '/omd-config set {"keywordHook":false}'])
})

test('the page says so when it has no OMD session instead of failing silently', async () => {
  const registration = loadClientModule()
  const react = createReactStub()
  const clientModule = registration.factory(() => react.lib)
  const section = { Component: null }
  const ctx = {
    slots: {
      inject(key, callback) {
        const handles = callback()
        if (Array.isArray(handles)) return () => {}
        return () => {}
      },
      register(options, Component) {
        if (options.name === 'settings.section') section.Component = Component
        return () => {}
      },
    },
    get() {
      return undefined
    },
    effect(fn) {
      return fn()
    },
  }
  clientModule.apply(ctx)
  assert.ok(section.Component, 'the section registers without a locale or session service')

  const controller = { async run() { return { error: { kind: 'no-session', message: null } } } }
  const props = { controller }
  react.render(section.Component, props)
  await settle()
  const tree = react.render(section.Component, props)
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('No OMD session is open'))
  assert.ok(text.includes('Retry'))
})

/**
 * The browser half of the settings page, rendered without a browser.
 *
 * These tests exercise the client contract that a Host test cannot see: which
 * controls a key gets, which write form the page chooses, what the dirty state
 * means, and how the page behaves against a Host from before this page version.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  byId,
  buttonByText,
  createHarness,
  fieldByLabel,
  findAll,
  find,
  flatten,
  root,
} from './helpers/client-harness.mjs'

const CONFIG_FILE = 'E:\\ws\\.omd\\config.jsonc'

/** A complete Host envelope, i.e. what the current Host half answers. */
function envelope(overrides = {}) {
  const base = {
    protocol: 1,
    ok: true,
    workspace: 'E:\\ws',
    file: CONFIG_FILE,
    exists: true,
    bom: false,
    parse: { ok: true },
    sources: ['C:\\home\\.omd\\config.jsonc', CONFIG_FILE],
    layers: [
      { file: 'C:\\home\\.omd\\config.jsonc', keys: ['delegation'] },
      { file: CONFIG_FILE, keys: ['delegation'] },
    ],
    defaults: {
      keywordHook: true,
      keywords: { ultrawork: true, team: true, hyperplan: true },
      taskSystem: { enabled: false },
      delegation: { maxConcurrent: 5, maxDepth: 1, defaultBackground: false, waitTimeoutMs: 600000, childPreset: null },
      ultrawork: { maxContinuationRounds: 20, requirePlanGate: true, requireBaseline: true, dualEvidence: true },
      hooks: {
        commentChecker: 'warn',
        todoContinuation: true,
        modelRouting: true,
        prometheusGuard: true,
        notepadGuard: true,
        planValidator: true,
      },
      rules: { paths: ['.omd/rules'], maxBytes: 65536 },
      diagnostics: { commands: [] },
      agents: {},
      categories: {},
      models: { catalog: {} },
    },
    diagnostics: [],
    config: {
      keywordHook: true,
      keywords: { ultrawork: true, team: true, hyperplan: true },
      taskSystem: { enabled: false },
      delegation: { maxConcurrent: 3, maxDepth: 1, defaultBackground: false, waitTimeoutMs: 600000, childPreset: null },
      ultrawork: { maxContinuationRounds: 20, requirePlanGate: true, requireBaseline: true, dualEvidence: true },
      hooks: {
        commentChecker: 'warn',
        todoContinuation: true,
        modelRouting: true,
        prometheusGuard: true,
        notepadGuard: true,
        planValidator: true,
      },
      rules: { paths: ['.omd/rules'], maxBytes: 65536 },
      diagnostics: { commands: [] },
      agents: {},
      categories: {},
      models: { catalog: {} },
    },
    fileConfig: { delegation: { maxConcurrent: 3 } },
    plugin: {
      language: { value: 'en', supported: ['en', 'zh'], source: 'plugin row Config', recognized: true },
      tiers: [],
      snippet: '- id: omd-runtime\n  name: "@jhcai11/oh-my-dsh"\n',
    },
  }
  return Object.assign(base, overrides)
}

/** The `/omd-config set …` payload of one recorded line. */
function payloadOf(line) {
  const prefix = '/omd-config set '
  assert.ok(line.startsWith(prefix), `expected a set line, got: ${line}`)
  return JSON.parse(line.slice(prefix.length))
}

// Registration and localization

test('the module keeps its command cells and registers the settings section', () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }] })
  assert.equal(harness.registration.id, 'omd-ui')
  assert.deepEqual(harness.clientModule.inject, ['slots', 'locale', 'sessions'])

  const cells = harness.registered.filter((handle) => handle.options.name === 'conversation.chat.commandview')
  assert.equal(cells.length, 13, 'every OMD command keeps its own cell')
  assert.ok(cells.some((handle) => handle.options.key === 'omd-config'))

  const section = harness.section
  assert.equal(section.options.id, 'omd-config')
  assert.equal(section.options.locale, 'omd-config-page')
  assert.equal(section.options.label(), 'OMD')
  const injected = section.options.inject()
  assert.equal(typeof injected.controller.run, 'function')
  assert.equal(injected.fallbackT('title'), 'OMD configuration')
})

test('both dictionaries carry the same keys, including the new field and provenance copy', () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }] })
  const dictionary = harness.dictionaries['omd-config-page']
  assert.ok(dictionary, 'the page registers its own locale dictionaries')
  assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.zh).sort())
  for (const key of [
    'groupKeywords',
    'keywordUltrawork',
    'commentChecker',
    'rulesPaths',
    'maxContinuationRounds',
    'requirePlanGate',
    'requireBaseline',
    'dualEvidence',
    'childPreset',
    'provenanceFile',
    'provenanceLayer',
    'pendingRemoval',
    'confirmTitle',
    'advancedKeys',
    'boardTitle',
    'laneAgents',
    'laneCategories',
    'laneModels',
    'stepPrimary',
    'stepFallback',
    'chainTerminal',
    'chainWarnUnknownAlias',
    'chainErrModelRequired',
    'modelErrAliasExists',
    'categoryAdd',
    'chainJsonSummary',
  ]) {
    assert.ok(dictionary.en[key], `en.${key} exists`)
    assert.ok(dictionary.zh[key], `zh.${key} exists`)
  }
  assert.notEqual(dictionary.zh.title, dictionary.en.title, 'zh is a real translation, not a copy')
})

// Control coverage and provenance

test('every effective configuration key gets a control, grouped by purpose', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }] })
  const tree = await harness.mount()
  const text = flatten(tree).join('\n')

  for (const label of [
    'General',
    'Keyword activation',
    'Delegation',
    'Hooks and continuation',
    'Rules',
    'Diagnostics',
    'Agents / categories / models',
  ]) {
    assert.ok(text.includes(label), `group ${label} is rendered`)
  }

  const checkboxes = findAll(tree, (node) => node.type === 'input' && node.props.type === 'checkbox')
  assert.equal(checkboxes.length, 14, 'keyword hook, task system, three keywords, delegation default, five hooks, and three ultrawork gates')
  const selects = findAll(tree, (node) => node.type === 'select')
  assert.equal(selects.length, 1, 'the comment checker is a select with off/warn/block')
  const textInputs = findAll(tree, (node) => node.type === 'input' && node.props.type === 'text')
  assert.equal(textInputs.length, 6, 'five integers plus the child preset')
  const textareas = findAll(tree, (node) => node.type === 'textarea')
  assert.equal(textareas.length, 3, 'rule paths, diagnostics commands, and the JSON document')

  assert.ok(text.includes('Default: 5'), 'an inherited number shows its built-in default')
})

test('each field says whether its value is in the file, inherited, or the default', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }] })
  const tree = await harness.mount()

  const maxConcurrent = fieldByLabel(tree, 'Max concurrent delegations')
  assert.ok(flatten(maxConcurrent).includes('in file'), 'a value the workspace file sets is marked as such')

  const maxDepth = fieldByLabel(tree, 'Max delegation depth')
  assert.ok(flatten(maxDepth).includes('inherited'), 'a value another layer sets is marked as inherited')

  const rulesPaths = fieldByLabel(tree, 'Rule directories')
  assert.ok(!flatten(rulesPaths).includes('inherited'), 'an untouched default is not marked as inherited')

  const layers = flatten(harness.render()).join('\n')
  assert.ok(layers.includes('Configuration layers (2)'), 'the layer disclosure lists every readable layer')
  assert.ok(layers.includes(CONFIG_FILE))

  const resets = findAll(tree, (node) => node.props && node.props.className === 'omd-cfg-reset')
  assert.equal(resets.length, 1, 'only the value set in this file can be reset')
})

// Save semantics

test('a clean page offers no save, and one edit writes only that key in the legacy form', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }, { envelope: envelope() }] })
  let tree = await harness.mount()

  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true, 'nothing is dirty after a load')
  assert.ok(flatten(tree).join('\n').includes('No unsaved changes'))

  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '7' } })
  tree = harness.render()
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, false)
  assert.ok(flatten(tree).join('\n').includes('1 unsaved'))

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { delegation: { maxConcurrent: 7 } })
})

test('resetting a value stages its removal and saves the structured patch+unset form', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }, { envelope: envelope() }] })
  let tree = await harness.mount()

  const field = fieldByLabel(tree, 'Max concurrent delegations')
  find(field, (node) => node.props && node.props.className === 'omd-cfg-reset').props.onClick()
  tree = harness.render()
  assert.ok(flatten(fieldByLabel(tree, 'Max concurrent delegations')).includes('removed on save'))

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.equal(harness.calls[1], '/omd-config set {"patch":{},"unset":[["delegation","maxConcurrent"]]}')
})

test('clearing a number that the file sets also falls back to the inherited value', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }, { envelope: envelope() }] })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '' } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { patch: {}, unset: [['delegation', 'maxConcurrent']] })
})

test('an invalid number is an inline error that blocks the save', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }] })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-delegation.maxDepth').props.onChange({ target: { value: 'many' } })
  tree = harness.render()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('Max delegation depth must be an integer.'))
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true)
  const input = byId(tree, 'omd-cfg-delegation.maxDepth')
  assert.equal(input.props['aria-invalid'], 'true')
  assert.ok(input.props['aria-describedby'].includes('omd-cfg-delegation.maxDepth-hint'))

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.equal(harness.calls.length, 1, 'a blocked save never reaches the Host')
})

test('the JSON document writes only changed sections and rejects keys outside its three', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }, { envelope: envelope() }] })
  let tree = await harness.mount()

  const advanced = byId(tree, 'omd-cfg-advanced')
  const parsed = JSON.parse(advanced.props.value)
  parsed.categories.custom = { description: 'Mine' }
  advanced.props.onChange({ target: { value: JSON.stringify(parsed, null, 2) } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { categories: { custom: { description: 'Mine' } } })

  const second = createHarness({ responses: [{ envelope: envelope() }] })
  let other = await second.mount()
  byId(other, 'omd-cfg-advanced').props.onChange({ target: { value: '{"agents":{},"platform":1}' } })
  other = second.render()
  assert.ok(flatten(other).join('\n').includes('found: platform'))
  assert.equal(buttonByText(other, 'Save changes').props.disabled, true)

  byId(other, 'omd-cfg-advanced').props.onChange({ target: { value: 'not json' } })
  other = second.render()
  assert.ok(flatten(other).join('\n').includes('This is not valid JSON.'))
})

test("the JSON document edits this file's own overrides, not the merged value", async () => {
  const withInheritedCategories = envelope({
    fileConfig: { categories: { quick: { modelRef: 'fast' } } },
    config: Object.assign({}, envelope().config, {
      // `deep` comes from another layer; only `quick` is in the workspace file.
      categories: { quick: { modelRef: 'fast' }, deep: { description: 'inherited' } },
    }),
  })
  const harness = createHarness({ responses: [{ envelope: withInheritedCategories }, { envelope: withInheritedCategories }] })
  let tree = await harness.mount()

  const document = JSON.parse(byId(tree, 'omd-cfg-advanced').props.value)
  assert.deepEqual(Object.keys(document.categories), ['quick'], 'only the file’s own override is shown')

  document.categories.quick.description = 'Mine'
  byId(tree, 'omd-cfg-advanced').props.onChange({ target: { value: JSON.stringify(document, null, 2) } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), {
    categories: { quick: { modelRef: 'fast', description: 'Mine' } },
  }, 'the inherited category is never copied into this file')
})

test('clearing the rule directories falls back to the inherited list', async () => {
  const withRules = envelope({ fileConfig: { rules: { paths: ['.omd/rules'] } } })
  const harness = createHarness({ responses: [{ envelope: withRules }, { envelope: withRules }] })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-rules.paths').props.onChange({ target: { value: '' } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { patch: {}, unset: [['rules', 'paths']] })
})

test('editing the diagnostics list keeps keys the control cannot show', async () => {
  const commands = [
    { command: 'node', args: ['--test', 'tests/'], glob: '**/*.test.mjs' },
    'npm run check',
  ]
  const withCommands = envelope({
    fileConfig: { diagnostics: { commands } },
    config: Object.assign({}, envelope().config, { diagnostics: { commands } }),
  })
  const harness = createHarness({ responses: [{ envelope: withCommands }, { envelope: withCommands }] })
  let tree = await harness.mount()

  const control = byId(tree, 'omd-cfg-diagnostics.commands')
  assert.equal(control.props.value, 'node --test tests/\nnpm run check')

  control.props.onChange({ target: { value: 'node --test tests/\nnpm run check\nnode scripts/check.mjs' } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()

  assert.deepEqual(payloadOf(harness.calls[1]), {
    diagnostics: {
      commands: [
        { command: 'node', args: ['--test', 'tests/'], glob: '**/*.test.mjs' },
        'npm run check',
        { command: 'node', args: ['scripts/check.mjs'] },
      ],
    },
  }, 'an untouched entry is not rebuilt, so glob and the string form survive')
})

test('clearing a value that only a layer sets says why nothing will be written', async () => {
  const layered = envelope({
    fileConfig: { delegation: { maxConcurrent: 3 } },
    config: Object.assign({}, envelope().config, { delegation: { maxConcurrent: 3, maxDepth: 4 } }),
  })
  const harness = createHarness({ responses: [{ envelope: layered }] })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-delegation.maxDepth').props.onChange({ target: { value: '' } })
  tree = harness.render()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('Empty keeps the inherited value (4).'), 'the field explains that the inherited value stays')
  assert.ok(!text.includes('No unsaved changes'), 'a cleared inherited field is not reported as a clean no-op')
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true)
})

test('a file that does not parse is reported as read-only instead of being editable', async () => {
  const broken = envelope({ parse: { ok: false, reason: 'parse', detail: 'invalid JSONC' } })
  const harness = createHarness({ responses: [{ envelope: broken }] })
  const tree = await harness.mount()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('This file does not parse'))
  assert.equal(byId(tree, 'omd-cfg-delegation.maxConcurrent').props.disabled, true)
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true)
})

test('a reserved key the file sets is reported and gets no control', async () => {
  const reserved = envelope({ fileConfig: { review: { maxRounds: 3 }, delegation: { maxConcurrent: 3 } } })
  const harness = createHarness({ responses: [{ envelope: reserved }] })
  const tree = await harness.mount()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('review'), 'the reserved key is named')
  assert.ok(text.includes('Reserved keys in this file'))
  assert.equal(findAll(tree, (node) => node.props && node.props.id === 'omd-cfg-review.maxRounds').length, 0)
})

// Unsaved-changes guard and discard

test('reloading with unsaved changes asks first, and discard restores the loaded values', async () => {
  const harness = createHarness({ responses: [{ envelope: envelope() }, { envelope: envelope() }] })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '9' } })
  tree = harness.render()

  buttonByText(tree, 'Discard changes').props.onClick()
  tree = harness.render()
  assert.equal(byId(tree, 'omd-cfg-delegation.maxConcurrent').props.value, '3')
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true)

  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '9' } })
  tree = harness.render()
  buttonByText(tree, 'Reload').props.onClick()
  tree = harness.render()
  assert.ok(flatten(tree).join('\n').includes('Discard unsaved changes?'))
  assert.equal(harness.calls.length, 1, 'the confirmation does not reload yet')

  buttonByText(tree, 'Discard and reload').props.onClick()
  await harness.settle()
  assert.equal(harness.calls.length, 2)
  assert.equal(harness.calls[1], '/omd-config')
})

// Backwards compatibility with an older Host half

test('an older Host without defaults or layers still works and keeps the legacy write form', async () => {
  const legacy = envelope({ defaults: undefined, layers: undefined, fileConfig: null })
  const harness = createHarness({ responses: [{ envelope: legacy }, { envelope: legacy }] })
  let tree = await harness.mount()

  assert.equal(findAll(tree, (node) => node.props && node.props.className === 'omd-cfg-reset').length, 0, 'no reset without an unset-capable Host')

  byId(tree, 'omd-cfg-keywordHook').props.onChange({ target: { checked: false } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.equal(harness.calls[1], '/omd-config set {"keywordHook":false}', 'no structured form when nothing is removed')
})

test('a removal against an older Host is reported as blocked instead of being sent', async () => {
  // This is the everyday development state: a refreshed browser half talking to
  // the Host that was composed before it, which cannot delete a key.
  const legacy = envelope({ defaults: undefined, layers: undefined, fileConfig: { delegation: { maxConcurrent: 3 } } })
  const harness = createHarness({ responses: [{ envelope: legacy }, { envelope: legacy }] })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '' } })
  tree = harness.render()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('Removing a key needs the restarted OMD Host'))
  assert.ok(text.includes('delegation.maxConcurrent'), 'the blocked key is named')
  assert.ok(text.includes('blocked (restart required)'), 'the counter names the blocked change, not an unsaved one')
  assert.equal(buttonByText(tree, 'Save changes').props.disabled, true)

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.equal(harness.calls.length, 1, 'nothing is sent to a Host that cannot express a removal')
})

// Failure states

test('a bridge failure renders a retry instead of an empty form', async () => {
  const harness = createHarness({ responses: [{ error: { kind: 'bridge', message: null } }] })
  const tree = await harness.mount()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('could not reach the OMD endpoint'))
  assert.ok(text.includes('Retry'))
  assert.equal(findAll(tree, (node) => node.type === 'select').length, 0, 'no empty form is offered')
})

test('the page says so when no workspace can be resolved instead of failing silently', async () => {
  const harness = createHarness({ responses: [{ error: { kind: 'no-session', message: null } }] })
  const tree = await harness.mount()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('No workspace to configure'))
  assert.ok(text.includes('Retry'))
})

test('a rejected save shows the Host message and keeps the edit', async () => {
  const harness = createHarness({
    responses: [
      { envelope: envelope() },
      { error: { kind: 'command', message: 'delegation.maxDepth must be integer >= 0 (got -1)' } },
    ],
  })
  let tree = await harness.mount()

  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '3' } })
  tree = harness.render()
  byId(tree, 'omd-cfg-delegation.maxConcurrent').props.onChange({ target: { value: '4' } })
  tree = harness.render()
  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  tree = harness.render()
  const text = flatten(tree).join('\n')
  assert.ok(text.includes('delegation.maxDepth must be integer >= 0 (got -1)'))
  assert.equal(byId(tree, 'omd-cfg-delegation.maxConcurrent').props.value, '4', 'a failed save keeps the form')
})

// Graphical chain editor

const BOARD_AGENT_IDS = [
  'sisyphus',
  'hephaestus',
  'prometheus',
  'atlas',
  'oracle',
  'librarian',
  'explore',
  'multimodal-looker',
  'metis',
  'momus',
  'sisyphus-junior',
]

const BOARD_CATEGORY_IDS = [
  'visual-engineering',
  'ultrabrain',
  'deep',
  'artistry',
  'quick',
  'unspecified-low',
  'unspecified-high',
  'writing',
]

const CHAIN_CATALOG = {
  strong: { provider: 'deepseek-account', model: 'deepseek-v4', reasoningEffort: 'max' },
  backup: { provider: 'deepseek-account', model: 'deepseek-flash' },
}

/** One agent/category card, by its `data-omd-entity` value (`agent:oracle`). */
function cardOf(tree, entity) {
  return findAll(tree, (node) => node.props && node.props['data-omd-entity'] === entity)[0]
}

/** One catalog alias card, by its `data-omd-alias` value. */
function modelCardOf(tree, alias) {
  return findAll(tree, (node) => node.props && node.props['data-omd-alias'] === alias)[0]
}

/** The first button inside `node` whose visible text is exactly `text`. */
function buttonIn(node, text) {
  return find(node, (candidate) => candidate.type === 'button' && flatten(candidate).includes(text))
}

/** One chain chip inside a card, by its `data-omd-chip` position. */
function chipOf(card, position) {
  return findAll(card, (node) => node.props && node.props['data-omd-chip'] === String(position))[0]
}

/** The JSON document currently staged in the advanced textarea. */
function documentOf(tree) {
  return JSON.parse(byId(tree, 'omd-cfg-advanced').props.value)
}

/** A full envelope whose file and effective config carry chains, routes, and a catalog. */
function chainEnvelope() {
  return envelope({
    fileConfig: {
      agents: {
        oracle: { chain: ['strong'] },
        metis: { provider: 'legacy-provider', model: 'legacy-model' },
      },
      categories: { deep: { chain: ['strong', 'backup'] } },
      models: { catalog: CHAIN_CATALOG },
    },
    config: {
      agents: {
        oracle: { chain: ['strong'] },
        sisyphus: { modelRef: 'strong' },
        metis: { provider: 'legacy-provider', model: 'legacy-model' },
      },
      categories: { deep: { chain: ['strong', 'backup'] }, quick: { disabled: true, chain: ['backup'] } },
      models: { catalog: CHAIN_CATALOG },
    },
  })
}

/** A narrower fixture: one file chain, one free catalog alias, nothing inherited. */
function editableChainEnvelope() {
  return envelope({
    fileConfig: { agents: {}, categories: { deep: { chain: ['strong'] } }, models: { catalog: CHAIN_CATALOG } },
    config: { agents: {}, categories: { deep: { chain: ['strong'] } }, models: { catalog: CHAIN_CATALOG } },
  })
}

test('the chain board renders three lanes, every role and category, and the catalog', async () => {
  const harness = createHarness({ responses: [{ envelope: chainEnvelope() }] })
  const tree = await harness.mount()
  const text = flatten(tree).join('\n')

  for (const label of ['Model chains', 'Agents', 'Categories', 'Models']) {
    assert.ok(text.includes(label), `lane ${label} is rendered`)
  }
  assert.ok(text.includes('Advanced JSON'), 'the JSON disclosure is still offered')

  const agentCards = findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'agent')
  assert.equal(agentCards.length, 11, 'all eleven roster roles get a card')
  assert.deepEqual(
    agentCards.map((node) => node.props['data-omd-entity']),
    BOARD_AGENT_IDS.map((id) => `agent:${id}`),
  )

  const categoryCards = findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'category')
  assert.equal(categoryCards.length, 8, 'all eight built-in categories get a card')
  assert.deepEqual(
    categoryCards.map((node) => node.props['data-omd-entity']),
    BOARD_CATEGORY_IDS.map((name) => `category:${name}`),
  )

  const modelCards = findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'model')
  assert.deepEqual(modelCards.map((node) => node.props['data-omd-alias']), ['strong', 'backup'])

  // Numbered chips: `1 primary`, `2 fallback 1`, then a terminal session-model chip.
  const oracle = cardOf(tree, 'agent:oracle')
  assert.equal(findAll(oracle, (node) => node.props && node.props['data-omd-chip']).length, 1)
  assert.ok(flatten(oracle).includes('primary'))
  const deep = cardOf(tree, 'category:deep')
  assert.deepEqual(
    findAll(deep, (node) => node.props && node.props['data-omd-chip']).map((node) => node.props['data-omd-chip']),
    ['1', '2'],
  )
  assert.ok(flatten(deep).includes('fallback 1'))
  assert.ok(flatten(deep).includes('deepseek-account / deepseek-flash'), 'a chip names the resolved route underneath its alias')
  assert.ok(flatten(cardOf(tree, 'agent:hephaestus')).includes('session model'), 'an unconfigured entity ends in the session model')

  // Provenance, the legacy single route, and a disabled category.
  assert.ok(flatten(oracle).includes('in file'))
  assert.ok(flatten(cardOf(tree, 'agent:sisyphus')).includes('inherited'))
  assert.ok(flatten(cardOf(tree, 'agent:metis')).includes('single route'))
  assert.ok(flatten(cardOf(tree, 'category:quick')).includes('disabled'))

  // Usage counts across displayed chains: strong is used by oracle, sisyphus
  // (through its inherited legacy modelRef), and deep; backup by deep and the
  // disabled quick category.
  assert.ok(flatten(modelCardOf(tree, 'strong')).join(' ').includes('used by 3'))
  assert.ok(flatten(modelCardOf(tree, 'backup')).join(' ').includes('used by 2'))
})

test('adding a fallback step writes the ordered chain and saves only that section', async () => {
  const harness = createHarness({ responses: [{ envelope: editableChainEnvelope() }, { envelope: editableChainEnvelope() }] })
  let tree = await harness.mount()
  const before = byId(tree, 'omd-cfg-advanced').props.value

  buttonIn(cardOf(tree, 'category:deep'), 'Add fallback step').props.onClick()
  tree = harness.render()

  const document = documentOf(tree)
  assert.deepEqual(document.categories.deep.chain, ['strong', 'backup'], 'the fallback is appended after the primary')
  assert.notEqual(byId(tree, 'omd-cfg-advanced').props.value, before, 'the textarea holds the new document')

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { categories: { deep: { chain: ['strong', 'backup'] } } })
})

test('steps can be reordered and removed inside the JSON document', async () => {
  const harness = createHarness({ responses: [{ envelope: chainEnvelope() }] })
  let tree = await harness.mount()

  let deep = cardOf(tree, 'category:deep')
  find(deep, (node) => node.type === 'button' && node.props['aria-label'] === 'Move step down').props.onClick()
  tree = harness.render()
  assert.deepEqual(documentOf(tree).categories.deep.chain, ['backup', 'strong'])

  deep = cardOf(tree, 'category:deep')
  findAll(deep, (node) => node.type === 'button' && node.props['aria-label'] === 'Remove step')[1].props.onClick()
  tree = harness.render()
  assert.deepEqual(documentOf(tree).categories.deep.chain, ['backup'])

  deep = cardOf(tree, 'category:deep')
  findAll(deep, (node) => node.type === 'button' && node.props['aria-label'] === 'Remove step')[0].props.onClick()
  tree = harness.render()
  assert.equal(documentOf(tree).categories.deep.chain, undefined, 'an emptied chain leaves neither a chain nor an empty array')
})

test('editing a catalog alias updates models.catalog, and only models is saved', async () => {
  const harness = createHarness({ responses: [{ envelope: editableChainEnvelope() }, { envelope: editableChainEnvelope() }] })
  let tree = await harness.mount()

  buttonIn(modelCardOf(tree, 'strong'), 'Edit').props.onClick()
  tree = harness.render()
  byId(tree, 'omd-chain-editor-provider').props.onChange({ target: { value: 'other-provider' } })
  tree = harness.render()
  buttonByText(tree, 'Save alias').props.onClick()
  tree = harness.render()

  const document = documentOf(tree)
  assert.equal(document.models.catalog.strong.provider, 'other-provider')
  assert.equal(document.models.catalog.strong.model, 'deepseek-v4', 'fields the editor did not touch survive')
  assert.equal(document.models.catalog.strong.reasoningEffort, 'max')

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { models: document.models })
})

test('an invalid step editor value keeps the document and shows an inline error', async () => {
  const harness = createHarness({ responses: [{ envelope: editableChainEnvelope() }] })
  let tree = await harness.mount()

  buttonIn(cardOf(tree, 'agent:hephaestus'), 'Add chain').props.onClick()
  tree = harness.render()
  const before = byId(tree, 'omd-cfg-advanced').props.value

  byId(tree, 'omd-chain-editor-mode').props.onChange({ target: { value: 'route' } })
  tree = harness.render()
  byId(tree, 'omd-chain-editor-provider').props.onChange({ target: { value: 'acme' } })
  tree = harness.render()
  buttonByText(tree, 'Save step').props.onClick()
  tree = harness.render()

  assert.equal(byId(tree, 'omd-cfg-advanced').props.value, before, 'nothing half-valid is written')
  assert.ok(flatten(tree).join('\n').includes('Model is required for an exact route.'))
  assert.equal(byId(tree, 'omd-chain-editor-model').props['aria-invalid'], 'true')

  byId(tree, 'omd-chain-editor-model').props.onChange({ target: { value: 'flash' } })
  tree = harness.render()
  byId(tree, 'omd-chain-editor-temperature').props.onChange({ target: { value: '3' } })
  tree = harness.render()
  buttonByText(tree, 'Save step').props.onClick()
  tree = harness.render()
  assert.equal(byId(tree, 'omd-cfg-advanced').props.value, before)
  assert.ok(flatten(tree).join('\n').includes('Temperature must be a number between 0 and 2.'))
})

test('an invalid hand-written step keeps its position and does not shift the editor index', async () => {
  // A schema-valid but unresolved step (`{}`) must stay visible. Filtering it
  // out of the chain used to shift every later index, so "edit step 3" rewrote
  // step 2 and a reorder silently deleted the invalid entry.
  const document = { agents: { oracle: { chain: ['strong', {}, 'backup'] } }, categories: {}, models: { catalog: CHAIN_CATALOG } }
  const harness = createHarness({ responses: [{ envelope: envelope({ fileConfig: document, config: document }) }] })
  const tree = await harness.mount()
  const oracle = cardOf(tree, 'agent:oracle')
  assert.equal(findAll(oracle, (node) => node.props && node.props['data-omd-chip']).length, 3)

  buttonIn(chipOf(oracle, 3), 'Edit').props.onClick()
  const editing = harness.render()
  assert.equal(byId(editing, 'omd-chain-editor-alias').props.value, 'backup', 'the editor opens the step the user clicked')
  assert.equal(documentOf(editing).agents.oracle.chain.length, 3)
})

test('an unknown alias renders a warning chip instead of hiding the chain', async () => {
  const harness = createHarness({
    responses: [
      {
        envelope: envelope({
          fileConfig: { agents: { oracle: { chain: ['ghost'] } }, categories: {}, models: { catalog: {} } },
          config: { agents: { oracle: { chain: ['ghost'] } }, categories: {}, models: { catalog: CHAIN_CATALOG } },
        }),
      },
    ],
  })
  const tree = await harness.mount()
  const chip = chipOf(cardOf(tree, 'agent:oracle'), 1)
  assert.ok(flatten(chip).join(' ').includes('ghost'))
  assert.ok(flatten(chip).join(' ').includes('not in the catalog'))
  assert.equal(chip.props['data-omd-warn'], 'true')
  assert.ok(flatten(cardOf(tree, 'agent:oracle')).includes('Add fallback step'), 'the chain stays editable')
})

test('an inherited route is overridden into the file and saves only agents', async () => {
  const harness = createHarness({
    responses: [
      {
        envelope: envelope({
          fileConfig: { agents: {}, categories: {}, models: { catalog: CHAIN_CATALOG } },
          config: { agents: { sisyphus: { modelRef: 'strong' } }, categories: {}, models: { catalog: CHAIN_CATALOG } },
        }),
      },
      { envelope: envelope({ fileConfig: { agents: {}, categories: {}, models: { catalog: CHAIN_CATALOG } }, config: {} }) },
    ],
  })
  let tree = await harness.mount()

  const card = cardOf(tree, 'agent:sisyphus')
  assert.ok(flatten(card).includes('inherited'))
  buttonIn(card, 'Override in this file').props.onClick()
  tree = harness.render()
  assert.equal(byId(tree, 'omd-chain-editor-alias').props.value, 'strong', 'the editor is seeded from the inherited route')

  buttonByText(tree, 'Save step').props.onClick()
  tree = harness.render()
  assert.deepEqual(documentOf(tree).agents.sisyphus, { chain: ['strong'] })

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.deepEqual(payloadOf(harness.calls[1]), { agents: { sisyphus: { chain: ['strong'] } } })
})

test('add category override appends a custom category to the document', async () => {
  const harness = createHarness({ responses: [{ envelope: editableChainEnvelope() }] })
  let tree = await harness.mount()

  find(tree, (node) => node.type === 'button' && flatten(node).includes('Add category override')).props.onClick()
  tree = harness.render()
  byId(tree, 'omd-chain-editor-name').props.onChange({ target: { value: 'bespoke' } })
  tree = harness.render()
  buttonByText(tree, 'Add category').props.onClick()
  tree = harness.render()

  assert.deepEqual(documentOf(tree).categories.bespoke, {})
  assert.ok(cardOf(tree, 'category:bespoke'), 'the new category gets a card')
  assert.ok(flatten(cardOf(tree, 'category:bespoke')).includes('custom'))
})

test('custom agent and category entries from the file are listed with a custom tag', async () => {
  const custom = envelope({
    fileConfig: {
      agents: { 'my-helper': { chain: ['strong'] } },
      categories: { 'my-lane': { chain: ['backup'] } },
      models: { catalog: CHAIN_CATALOG },
    },
    config: {
      agents: { 'my-helper': { chain: ['strong'] } },
      categories: { 'my-lane': { chain: ['backup'] } },
      models: { catalog: CHAIN_CATALOG },
    },
  })
  const harness = createHarness({ responses: [{ envelope: custom }] })
  const tree = await harness.mount()

  assert.equal(findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'agent').length, 12)
  assert.equal(findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'category').length, 9)
  const helper = cardOf(tree, 'agent:my-helper')
  assert.ok(helper)
  assert.ok(flatten(helper).includes('custom'))
  assert.ok(cardOf(tree, 'category:my-lane'))
})

test('the models lane refuses to delete a referenced alias and deletes a free one', async () => {
  const catalog = Object.assign({}, CHAIN_CATALOG, { spare: { provider: 'spare-provider', model: 'spare-model' } })
  const fixture = envelope({
    fileConfig: { agents: {}, categories: { deep: { chain: ['strong'] } }, models: { catalog } },
    config: { agents: {}, categories: { deep: { chain: ['strong'] } }, models: { catalog } },
  })
  const harness = createHarness({ responses: [{ envelope: fixture }] })
  let tree = await harness.mount()

  const blocked = buttonIn(modelCardOf(tree, 'strong'), 'Delete')
  assert.equal(blocked.props.disabled, true, 'an alias a chain uses cannot be deleted')
  assert.ok(String(blocked.props.title).includes('Referenced by'))
  assert.ok(flatten(modelCardOf(tree, 'strong')).join(' ').includes('Referenced by 1 chain step(s)'))

  const free = buttonIn(modelCardOf(tree, 'spare'), 'Delete')
  assert.equal(free.props.disabled, false)
  free.props.onClick()
  tree = harness.render()
  assert.equal(documentOf(tree).models.catalog.spare, undefined)
  assert.equal(documentOf(tree).models.catalog.strong.provider, 'deepseek-account')
})

test('a broken JSON document disables the board instead of crashing it', async () => {
  const harness = createHarness({ responses: [{ envelope: chainEnvelope() }] })
  let tree = await harness.mount()
  assert.ok(findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'agent').length > 0)

  byId(tree, 'omd-cfg-advanced').props.onChange({ target: { value: '{"agents":[]}' } })
  tree = harness.render()
  assert.equal(findAll(tree, (node) => node.props && node.props['data-omd-kind']).length, 0, 'the graph is hidden')
  assert.ok(flatten(tree).join('\n').includes('does not hold valid agents / categories / models'))
  assert.ok(byId(tree, 'omd-cfg-advanced'), 'the textarea stays mounted so the document can be fixed')
})

test('a file that does not parse shows the board as read-only', async () => {
  const broken = envelope({ parse: { ok: false, reason: 'parse', detail: 'invalid JSONC' } })
  const harness = createHarness({ responses: [{ envelope: broken }] })
  const tree = await harness.mount()
  assert.equal(findAll(tree, (node) => node.props && node.props['data-omd-kind']).length, 0)
  assert.ok(flatten(tree).join('\n').includes('chain board is read-only'))
  assert.equal(byId(tree, 'omd-cfg-advanced').props.disabled, true)
})

test('the chain board edits work against an older Host without defaults or layers', async () => {
  const legacy = envelope({
    defaults: undefined,
    layers: undefined,
    fileConfig: { categories: { deep: { chain: ['strong'] } } },
    config: { categories: { deep: { chain: ['strong'] } }, models: { catalog: CHAIN_CATALOG } },
  })
  const harness = createHarness({ responses: [{ envelope: legacy }, { envelope: legacy }] })
  let tree = await harness.mount()
  assert.equal(findAll(tree, (node) => node.props && node.props['data-omd-kind'] === 'agent').length, 11)

  buttonIn(cardOf(tree, 'category:deep'), 'Add fallback step').props.onClick()
  tree = harness.render()
  assert.deepEqual(documentOf(tree).categories.deep.chain, ['strong', 'backup'], 'no defaults are needed to edit a chain')

  buttonByText(tree, 'Save changes').props.onClick()
  await harness.settle()
  assert.equal(harness.calls[1], '/omd-config set {"categories":{"deep":{"chain":["strong","backup"]}}}', 'a pure patch keeps the legacy write form')
})

// Source shape

test('client.js stays a plain classic script with no JSX or Harness imports', () => {
  const source = fs.readFileSync(`${root}/ui/client.js`, 'utf8')
  assert.equal((source.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
  assert.ok(!/<[A-Za-z][^>]*>/.test(source), 'client.js must not contain JSX or HTML markup')
  assert.ok(!/require\(['"]@deepseek-ai\//.test(source), 'a plain-JS plugin must not import Harness Client packages')
  assert.ok(!/--dsw-alias-interactive-bg-hover/.test(source), 'the button uses a token the live Theme provider actually publishes')
})

test('the four dead dictionary keys stay removed (D10 regression)', () => {
  // These four keys were unreachable in both languages and were removed. A
  // re-added copy would silently reintroduce dead strings, so pin their absence
  // while keeping the live neighbours that share a prefix (errJsonShape,
  // tierCategory/tierRoute/tierSource).
  const harness = createHarness({ responses: [{ envelope: envelope() }] })
  const dictionary = harness.dictionaries['omd-config-page']
  assert.ok(dictionary, 'the page registers its own locale dictionaries')
  for (const key of ['errJson', 'projectTitle', 'readonlyFile', 'tiers']) {
    assert.equal(Object.hasOwn(dictionary.en, key), false, `en dictionary must not carry the dead key ${key}`)
    assert.equal(Object.hasOwn(dictionary.zh, key), false, `zh dictionary must not carry the dead key ${key}`)
  }
  for (const key of ['errJsonShape', 'tierCategory', 'tierRoute', 'tierSource']) {
    assert.equal(typeof dictionary.en[key], 'string', `live key ${key} must stay`)
    assert.equal(typeof dictionary.zh[key], 'string', `live key ${key} must stay translated`)
  }
})

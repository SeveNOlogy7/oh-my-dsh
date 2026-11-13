import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_AGENT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_CONFIG, TOP_LEVEL_KEYS } from '../src/core/defaults.js'
import { AGENTS, AGENT_IDS, SKILL_NAMES, DELEGATION_ONLY, allowedSubagents, canDelegate, skillsFor } from '../src/agents/registry.js'
import { restrictionFor } from '../src/agents/policies.js'
import { OMD_VERSION, OMO_VERSION } from '../src/core/constants.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8')

const schema = JSON.parse(await read('schema/omd-config.schema.json'))
const pkg = JSON.parse(await read('package.json'))
const configurationDoc = await read('docs/configuration.md')
const contractDoc = await read('prompts/agents/_contract.md')
const delegateSource = await read('src/tools/delegate.js')

/** JSON Schema types that accept a JavaScript value of this shape. */
function jsonTypesFor(value) {
  if (Array.isArray(value)) return ['array']
  if (value === null) return ['null']
  const type = typeof value
  if (type === 'boolean') return ['boolean']
  if (type === 'number') return ['number', 'integer']
  if (type === 'string') return ['string']
  if (type === 'object') return ['object']
  return [type]
}

function typeSatisfied(value, declared) {
  if (declared === undefined) return true
  const accepted = new Set((Array.isArray(declared) ? declared : [declared]).flatMap((t) => (t === 'integer' ? ['integer', 'number'] : [t])))
  return jsonTypesFor(value).some((type) => accepted.has(type))
}

/**
 * Compare one defaults object against the schema that documents it.
 * A dynamic map (`additionalProperties`) is compared through its value schema.
 */
function compareDefaults(defaults, schemaNode, trail, problems) {
  const props = schemaNode?.properties ?? {}
  const dynamic = typeof schemaNode?.additionalProperties === 'object' ? schemaNode.additionalProperties : null
  for (const [key, value] of Object.entries(defaults)) {
    const entry = props[key] ?? dynamic
    if (!entry) {
      problems.push(`schema is missing ${trail}${key}`)
      continue
    }
    if (!typeSatisfied(value, entry.type)) {
      problems.push(`schema ${trail}${key} does not accept ${Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value}`)
      continue
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = entry.properties ? entry : typeof entry.additionalProperties === 'object' ? entry.additionalProperties : null
      if (nested) compareDefaults(value, nested, `${trail}${key}.`, problems)
    }
  }
}

test('the config schema documents every default key with a matching type', () => {
  const problems = []
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const entry = schema.properties?.[key]
    if (!entry) {
      problems.push(`schema is missing top-level key ${key}`)
      continue
    }
    if (!typeSatisfied(DEFAULT_CONFIG[key], entry.type)) {
      problems.push(`schema ${key} does not accept ${typeof DEFAULT_CONFIG[key]}`)
    }
  }
  for (const key of Object.keys(schema.properties ?? {})) {
    if (key !== '$schema' && !TOP_LEVEL_KEYS.includes(key)) problems.push(`schema declares unknown top-level key ${key}`)
  }
  for (const [section, value] of Object.entries(DEFAULT_CONFIG)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    compareDefaults(value, schema.properties?.[section], `${section}.`, problems)
  }
  assert.deepEqual(problems, [])
})

test('schema defaults match the runtime defaults exactly', () => {
  const problems = []
  const scalar = [
    ['keywordHook', DEFAULT_CONFIG.keywordHook],
    ['telemetry', DEFAULT_CONFIG.telemetry],
  ]
  for (const [key, value] of scalar) {
    const declared = schema.properties?.[key]?.default
    if (declared !== value) problems.push(`${key}: schema ${JSON.stringify(declared)} != ${JSON.stringify(value)}`)
  }
  for (const section of ['delegation', 'ultrawork', 'review', 'hooks', 'taskSystem']) {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG[section])) {
      const declared = schema.properties?.[section]?.properties?.[key]?.default
      if (declared !== value) problems.push(`${section}.${key}: schema ${JSON.stringify(declared)} != ${JSON.stringify(value)}`)
    }
  }
  for (const [key, value] of Object.entries(DEFAULT_CONFIG.keywords)) {
    const declared = schema.properties?.keywords?.properties?.[key]?.default
    if (declared !== value) problems.push(`keywords.${key}: schema ${JSON.stringify(declared)} != ${JSON.stringify(value)}`)
  }
  assert.deepEqual(problems, [])
})

test('the agent override schema covers every default agent setting', () => {
  const declared = schema.properties?.agents?.additionalProperties?.properties ?? {}
  const missing = Object.keys(DEFAULT_AGENT_SETTINGS.sisyphus).filter((key) => !(key in declared))
  assert.deepEqual(missing, [])
})

test('docs/configuration.md lists exactly the agent and category override fields', () => {
  const agentSection = /## Agent overrides\n\n([\s\S]*?)\n\n/.exec(configurationDoc)
  assert.ok(agentSection, 'docs/configuration.md has no Agent overrides section')
  const documentedAgents = [...agentSection[1].matchAll(/`([a-zA-Z_]+)`/g)].map((match) => match[1])
  const declaredAgents = Object.keys(DEFAULT_AGENT_SETTINGS.sisyphus)
  assert.deepEqual(
    declaredAgents.filter((key) => !documentedAgents.includes(key)),
    [],
    'runtime agent settings that docs/configuration.md does not list',
  )
  assert.deepEqual(
    documentedAgents.filter((key) => !declaredAgents.includes(key)),
    [],
    'agent fields documented in docs/configuration.md that the runtime does not accept',
  )

  const categorySection = /A category accepts: ([^]*?)\n\n/.exec(configurationDoc)
  assert.ok(categorySection, 'docs/configuration.md does not list category fields')
  const documentedCategories = [...categorySection[1].matchAll(/`([a-zA-Z_]+)`/g)].map((match) => match[1])
  const declaredCategories = Object.keys(schema.properties?.categories?.additionalProperties?.properties ?? {})
  assert.deepEqual(
    declaredCategories.filter((key) => !documentedCategories.includes(key)),
    [],
    'schema category fields that docs/configuration.md does not list',
  )
  assert.deepEqual(
    documentedCategories.filter((key) => !declaredCategories.includes(key)),
    [],
    'category fields documented in docs/configuration.md that the schema does not accept',
  )
})

test('the eight built-in categories are named and advertised everywhere', () => {
  const names = Object.keys(DEFAULT_CATEGORIES)
  assert.equal(names.length, 8)
  assert.match(configurationDoc, /Eight built-ins/)
  for (const name of names) {
    assert.ok(configurationDoc.includes(`\`${name}\``), `docs/configuration.md does not name ${name}`)
    assert.ok(contractDoc.includes(`\`${name}\``), `prompts/agents/_contract.md does not name ${name}`)
    assert.ok(delegateSource.includes(name), `omd_delegate does not advertise ${name}`)
  }
  for (const label of ['Four', 'Five', 'Six', 'Seven', 'Nine', 'Ten']) {
    assert.ok(!new RegExp(`${label} built-ins`).test(configurationDoc), `stale "${label} built-ins" claim`)
  }
})

test('every agent id has a registry entry and a prompt', async () => {
  assert.deepEqual(Object.keys(AGENTS), AGENT_IDS)
  assert.equal(AGENT_IDS.length, 11)
  for (const id of AGENT_IDS) {
    assert.ok(await fs.stat(path.join(root, 'prompts', 'agents', `${id}.md`)), `missing prompt for ${id}`)
  }
})

test('version constants and shipped skills agree with the package', async () => {
  assert.equal(pkg.version, OMD_VERSION)
  assert.equal(OMO_VERSION, '4.19.4')
  assert.equal(SKILL_NAMES.length, 15)
  for (const name of SKILL_NAMES) {
    assert.ok(await fs.stat(path.join(root, 'skills', name, 'SKILL.md')), `missing skill ${name}`)
  }
})

test('every role reaches the doctor through the skill and the tool', () => {
  // The removed `/omd-doctor` command was available to all eleven roles; the
  // skill replacement must not narrow that, and the looker's allowlist must
  // keep the one OMD tool a read-only role still needs.
  for (const id of AGENT_IDS) {
    assert.ok(skillsFor(id, {}).includes('omd-doctor'), `${id} must carry the omd-doctor skill`)
  }
  assert.ok(
    restrictionFor('multimodal-looker').allow.includes('omd_doctor'),
    'the looker allowlist must keep omd_doctor reachable',
  )
})

test('the Client asset is a top-level row the Loader scan can resolve', async () => {
  // The client-modules scan composes bundles only for Loader entries it
  // resolves by package specifier. The runtime row lives inside an agent
  // preset, so the browser asset needs its own top-level row and its own
  // package name — two rows naming one package are rejected as ambiguous.
  const uiManifest = JSON.parse(await read('ui/package.json'))
  assert.equal(uiManifest.dsh?.client?.platform, 'web')
  assert.equal(uiManifest.dsh?.client?.immediately, true)
  assert.equal(uiManifest.exports['.'], './index.js')
  assert.equal(uiManifest.exports['./client'], './client.js')
  assert.ok(pkg.files.includes('ui'), 'package files must include the ui asset')
  assert.notEqual(uiManifest.name, pkg.name, 'the asset must not reuse the runtime package name')

  const patches = pkg.dsh.bundle.patch
  // Two rows only: the top-level runtime row and the browser asset row. The
  // per-role preset rows are gone, because a registered preset cannot be hidden
  // from DSH's picker and a preset cannot be switched once a session's first
  // turn starts — so eleven of them only misled users. The role now travels on
  // the delegation descriptor's label instead.
  assert.equal(
    patches.length,
    2,
    'patch list must hold exactly the runtime row and the browser asset row',
  )
  assert.equal(patches[0], './presets/omd-runtime.patch.yml', 'the runtime row stays first')
  assert.equal(patches[patches.length - 1], './presets/omd-ui.patch.yml', 'the asset row stays last')

  // The runtime row is mounted once for the whole profile and must therefore
  // name no agent: a row that named one would serve that role only, which is
  // exactly the confinement this layout removes.
  const runtimePatch = await read('presets/omd-runtime.patch.yml')
  assert.match(runtimePatch, /id: omd-runtime/)
  assert.ok(
    runtimePatch.includes(`name: ${JSON.stringify(pkg.name)}`),
    'the runtime row must resolve to the published package name',
  )
  assert.ok(!/^\s+agent:/m.test(runtimePatch), 'the runtime row must not pin an agent')

  // No per-role preset file may come back. Each one was a redundant copy of the
  // native `standard` tool set, and registering it is what put eleven unusable
  // entries in the picker. The role table still owns the roster; it just no
  // longer publishes one preset per role.
  for (const id of AGENT_IDS) {
    const relative = `presets/omd-${id}.patch.yml`
    await assert.rejects(
      fs.access(path.join(root, relative)),
      `${relative} must not exist: per-role presets are no longer generated`,
    )
  }

  const uiPatch = await read(patches[patches.length - 1])
  // The include plugin resolves a row name against the patch file's directory.
  assert.match(uiPatch, /id: omd-ui/)
  // It must name the entry FILE. A directory specifier makes the loader fail
  // with ERR_UNSUPPORTED_DIR_IMPORT and leaves the row permanently inactive, so
  // the browser bundle is never composed and every command row falls back to
  // the collapsed card.
  assert.match(uiPatch, /name: "\.\.\/ui\/index\.js"/)
  assert.deepEqual(
    uiPatch.match(/name: "([^"]+)"/g),
    ['name: "../ui/index.js"'],
    'the asset row must resolve to exactly one entry file',
  )

  const source = await read('ui/client.js')
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  assert.match(source, new RegExp(`id: '${uiManifest.name}'`), 'the loader id must be the asset package name')
  assert.match(source, /conversation\.chat\.commandview/)
  // The loader has no JSX step; a stray tag would break the whole bundle.
  assert.ok(!/<[A-Za-z][^>]*>/.test(source), 'client.js must not contain JSX or HTML markup')
  // One injection per distinct slot key: a per-key injection loop would install
  // the same owner callback repeatedly, while each additional slot the asset
  // renders into legitimately needs its own injection. The command cells and the
  // OMD settings page are the two slots this asset owns.
  const injectedSlots = [...source.matchAll(/ctx\.slots\.inject\(\s*'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(
    injectedSlots,
    ['conversation.chat.commandview', 'settings.section'],
    'client.js must inject each owned slot exactly once',
  )
  // The Client context refuses a property access it was not injected with, and
  // the failure only appears when the page is opened in a browser, so the list
  // is asserted here. The settings page reaches its Host half over a same-origin
  // `fetch` to `api/omd/config` (a browser global, no Client service), so the
  // list is exactly the slots plus the two services the page reads: `locale` for
  // its dictionary and `sessions` for the workspace it shows. Borrowing
  // `remote.commands` is what made every page mount append command records to
  // the live session log, so it must stay out of this list.
  // The plugin-level list is the only `inject: [...]` in the file; the slot
  // registration's option is the `inject: () => ({...})` form.
  const injectLiteral = /\binject: \[([^\]]*)\]/.exec(source)
  assert.ok(injectLiteral, 'client.js must declare the services it injects')
  const injectedServices = [...injectLiteral[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(
    injectedServices,
    ['slots', 'locale', 'sessions'],
    'client.js injects exactly the slots plus the locale and sessions services',
  )
  assert.ok(!injectedServices.includes('remote.commands'), 'the settings page must not drive the command plane')

  const commandSource = await read('src/commands/index.js')
  const listLiteral = /const COMMANDS = \[([^\]]*)\]/.exec(source)
  assert.ok(listLiteral, 'client.js must declare its command list')
  const registered = [...listLiteral[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.ok(registered.length >= 10, 'the command list must cover the OMD commands')
  for (const name of registered) {
    assert.ok(commandSource.includes(`name: '${name}'`), `client.js registers ${name}, which is not a command`)
  }
  for (const name of ['omd-init', 'omd-status', 'omd-config']) {
    assert.ok(registered.includes(name), `client.js must render ${name}`)
  }
  // The doctor is a skill driving the omd_doctor tool: a client cell keyed to
  // `/omd-doctor` would render a command that no longer exists.
  assert.ok(!commandSource.includes("name: 'omd-doctor'"), 'omd-doctor must not be a command')
  assert.ok(!registered.includes('omd-doctor'), 'client.js must not render the removed doctor command')
})

test('the role table keeps the four primaries distinct from the seven delegation targets', () => {
  // The role table is no longer published as one preset per role, so `mode` no
  // longer decides what the picker shows. It still decides who may drive a
  // session and who is only ever a delegation target, and `order` still fixes
  // the roster the delegation tools and the doctor report read.
  const primaries = AGENT_IDS.filter((id) => AGENTS[id].mode === 'primary')
  const subagents = AGENT_IDS.filter((id) => AGENTS[id].mode === 'subagent')
  assert.deepEqual(primaries, ['sisyphus', 'hephaestus', 'prometheus', 'atlas'])
  assert.equal(subagents.length, 7)

  for (const id of primaries) {
    assert.ok(AGENTS[id].description.length > 0, `${id} needs a description`)
    assert.ok(
      !AGENTS[id].description.includes(DELEGATION_ONLY),
      `${id} is directly selectable and must not be marked delegation-only`,
    )
  }
  for (const id of subagents) {
    assert.ok(
      AGENTS[id].description.includes(DELEGATION_ONLY),
      `${id} is a subagent and must be marked as a delegation target`,
    )
  }
  assert.ok(
    Math.max(...primaries.map((id) => AGENTS[id].order)) < Math.min(...subagents.map((id) => AGENTS[id].order)),
    'primaries must sort before subagents in the roster',
  )
  for (const id of subagents) {
    assert.equal(canDelegate(id), false, `${id} must not delegate further`)
  }
  for (const id of primaries) {
    assert.ok(allowedSubagents(id).length > 0, `${id} must have delegation targets`)
  }
})

test('the declared DSH range names the builds the role channel was verified on', () => {
  // DSH reads `engines.dsh` alone (falling back to @deepseek-ai/dsh peers) and
  // evaluates it with `includePrerelease`, so a plain `<0.3.0` upper bound would
  // still admit `0.3.0-alpha.1`. The caret form expands to `<0.3.0-0`, which
  // excludes the whole next minor while keeping the prereleases in this one.
  //
  // This range IS the compatibility claim, so it is pinned rather than derived:
  // widening it is a deliberate act that requires re-running the verification
  // recorded in docs/verification.md, not a side effect of a version bump.
  assert.equal(pkg.engines?.dsh, '^0.2.1-rc.5')
  assert.equal(pkg.engines?.node, '>=22.13.0')
})

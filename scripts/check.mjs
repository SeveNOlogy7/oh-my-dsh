#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AGENT_IDS, SKILL_NAMES, presetIdFor } from '../src/agents/registry.js'
import { OMD_VERSION } from '../src/core/constants.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const note = (message) => failures.push(message)

async function exists(file) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
if (pkg.version !== OMD_VERSION) note(`package version ${pkg.version} != ${OMD_VERSION}`)
// Published, so `private` must be gone: npm refuses to publish a private
// package. docs/releasing.md keeps the release path.
if (pkg.private === true) note('package.json is private; npm publish would be refused')
if (pkg.type !== 'module') note('package must be ESM')

const patches = pkg.dsh?.bundle?.patch
const RUNTIME_RELATIVE = './presets/omd-runtime.patch.yml'
const UI_RELATIVE = './presets/omd-ui.patch.yml'
if (!Array.isArray(patches) || patches.length !== AGENT_IDS.length + 2) {
  note(`dsh.bundle.patch must list the ${AGENT_IDS.length} preset patches, the runtime row, and the browser asset row`)
} else {
  // The runtime is one top-level row, so the preset patches are everything that
  // is neither it nor the browser asset row.
  const presetPatches = patches.filter((relative) => relative !== RUNTIME_RELATIVE && relative !== UI_RELATIVE)
  if (presetPatches.length !== AGENT_IDS.length) {
    note(`expected ${AGENT_IDS.length} preset patches, found ${presetPatches.length}`)
  }
  for (const [index, relative] of presetPatches.entries()) {
    const file = path.join(root, relative)
    if (!(await exists(file))) {
      note(`missing patch: ${relative}`)
      continue
    }
    const text = await fs.readFile(file, 'utf8')
    const id = AGENT_IDS[index]
    if (!text.includes(`id: preset-${presetIdFor(id)}`)) note(`${relative} does not declare preset-${presetIdFor(id)}`)
    // The preset id is now the only thing that tells the runtime which role it
    // serves, so a preset must carry no runtime row of its own: nesting one
    // would mount the plugin twice and confine it to this preset again.
    if (text.includes(`name: ${JSON.stringify(pkg.name)}`)) note(`${relative} must not nest the runtime row`)
    if (/^\s+agent:\s*"?[\w-]+"?\s*$/m.test(text)) note(`${relative} must not pin an agent`)
    // A row naming a module the installed DSH cannot start leaves the preset
    // audited as broken, which hides it from the picker entirely. That subpath
    // was removed from the shipped composition, so it must never come back.
    if (text.includes('dsh-tool-subagent-control/list-agents')) {
      note(`${relative} mounts dsh-tool-subagent-control/list-agents, which is not a loadable row`)
    }
  }

  const runtimePatch = path.join(root, RUNTIME_RELATIVE)
  if (!(await exists(runtimePatch))) {
    note(`missing patch: ${RUNTIME_RELATIVE}`)
  } else {
    const text = await fs.readFile(runtimePatch, 'utf8')
    if (!text.includes('id: omd-runtime')) note(`${RUNTIME_RELATIVE} does not declare id: omd-runtime`)
    // The row specifier must track the package name: it resolves from the
    // profile's node_modules, so a published scoped name would leave a
    // hard-coded bare name unresolvable and the whole runtime row dead.
    const pluginRow = `name: ${JSON.stringify(pkg.name)}`
    if (!text.includes(pluginRow)) note(`${RUNTIME_RELATIVE} does not mount ${pkg.name}`)
    if (text.split(pluginRow).length - 1 !== 1) note(`${RUNTIME_RELATIVE} must mount exactly one runtime row`)
    if (/^\s+agent:\s*"?[\w-]+"?\s*$/m.test(text)) {
      note(`${RUNTIME_RELATIVE} must not pin an agent; the role is read from the active preset`)
    }
  }

  const uiPatch = path.join(root, UI_RELATIVE)
  if (!(await exists(uiPatch))) {
    note(`missing patch: ${UI_RELATIVE}`)
  } else {
    const text = await fs.readFile(uiPatch, 'utf8')
    if (!text.includes('id: omd-ui')) note(`${UI_RELATIVE} does not declare id: omd-ui`)
    // A directory specifier fails with ERR_UNSUPPORTED_DIR_IMPORT and leaves the
    // row inactive, so the browser bundle is never served.
    if (!text.includes('name: "../ui/index.js"')) {
      note(`${UI_RELATIVE} must name ../ui/index.js, not a directory`)
    }
    // The include plugin resolves a row name against the patch file's own
    // directory, so "../ui" must land on the asset package.
    if (!(await exists(path.join(root, 'ui', 'package.json')))) note('missing ui/package.json')
    if (!(await exists(path.join(root, 'ui', 'client.js')))) note('missing ui/client.js')
    if (!(await exists(path.join(root, 'ui', 'index.js')))) note('missing ui/index.js')
    const uiManifest = JSON.parse(await fs.readFile(path.join(root, 'ui', 'package.json'), 'utf8'))
    if (uiManifest.dsh?.client?.platform !== 'web') note('ui/package.json must declare dsh.client.platform: web')
    if (uiManifest.exports?.['./client'] !== './client.js') note('ui/package.json must export ./client')
  }
}

const required = [
  'runtime.js',
  'ui/index.js',
  'ui/client.js',
  'ui/package.json',
  'src/runtime/index.js',
  'src/runtime/runtime.js',
  'src/tools/index.js',
  'src/commands/index.js',
  'src/hooks/index.js',
  'src/skills/index.js',
  'schema/omd-config.schema.json',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'LICENSE',
  'NOTICE',
  'upstream/omo-sources.lock.json',
  'docs/parity-omo-4.19.4.md',
  'README.md',
  'README.zh-CN.md',
]
for (const relative of required) if (!(await exists(path.join(root, relative)))) note(`missing file: ${relative}`)
for (const id of AGENT_IDS) if (!(await exists(path.join(root, 'prompts', 'agents', `${id}.md`)))) note(`missing prompt: ${id}`)
for (const skill of SKILL_NAMES) if (!(await exists(path.join(root, 'skills', skill, 'SKILL.md')))) note(`missing skill: ${skill}`)

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.omd') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out)
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(full)
  }
  return out
}

for (const file of await walk(root)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'ignore' })
  if (result.status !== 0) note(`syntax: ${path.relative(root, file)}`)
}

const presetCheck = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-presets.mjs'), '--check'], {
  cwd: root,
  stdio: 'ignore',
})
if (presetCheck.status !== 0) note('presets are out of date; run npm run generate:presets')

const versionCheck = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-version.mjs')], {
  cwd: root,
  stdio: 'ignore',
})
if (versionCheck.status !== 0) note('version check failed')

const contractCheck = spawnSync(process.execPath, ['--test', path.join(root, 'tests', 'contract.test.mjs')], {
  cwd: root,
  stdio: 'ignore',
})
if (contractCheck.status !== 0) note('contract check failed: schema, docs, or roster drifted from the runtime')

const parityCheck = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-parity.mjs')], {
  cwd: root,
  stdio: 'ignore',
})
if (parityCheck.status !== 0) note('parity check failed')

if (failures.length) {
  for (const failure of failures) console.error(`check: ${failure}`)
  process.exit(1)
}
console.log(
  `check ok: ${AGENT_IDS.length} presets + 1 UI asset, ${SKILL_NAMES.length} skills, ${patches.length} patches, syntax + contract + parity + version`,
)

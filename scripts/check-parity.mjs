#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_IDS, SKILL_NAMES, presetIdFor } from '../src/agents/registry.js'
import { TOOL_NAMES } from '../src/tools/names.js'
import { COMMAND_NAMES } from '../src/commands/names.js'

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The doc this gate compares the code against, relative to the repository root. */
export const PARITY_DOC = ['docs', 'parity-omo-4.19.4.md']

/**
 * Wildcard families the doc may use instead of listing every member of a tool
 * family. Each one must be documented in the parity doc, and nothing outside
 * this list is a valid wildcard.
 */
export const WILDCARD_FAMILIES = ['omd_task_*', 'omd_session_*']

/**
 * Tokens that name a package or a Loader row rather than an agent, tool,
 * command, or skill. `omd-runtime` is the runtime patch row and `omd-ui` is the
 * browser asset package, so neither may be demanded from the runtime's
 * registration surface.
 */
export const NON_ENTITY_TOKENS = [
  'omd-runtime', // Loader row id in presets/omd-runtime.patch.yml
  'omd-ui', // browser asset package (ui/package.json)
  'omd-result', // the fenced result block a child returns
  'omd-config-page', // the client locale namespace
  'omd-delegation', // the child prompt wrapper tag
]

/**
 * `omd_*` and `omd-*` tokens as the doc writes them.
 *
 * Hyphens stay inside the token because command and skill names are themselves
 * hyphenated (`omd-remove-ai-slops`), and a trailing `*` is kept because the doc
 * documents its wildcard families that way. A metasyntactic placeholder such as
 * `omd-<role>` matches only `omd-` — the `<` ends the token — and is dropped
 * below, which is what keeps the prose about preset ids from looking like an
 * entity claim.
 */
const DOC_TOKEN = /omd[_-][A-Za-z0-9_-]*\*?/g

/** Every token shape the reverse direction must accept. */
function knownEntities() {
  return new Set([
    ...AGENT_IDS.map(presetIdFor),
    ...TOOL_NAMES,
    ...COMMAND_NAMES,
    ...SKILL_NAMES,
    ...WILDCARD_FAMILIES,
    ...NON_ENTITY_TOKENS,
  ])
}

/**
 * The roster the doc's Agents table names, with the doc line each row is on.
 *
 * The table's OMD column is the claim under test, so only a fully backticked
 * cell counts as a role name. Header and separator rows carry no backticks and
 * fall through.
 */
function agentTableRoles(docText) {
  const lines = docText.split(/\r?\n/)
  const roles = []
  let inSection = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+Agents\b/i.test(line)) {
      inSection = true
      continue
    }
    if (!inSection) continue
    if (/^#{1,2}\s/.test(line)) break
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    const match = /^`([^`]+)`$/.exec(cells[2] ?? '')
    if (match) roles.push({ role: match[1], line: index + 1 })
  }
  return roles
}

/**
 * Check `docText` in both directions against the entities the code registers.
 *
 * Forward: every agent role, tool, command, and skill exists in the doc, and the
 * doc's Agents table names exactly `AGENT_IDS`. Reverse: every `omd_*`/`omd-*`
 * token in the doc resolves to one of those entities, to a documented wildcard
 * family, or to an explicit non-entity token. A doc has to name things the code
 * really has — the reverse direction is what catches a doc that promises an
 * entity nobody implements, which no list-based forward check can see.
 *
 * `root` is the repository root (the stale per-role preset check reads
 * `presets/` from it); `docText` defaults to the shipped parity doc so the CLI
 * needs nothing else.
 *
 * @returns {{ ok: boolean, problems: string[], counts: { agents: number, tools: number, commands: number, skills: number, tokens: number } }}
 */
export function checkParity({ root = defaultRoot, docText } = {}) {
  const text = docText ?? readFileSync(path.join(root, ...PARITY_DOC), 'utf8')
  if (typeof text !== 'string') throw new TypeError('checkParity: docText must be a string')
  const problems = []
  const lines = text.split(/\r?\n/)

  // Forward: the doc must document every registered entity.
  //
  // The parity table still names the role each OmO agent maps to, so the claim
  // to verify is the role id itself. It deliberately does NOT assert
  // `omd-<role>`: these roles are no longer registered as DSH presets, and the
  // doc's OMD column would satisfy such an assertion vacuously.
  for (const id of AGENT_IDS) {
    if (!text.includes(id)) problems.push(`parity missing: agent ${id}`)
    // The reverse claim is checked on disk: a role is served by OMD's own
    // channel, so no per-role preset patch may come back.
    if (existsSync(path.join(root, 'presets', `${presetIdFor(id)}.patch.yml`))) {
      problems.push(`parity missing: stale per-role preset ${presetIdFor(id)}`)
    }
  }
  for (const tool of TOOL_NAMES) if (!text.includes(tool)) problems.push(`parity missing: tool ${tool}`)
  for (const command of COMMAND_NAMES) if (!text.includes(command)) problems.push(`parity missing: command ${command}`)
  for (const skill of SKILL_NAMES) if (!text.includes(skill)) problems.push(`parity missing: skill ${skill}`)
  for (const marker of ['mass ulw', 'ralph']) if (!text.toLowerCase().includes(marker)) problems.push(`parity missing: note ${marker}`)

  // The Agents table is the roster claim, so its exact membership is checked
  // rather than just the presence of each id somewhere in the prose.
  const table = agentTableRoles(text)
  if (!table.length) {
    problems.push(`parity missing: Agents table in ${PARITY_DOC.join('/')}`)
  } else {
    const documented = new Map(table.map((entry) => [entry.role, entry.line]))
    for (const id of AGENT_IDS) if (!documented.has(id)) problems.push(`parity agent table missing role: ${id}`)
    for (const [role, line] of documented) {
      if (!AGENT_IDS.includes(role)) problems.push(`parity agent table names unknown role: ${role} (doc line ${line})`)
    }
  }

  // Reverse: no documented token may name something the code does not have.
  // Each token is reported once, on its first line, so a doc that repeats a bad
  // name does not bury the first occurrence in duplicates.
  const known = knownEntities()
  const seen = new Set()
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(DOC_TOKEN)) {
      const token = match[0]
      // `omd-` / `omd_` alone is a truncated metasyntactic placeholder, not a name.
      if (token === 'omd-' || token === 'omd_') continue
      if (seen.has(token)) continue
      seen.add(token)
      if (!known.has(token)) problems.push(`parity unknown entity: ${token} (doc line ${index + 1})`)
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    counts: {
      agents: AGENT_IDS.length,
      tools: TOOL_NAMES.length,
      commands: COMMAND_NAMES.length,
      skills: SKILL_NAMES.length,
      tokens: seen.size,
    },
  }
}

/** Windows path comparison is case-insensitive, so the CLI guard must be too. */
function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && samePath(process.argv[1], fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const result = checkParity({ root: defaultRoot })
  if (!result.ok) {
    for (const problem of result.problems) console.error(problem)
    process.exitCode = 1
  } else {
    console.log(
      `parity ok: ${result.counts.agents} agents, ${result.counts.tools} tools, ${result.counts.commands} commands, ${result.counts.skills} skills`,
    )
  }
}

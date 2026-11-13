import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkParity, NON_ENTITY_TOKENS, WILDCARD_FAMILIES } from '../scripts/check-parity.mjs'
import { AGENT_IDS, SKILL_NAMES } from '../src/agents/registry.js'
import { COMMAND_NAMES } from '../src/commands/names.js'
import { TOOL_NAMES } from '../src/tools/names.js'
import { apply } from '../src/runtime/index.js'
import { createFakeContext } from './helpers/fake-context.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shippedDoc = await fs.readFile(path.join(root, 'docs', 'parity-omo-4.19.4.md'), 'utf8')

/**
 * Append a probe paragraph to the shipped doc and return the 1-based doc line
 * it lands on, so a failure message can be asserted against a real line rather
 * than a constant.
 */
function withProbe(probe) {
  const docText = `${shippedDoc.trimEnd()}\n\n${probe}\n`
  const line = docText.trimEnd().split(/\r?\n/).length
  return { docText, line }
}

function unknownEntities(result) {
  return result.problems.filter((problem) => problem.startsWith('parity unknown entity:'))
}

function failDetail(result) {
  return `problems:\n${result.problems.join('\n')}`
}

// The gate itself: both directions, driven as a function.

test('the shipped parity doc passes both directions and its tokens are really scanned', () => {
  const result = checkParity({ root, docText: shippedDoc })
  assert.deepEqual(result.problems, [], failDetail(result))
  assert.equal(result.ok, true)
  assert.equal(result.counts.agents, AGENT_IDS.length)
  assert.equal(result.counts.tools, TOOL_NAMES.length)
  assert.equal(result.counts.commands, COMMAND_NAMES.length)
  assert.equal(result.counts.skills, SKILL_NAMES.length)
  // A reverse direction that scanned nothing would pass vacuously, which is the
  // defect this gate exists to close: every tool and command has to appear as a
  // token, so the count can never be zero or a handful.
  assert.ok(
    result.counts.tokens >= TOOL_NAMES.length + COMMAND_NAMES.length,
    `the reverse scan saw only ${result.counts.tokens} tokens; every tool and command name must appear in the doc`,
  )
  // `docText` is optional: without it the gate reads the shipped file, which is
  // exactly what the CLI does.
  assert.equal(checkParity({ root }).ok, true)
})

test('a documented token that names no entity fails with the token and its doc line', () => {
  const { docText, line } = withProbe('The matrix also promises `omd_not_a_tool`.')
  const result = checkParity({ root, docText })
  assert.equal(result.ok, false)
  assert.deepEqual(
    unknownEntities(result),
    [`parity unknown entity: omd_not_a_tool (doc line ${line})`],
    failDetail(result),
  )
})

test('a doc missing a registered tool fails the forward direction', () => {
  // Remove every mention, so the surrounding prose cannot satisfy the check by
  // accident and the failure proves the forward direction is real too.
  const docText = shippedDoc.replaceAll('omd_lsp', 'the language-server tool')
  assert.notEqual(docText, shippedDoc, 'the fixture must actually remove the name')
  const result = checkParity({ root, docText })
  assert.equal(result.ok, false)
  assert.ok(result.problems.includes('parity missing: tool omd_lsp'), failDetail(result))
  // Dropping a known name must not turn into a reverse-direction complaint.
  assert.deepEqual(unknownEntities(result), [], failDetail(result))
})

test('documented wildcard families and loader rows resolve, an undocumented family does not', () => {
  for (const token of [...WILDCARD_FAMILIES, ...NON_ENTITY_TOKENS]) {
    // An allowlist entry need not appear in today's doc (it can be a shape a
    // later doc edit legitimately uses, such as the `omd-result` fenced block);
    // it must still resolve on its own instead of being reported as unknown.
    if (shippedDoc.includes(token)) continue
    const resolved = checkParity({ root, docText: `\`${token}\` is documented.` })
    assert.deepEqual(unknownEntities(resolved), [], failDetail(resolved))
  }
  // A bare probe doc is missing every entity, but the allowlisted shapes must
  // not be reported as unknown: a family and a non-entity row both resolve.
  const allowedDoc = [...WILDCARD_FAMILIES, ...NON_ENTITY_TOKENS].map((token) => `\`${token}\``).join(', ')
  const allowed = checkParity({ root, docText: `${allowedDoc} are documented.` })
  assert.deepEqual(unknownEntities(allowed), [], failDetail(allowed))

  // A star is not a wildcard by itself: only a documented family is accepted, so
  // a doc may not invent a family the runtime does not have.
  const undocumented = checkParity({ root, docText: 'A new family `omd_workflow_*` promises state machines.' })
  assert.deepEqual(
    unknownEntities(undocumented),
    ['parity unknown entity: omd_workflow_* (doc line 1)'],
    failDetail(undocumented),
  )
})

test('the Agents table must name exactly the registered roles', () => {
  const withoutMomus = shippedDoc.replace(/^\|\s*momus \(subagent, reviewer\).*\n/m, '')
  assert.notEqual(withoutMomus, shippedDoc, 'the fixture row must exist to be removed')
  const missing = checkParity({ root, docText: withoutMomus })
  assert.equal(missing.ok, false)
  assert.ok(missing.problems.includes('parity agent table missing role: momus'), failDetail(missing))

  const rogueRow = '| rogue (primary, stowaway) | `rogue` | ported |'
  const withRogue = shippedDoc.replace(/^(\|\s*sisyphus-junior \(subagent, executor\).*\n)/m, `$1${rogueRow}\n`)
  assert.notEqual(withRogue, shippedDoc, 'the fixture row must exist to insert after')
  const line = withRogue.split(/\r?\n/).indexOf(rogueRow) + 1
  assert.ok(line > 0, 'the inserted row must be findable in the mutated doc')
  const extra = checkParity({ root, docText: withRogue })
  assert.equal(extra.ok, false)
  assert.ok(
    extra.problems.includes(`parity agent table names unknown role: rogue (doc line ${line})`),
    failDetail(extra),
  )
})

test('a stale per-role preset patch fails the gate through the injected root', async () => {
  const fakeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-parity-root-'))
  try {
    await fs.mkdir(path.join(fakeRoot, 'presets'), { recursive: true })
    await fs.writeFile(path.join(fakeRoot, 'presets', 'omd-oracle.patch.yml'), 'id: omd-oracle\n')
    const result = checkParity({ root: fakeRoot, docText: shippedDoc })
    assert.equal(result.ok, false)
    assert.ok(
      result.problems.includes('parity missing: stale per-role preset omd-oracle'),
      failDetail(result),
    )
  } finally {
    await fs.rm(fakeRoot, { recursive: true, force: true })
  }
})

// The name modules: the documented surface must equal the registered surface.

/**
 * Mount the shipped global runtime row the way `presets/omd-runtime.patch.yml`
 * does (`apply(ctx, {})`, no `agent` key) against the fake DSH context.
 */
async function mountRow() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-parity-row-'))
  const workspace = path.join(home, 'project')
  await fs.mkdir(workspace, { recursive: true })
  const { ctx, state } = createFakeContext({ cwd: workspace, agentPreset: 'standard' })
  const dispose = apply(ctx, {})
  return { home, state, dispose }
}

test('TOOL_NAMES equals the tool names the runtime registers', async () => {
  const { home, state, dispose } = await mountRow()
  try {
    const registered = state.tools.map((tool) => tool.name)
    assert.deepEqual(
      [...registered].sort(),
      [...TOOL_NAMES].sort(),
      'src/tools/names.js drifted from what createTools() registers',
    )
    assert.equal(new Set(registered).size, registered.length, 'a tool name must register once')
  } finally {
    dispose()
    await fs.rm(home, { recursive: true, force: true })
  }
})

test('COMMAND_NAMES equals the command names the runtime registers', async () => {
  const { home, state, dispose } = await mountRow()
  try {
    const registered = state.commands.map((command) => command.name)
    assert.deepEqual(
      [...registered].sort(),
      [...COMMAND_NAMES].sort(),
      'src/commands/names.js drifted from what createCommands() registers',
    )
    assert.equal(new Set(registered).size, registered.length, 'a command name must register once')
    // The doctor is a skill driving `omd_doctor`, not a command: a name module
    // that grew an `omd-doctor` entry would have to fail here.
    assert.equal(registered.includes('omd-doctor'), false)
  } finally {
    dispose()
    await fs.rm(home, { recursive: true, force: true })
  }
})

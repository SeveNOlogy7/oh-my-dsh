import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { checkParity } from '../scripts/check-parity.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const docText = readFileSync(new URL('../docs/parity-omo-4.19.4.md', import.meta.url), 'utf8')
const docLines = docText.split(/\r?\n/)

/** The six statuses the matrix may use; `partial` is the sixth, added last. */
const STATUSES = ['ported', 'adapted', 'host-native', 'deferred', 'n/a', 'partial']

/** Whole-word matcher for a status, safe for the slash in `n/a`. */
const statusPattern = (status) => new RegExp(`\\b${status.replace('/', '\\/')}\\b`)

/** The lines of the first matching level-2 section, heading excluded. */
function sectionLines(heading) {
  const start = docLines.findIndex((line) => heading.test(line))
  if (start === -1) return null
  const rest = docLines.slice(start + 1)
  const end = rest.findIndex((line) => /^##\s/.test(line))
  return end === -1 ? rest : rest.slice(0, end)
}

/** The status legend: the `Statuses:` run, falling back to the doc preamble. */
function legendText() {
  const at = docLines.findIndex((line) => /^#{0,3}\s*status(?:es)?\b/i.test(line.trim()))
  const rest = docLines.slice(at + 1)
  const end = rest.findIndex((line) => (at === -1 ? /^##\s/ : /^#{1,3}\s/).test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

test('the status legend defines all six statuses, including partial', () => {
  const legend = legendText()
  for (const status of STATUSES) {
    assert.ok(statusPattern(status).test(legend), `the status legend does not define \`${status}\`: ${legend.trim()}`)
  }
})

test('each hook subsection declares the row count its table really has, and the total is 54', () => {
  const hooks = sectionLines(/^##\s+Hooks\b/i)
  assert.notEqual(hooks, null, 'the doc has no `## Hooks` section')
  const hooksText = hooks.join('\n')

  // A `### <name> (<N>)` block's rows are its pipe lines minus the header and
  // the `|---|` separator. A block with no `(N)`, such as a prose one, declares
  // no count and is not part of the total.
  const blocks = hooksText.split(/^###\s+/m).slice(1).flatMap((part) => {
    const [head, ...body] = part.split('\n')
    const declared = Number(/\((\d+)\)\s*$/.exec(head.trim())?.[1])
    if (!Number.isInteger(declared)) return []
    const pipes = body.map((line) => line.trim()).filter((line) => line.startsWith('|'))
    const rows = pipes.filter((line) => !/^\|?[\s:|-]+$/.test(line)).length - 1
    return [{ heading: head.trim(), declared, rows }]
  })

  assert.ok(blocks.length > 0, 'the Hooks section has no `### <name> (<N>)` subsections')
  for (const block of blocks) {
    assert.equal(
      block.rows,
      block.declared,
      `${block.heading} declares ${block.declared} hooks but its table lists ${block.rows} rows`,
    )
  }
  const total = blocks.reduce((sum, block) => sum + block.declared, 0)
  const split = blocks.map((block) => `${block.heading} -> ${block.declared}`).join('; ')
  assert.equal(total, 54, `the hook subsections add up to ${total}, not 54: ${split}`)

  // The reconciliation note: the two splits, the hook OmO never shipped.
  for (const needle of ['thinking-block-validator', '24/16/5/7/2', 'absent from the v4.19.4 tree']) {
    assert.ok(hooksText.includes(needle), `the Hooks section does not contain \`${needle}\``)
  }
})

test('the not-aligned section lists gap rows with a status and an evidence pointer', () => {
  const lines = sectionLines(/^##\s+Not aligned with omo 4\.19\.4\b/i)
  assert.notEqual(lines, null, 'the doc has no `## Not aligned with omo 4.19.4` section')
  const section = lines.join('\n')

  const rows = lines.filter((line) => /^\|\s*G\d+\s*\|/.test(line.trim()))
  assert.ok(rows.length >= 10, `the not-aligned section has ${rows.length} \`| G<n> |\` rows; at least 10 are required`)
  for (const row of rows) {
    const id = /^\|\s*(G\d+)\s*\|/.exec(row.trim())[1]
    assert.ok(
      STATUSES.some((status) => statusPattern(status).test(row)),
      `gap row ${id} carries no status word from ${STATUSES.join(', ')}: ${row.trim()}`,
    )
    assert.ok(
      ['[repo]', '[upstream]', '[host]'].some((token) => row.includes(token)),
      `gap row ${id} carries no evidence pointer ([repo], [upstream], [host]): ${row.trim()}`,
    )
  }
  for (const token of ['[upstream]', '[host]']) {
    assert.ok(rows.some((row) => row.includes(token)), `no gap row cites ${token}`)
  }
  assert.ok(section.includes('v4.19.4'), 'the not-aligned section does not name the upstream tag `v4.19.4`')
  assert.ok(section.includes('b072d27'), 'the not-aligned section does not name the upstream commit `b072d27`')
})

test('the shipped doc passes check-parity.mjs in both directions', () => {
  const result = checkParity({ root, docText })
  const unknown = result.problems.filter((problem) => problem.startsWith('parity unknown entity:'))
  const missing = result.problems.filter((problem) => problem.startsWith('parity missing:'))
  assert.deepEqual(unknown, [], `the doc names entities the code does not register:\n${unknown.join('\n')}`)
  assert.deepEqual(missing, [], `the doc stopped documenting registered entities:\n${missing.join('\n')}`)
  // A reverse scan that saw no token at all would pass vacuously.
  assert.ok(result.counts.tokens > 0, 'the reverse scan saw no tokens, so its silence proves nothing')
})

test('the doc does not invent the `omd_session_info` tool', () => {
  assert.equal(
    docText.includes('omd_session_info'),
    false,
    'the doc mentions `omd_session_info`, a tool the runtime does not register',
  )
})

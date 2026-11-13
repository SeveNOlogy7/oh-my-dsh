#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstream = process.env.OMD_UPSTREAM_DIR

function grams(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out = new Set()
  for (let index = 0; index + 7 < words.length; index += 1) {
    out.add(words.slice(index, index + 8).join(' '))
  }
  return out
}

async function collect(dir, predicate, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collect(full, predicate, out)
    else if (predicate(entry.name)) out.push(full)
  }
  return out
}

// Exit codes are the whole point of this gate: 0 = measured and clean, 1 =
// measured and over the review threshold, 2 = UNMEASURED. A skip that exits 0
// reads as "the clean-room claim was measured and held" while nothing was
// measured at all, so the unmeasured path is loud and non-zero instead.
if (!upstream) {
  console.log('license audit: UNMEASURED - set OMD_UPSTREAM_DIR to a checkout of oh-my-openagent v4.19.4')
  process.exitCode = 2
} else {
  const upstreamFiles = [
    'README.md',
    'docs/reference/features.md',
    'docs/guide/orchestration.md',
    'packages/shared-skills/skills/ulw-plan/SKILL.md',
    'packages/shared-skills/skills/start-work/SKILL.md',
  ]
  const upstreamGrams = new Set()
  let upstreamBytes = 0
  for (const relative of upstreamFiles) {
    try {
      const text = await fs.readFile(path.join(upstream, relative), 'utf8')
      upstreamBytes += Buffer.byteLength(text)
      for (const gram of grams(text)) upstreamGrams.add(gram)
    } catch {
      // sample file absent in a partial checkout
    }
  }

  const ours = [
    ...(await collect(path.join(root, 'prompts'), (name) => name.endsWith('.md'))),
    ...(await collect(path.join(root, 'skills'), (name) => name === 'SKILL.md')),
    ...(await collect(path.join(root, 'docs'), (name) => name.endsWith('.md'))),
  ]
  const shared = new Set()
  let ourBytes = 0
  for (const file of ours) {
    const text = await fs.readFile(file, 'utf8')
    ourBytes += Buffer.byteLength(text)
    for (const gram of grams(text)) if (upstreamGrams.has(gram)) shared.add(gram)
  }

  console.log(`license audit: upstream ${upstreamBytes} bytes / ${upstreamGrams.size} 8-grams; ours ${ourBytes} bytes; shared ${shared.size}`)
  if (shared.size) console.log(`sample shared 8-grams: ${[...shared].slice(0, 10).join(' | ')}`)
  if (shared.size > 200) {
    console.error('license audit: shared 8-gram count exceeds the review threshold; inspect before release')
    process.exit(1)
  }
}

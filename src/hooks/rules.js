import path from 'node:path'
import { promises as fs } from 'node:fs'
import { parseFrontmatter } from '../core/frontmatter.js'
import { matchesAny } from '../core/glob.js'
import { readTextSafe } from '../core/atomic.js'

async function listMarkdown(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdc'))) {
        files.push(path.join(dir, entry.name))
      }
    }
    return files.sort()
  } catch {
    return []
  }
}

/** Load .omd/rules markdown, split into always-on and glob-conditional rules. */
export async function loadRules({ workspace, config }) {
  const paths = config?.rules?.paths ?? ['.omd/rules']
  const maxBytes = config?.rules?.maxBytes ?? 65536
  const always = []
  const conditional = []
  let used = 0
  for (const relative of paths) {
    const dir = path.isAbsolute(relative) ? relative : path.resolve(workspace, relative)
    for (const file of await listMarkdown(dir)) {
      const read = await readTextSafe(file)
      if (!read.ok) continue
      const parsed = parseFrontmatter(read.value)
      const text = parsed.body.trim()
      if (!text) continue
      const bytes = Buffer.byteLength(text, 'utf8')
      if (used + bytes > maxBytes) break
      used += bytes
      const globs = Array.isArray(parsed.data.globs) ? parsed.data.globs : null
      const alwaysApply = parsed.data.alwaysApply === true || !globs?.length
      const entry = { file, text, globs }
      if (alwaysApply) always.push(entry)
      else conditional.push(entry)
    }
  }
  return { always, conditional, used, maxBytes }
}

export function composeRulesText(always, conditional, watchedFiles = []) {
  const parts = []
  for (const rule of always) parts.push(rule.text)
  for (const rule of conditional) {
    if (watchedFiles.some((file) => matchesAny(rule.globs, file))) parts.push(rule.text)
  }
  return parts.join('\n\n')
}

export function makeRulesSection(always, conditional) {
  const state = { text: '' }
  const watched = new Set()
  const refresh = () => {
    state.text = composeRulesText(always, conditional, [...watched])
  }
  refresh()
  return {
    get text() {
      return state.text
    },
    watch(file) {
      if (!file) return
      watched.add(String(file).replace(/\\/g, '/'))
      refresh()
    },
    watched,
  }
}

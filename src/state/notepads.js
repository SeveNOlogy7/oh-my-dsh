import { ensureDir, readTextSafe, writeTextAtomic, appendText, listFiles } from '../core/atomic.js'
import { omdPath, safeStem } from '../core/paths.js'
import path from 'node:path'

const SECTIONS = ['learnings', 'decisions', 'issues', 'verification', 'problems']

export function notepadDir(workspace, plan) {
  return omdPath(workspace, 'notepads', safeStem(plan))
}

export function notepadPath(workspace, plan, section) {
  const name = SECTIONS.includes(section) ? section : 'learnings'
  return omdPath(workspace, 'notepads', safeStem(plan), `${name}.md`)
}

export async function appendNotepad({ workspace, plan, section = 'learnings', text, agent = null, task = null }) {
  if (!text || !String(text).trim()) throw new Error('notepad text is required')
  const file = notepadPath(workspace, plan, section)
  const read = await readTextSafe(file)
  const header = read.ok
    ? ''
    : `# ${SECTIONS.includes(section) ? section : 'learnings'} — ${plan}\n\n`
  const meta = [agent ? `agent=${agent}` : null, task ? `task=${task}` : null].filter(Boolean).join(' ')
  const entry = `${header}## ${new Date().toISOString()}${meta ? ` (${meta})` : ''}\n\n${String(text).trim()}\n\n`
  await ensureDir(path.dirname(file))
  await appendText(file, entry)
  return file
}

export async function listNotepads(workspace, plan) {
  return listFiles(notepadDir(workspace, plan), (name) => name.endsWith('.md'))
}

export async function readNotepads(workspace, plan) {
  const files = await listNotepads(workspace, plan)
  const out = {}
  for (const file of files) {
    const read = await readTextSafe(file)
    if (read.ok) out[path.basename(file, '.md')] = read.value
  }
  return out
}

export { SECTIONS }

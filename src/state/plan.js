import path from 'node:path'
import { promises as fs } from 'node:fs'
import { parseFrontmatter } from '../core/frontmatter.js'
import { omdPath, planPath, draftPath, safeStem } from '../core/paths.js'
import { readTextSafe, listFiles, writeTextAtomic } from '../core/atomic.js'

const TASK_LINE = /^- \[([ xX])\] (F?\d+)\.\s+(.*)$/
const CATEGORY_LINE = /^\s+Recommended task executor category:\s*(\S+)\s*$/
const SECTION_LINE = /^##\s+(.+?)\s*$/
const TITLE_LINE = /^#\s+(.+?)\s*$/

/**
 * Parse the OMD plan grammar:
 *   ## TODOs / ## Final Verification Wave
 *   - [ ] 1. Title
 *     Recommended task executor category: deep
 */
export function parsePlan(text, source = '<plan>') {
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const { data, body } = parseFrontmatter(normalized)
  const tasks = []
  let section = null
  let title = data.plan ? String(data.plan) : ''
  let lastTask = null
  for (const line of body.split('\n')) {
    const sectionMatch = SECTION_LINE.exec(line)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      continue
    }
    const titleMatch = TITLE_LINE.exec(line)
    if (titleMatch && !title) {
      title = titleMatch[1].trim()
      continue
    }
    const taskMatch = TASK_LINE.exec(line)
    if (taskMatch) {
      const id = taskMatch[2]
      lastTask = {
        id,
        checked: taskMatch[1].toLowerCase() === 'x',
        title: taskMatch[3].trim(),
        category: null,
        section: section ?? '',
        final: id.startsWith('F'),
        line,
        source,
      }
      tasks.push(lastTask)
      continue
    }
    const categoryMatch = CATEGORY_LINE.exec(line)
    if (categoryMatch && lastTask) {
      lastTask.category = categoryMatch[1]
    }
  }
  const checked = tasks.filter((task) => task.checked).length
  return {
    source,
    title: title || path.basename(source, '.md'),
    frontmatter: data,
    status: typeof data.status === 'string' ? data.status : 'draft',
    tasks,
    total: tasks.length,
    checked,
    open: tasks.filter((task) => !task.checked),
    body,
    text,
  }
}

export function planSummary(doc) {
  return {
    source: doc.source,
    title: doc.title,
    status: doc.status,
    total: doc.total,
    checked: doc.checked,
    open: doc.total - doc.checked,
  }
}

export function nextOpenTask(doc) {
  return doc.open[0] ?? null
}

export function validatePlanFormat(text) {
  const doc = parsePlan(text)
  const warnings = []
  if (!doc.tasks.length) warnings.push('plan has no task rows')
  if (doc.status === 'draft') warnings.push('plan status is still draft')
  for (const task of doc.tasks) {
    if (!/^\d+$|^F\d+$/.test(task.id)) warnings.push(`task id is not numeric: ${task.id}`)
    if (!task.category) warnings.push(`task ${task.id} has no recommended category`)
  }
  return warnings
}

export async function listPlans(workspace) {
  const dir = omdPath(workspace, 'plans')
  const files = await listFiles(dir, (name) => name.endsWith('.md'))
  const docs = []
  for (const file of files) {
    const read = await readTextSafe(file)
    if (!read.ok) continue
    docs.push(parsePlan(read.value, file))
  }
  return docs
}

export async function readPlan(workspace, slugOrPath) {
  const file = path.isAbsolute(slugOrPath)
    ? slugOrPath
    : omdPath(workspace, 'plans', `${safeStem(slugOrPath)}.md`)
  const read = await readTextSafe(file)
  if (!read.ok) return null
  return parsePlan(read.value, file)
}

export async function latestPlan(workspace, { status } = {}) {
  const plans = await listPlans(workspace)
  const filtered = status ? plans.filter((plan) => plan.status === status) : plans
  if (!filtered.length) return null
  const stats = await Promise.all(
    filtered.map(async (plan) => ({ plan, mtime: await mtimeOf(plan.source) })),
  )
  stats.sort((a, b) => b.mtime - a.mtime)
  return stats[0].plan
}

async function mtimeOf(file) {
  try {
    return (await fs.stat(file)).mtimeMs
  } catch {
    return 0
  }
}

export async function writePlan(workspace, slug, text) {
  const file = planPath(workspace, slug)
  await writeTextAtomic(file, text)
  return file
}

export async function writeDraft(workspace, slug, text) {
  const file = draftPath(workspace, slug)
  await writeTextAtomic(file, text)
  return file
}

export function renderPlanHeader({ title, status = 'draft', plan }) {
  return [
    '---',
    `plan: ${JSON.stringify(plan ?? title)}`,
    `status: ${status}`,
    `created: ${new Date().toISOString()}`,
    '---',
    '',
    `# Plan: ${title}`,
    '',
  ].join('\n')
}

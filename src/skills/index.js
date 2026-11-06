import path from 'node:path'
import { promises as fs } from 'node:fs'
import { parseFrontmatter } from '../core/frontmatter.js'
import { readTextSafe } from '../core/atomic.js'
import { skillsFor } from '../agents/registry.js'
import { loadSkillText } from '../agents/prompts.js'
import { text } from '../i18n/index.js'

function summaryFrom(name, parsed, file, language) {
  const data = parsed.data ?? {}
  const whenToUse = data.whenToUse ?? data['when-to-use']
  return {
    name: data.name ?? name,
    description: text(language, `skill.${name}.description`, data.description ?? `OMD skill ${name}`),
    // The SKILL.md body and its English frontmatter stay as authored; only the
    // summary the model reads is localized.
    whenToUse: whenToUse ? text(language, `skill.${name}.whenToUse`, whenToUse) : undefined,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'oh-my-dsh',
    path: file,
    resourceBase: { kind: 'directory', path: path.dirname(file) },
  }
}

function projectSummary(name, parsed, file) {
  const data = parsed.data ?? {}
  return {
    name: data.name ?? name,
    description: data.description ?? `Project OMD skill ${name}`,
    whenToUse: data.whenToUse ?? data['when-to-use'],
    invocation: {
      modelInvocable: data.modelInvocable !== false,
      userInvocable: data.userInvocable !== false,
    },
    source: 'project-omd',
    provider: 'omd-workspace',
    path: file,
    rank: 10,
    locator: file,
    metadata: { directory: path.basename(path.dirname(file)) },
  }
}

/** Bundled OMD skills for this preset's agent. */
export async function createSkills(runtime) {
  const skills = []
  for (const name of skillsFor(runtime.agentId, {})) {
    if (name === '*') continue
    const file = new URL(`../../skills/${name}/SKILL.md`, import.meta.url)
    const content = await loadSkillText(name)
    if (!content) continue
    const parsed = parseFrontmatter(content)
    const body = parsed.body.trim()
    if (!body) continue
    const filePath = file.pathname.replace(/^\/([A-Za-z]:)/, '$1')
    skills.push({ ...summaryFrom(name, parsed, filePath, runtime.language), content: body })
  }
  return skills
}

/** Project-level `.omd/skills/<name>/SKILL.md` provider. */
export function createSkillProvider() {
  return () => ({
    name: 'omd-workspace',
    async list(options = {}) {
      const cwd = options.cwd ?? process.cwd()
      const dir = path.join(cwd, '.omd', 'skills')
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return []
      }
      const candidates = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const file = path.join(dir, entry.name, 'SKILL.md')
        const read = await readTextSafe(file)
        if (!read.ok) continue
        const parsed = parseFrontmatter(read.value)
        const candidate = projectSummary(entry.name, parsed, file)
        if (!candidate.name) continue
        candidates.push(candidate)
      }
      return candidates
    },
    async get(candidate) {
      const read = await readTextSafe(candidate.locator ?? candidate.path)
      if (!read.ok) return undefined
      const parsed = parseFrontmatter(read.value)
      return {
        ...candidate,
        content: parsed.body.trim(),
        metadata: { ...(candidate.metadata ?? {}) },
      }
    },
  })
}

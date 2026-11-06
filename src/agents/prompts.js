import { promises as fs } from 'node:fs'
import { AGENT_IDS } from '../core/constants.js'

const cache = new Map()

async function readText(url) {
  try {
    return await fs.readFile(url, 'utf8')
  } catch {
    return ''
  }
}

/** Load the shared operating contract and one role prompt, then compose them. */
export async function loadAgentPrompt(agentId) {
  if (cache.has(agentId)) return cache.get(agentId)
  const contract = await readText(new URL('../../prompts/agents/_contract.md', import.meta.url))
  const role = await readText(new URL(`../../prompts/agents/${agentId}.md`, import.meta.url))
  const text = [contract.trim(), role.trim()].filter(Boolean).join('\n\n')
  if (!text) throw new Error(`missing prompt for agent: ${agentId}`)
  cache.set(agentId, text)
  return text
}

export async function loadModePrompt(mode) {
  const key = `mode:${mode}`
  if (cache.has(key)) return cache.get(key)
  const text = await readText(new URL(`../../prompts/modes/${mode}.md`, import.meta.url))
  cache.set(key, text)
  return text
}

export async function loadProtocol(name) {
  const key = `protocol:${name}`
  if (cache.has(key)) return cache.get(key)
  const text = await readText(new URL(`../../prompts/protocols/${name}.md`, import.meta.url))
  cache.set(key, text)
  return text
}

export async function loadSkillText(name) {
  const key = `skill:${name}`
  if (cache.has(key)) return cache.get(key)
  const text = await readText(new URL(`../../skills/${name}/SKILL.md`, import.meta.url))
  cache.set(key, text)
  return text
}

export function clearPromptCache() {
  cache.clear()
}

export { AGENT_IDS }

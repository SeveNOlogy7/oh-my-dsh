#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_IDS, SKILL_NAMES, presetIdFor } from '../src/agents/registry.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parity = await fs.readFile(path.join(root, 'docs', 'parity-omo-4.19.4.md'), 'utf8')

const tools = [
  'omd_delegate',
  'omd_background_output',
  'omd_background_cancel',
  'omd_background_list',
  'omd_session_list',
  'omd_session_read',
  'omd_session_search',
  'omd_task_create',
  'omd_task_get',
  'omd_task_list',
  'omd_task_update',
  'omd_notepad',
  'omd_lsp',
  'omd_diagnostics',
  'omd_look_at',
  'omd_mode',
  'omd_status',
  'omd_ui_status',
  'omd_doctor',
]
const commands = [
  'omd-init',
  'omd-status',
  'omd-config',
  'omd-ulw',
  'omd-plan',
  'omd-hyperplan',
  'omd-team',
  'omd-start-work',
  'omd-stop-continuation',
  'omd-handoff',
  'omd-init-deep',
  'omd-refactor',
  'omd-remove-ai-slops',
]

const missing = []
for (const id of AGENT_IDS) {
  if (!parity.includes(id)) missing.push(`agent ${id}`)
  if (!parity.includes(presetIdFor(id))) missing.push(`preset ${presetIdFor(id)}`)
}
for (const tool of tools) if (!parity.includes(tool)) missing.push(`tool ${tool}`)
for (const command of commands) if (!parity.includes(command)) missing.push(`command ${command}`)
for (const skill of SKILL_NAMES) if (!parity.includes(skill)) missing.push(`skill ${skill}`)
for (const marker of ['mass ulw', 'ralph']) if (!parity.toLowerCase().includes(marker)) missing.push(`note ${marker}`)

if (missing.length) {
  for (const item of missing) console.error(`parity missing: ${item}`)
  process.exit(1)
}
console.log(`parity ok: ${AGENT_IDS.length} agents, ${tools.length} tools, ${commands.length} commands, ${SKILL_NAMES.length} skills`)

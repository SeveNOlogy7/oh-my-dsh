import { AGENT_IDS } from '../core/constants.js'

export { AGENT_IDS }

export const SKILL_NAMES = [
  'omd-doctor',
  'omd-ulw-plan',
  'omd-ulw-execute',
  'omd-ulw-research',
  'omd-review-work',
  'omd-init-deep',
  'omd-refactor',
  'omd-git-master',
  'omd-frontend',
  'omd-ast-grep',
  'omd-remove-ai-slops',
  'omd-hyperplan',
  'omd-team-mode',
  'omd-debugging',
  'omd-visual-qa',
]

/**
 * Every role carries `mode`, but DSH's preset picker lists every registered
 * preset: `PresetDefinition` exposes only id/name/description/order/plugins, it
 * has no hidden or selectable field, and a delegated child needs its preset
 * registered because the subagent service mounts it by id. A subagent preset
 * therefore cannot be hidden from the picker, so the roster order makes the
 * hierarchy visible instead: primaries sort first (10-13) and subagents follow
 * (20-26), and the subagent descriptions say they are delegation targets.
 */
export const DELEGATION_ONLY = 'Delegation target — call it from a primary agent with omd_delegate; not meant to drive a session (委派目标：由主 agent 通过 omd_delegate 调用，不适合直接开会话).'

/**
 * The eleven OmO 4.19.4 roles, expressed as OMD presets. Policy here is
 * structural: readOnly denies file mutation tools, canDelegate decides whether
 * omd_delegate exists, and writeScopes is enforced by a tool guard.
 *
 * `omd-doctor` leads every role's skill list: a self-check is useful to any
 * role, including the read-only ones, and it replaced the old `/omd-doctor`
 * command.
 */
export const AGENTS = {
  sisyphus: {
    id: 'sisyphus',
    displayName: 'Sisyphus · OMD',
    title: 'Orchestrator',
    mode: 'primary',
    order: 10,
    prompt: 'sisyphus',
    description: 'Plans, delegates, verifies, and drives a task to completion.',
    readOnly: false,
    canDelegate: true,
    allowedSubagents: ['*'],
    writeScopes: null,
    toolPolicy: 'full',
    skills: ['*'],
  },
  hephaestus: {
    id: 'hephaestus',
    displayName: 'Hephaestus · OMD',
    title: 'Deep Worker',
    mode: 'primary',
    order: 11,
    prompt: 'hephaestus',
    description: 'Autonomous deep implementation and debugging from a goal, not a recipe.',
    readOnly: false,
    canDelegate: true,
    allowedSubagents: ['oracle', 'explore', 'librarian', 'sisyphus-junior'],
    writeScopes: null,
    toolPolicy: 'full',
    skills: ['omd-doctor', 'omd-ulw-research', 'omd-ulw-execute', 'omd-review-work', 'omd-git-master', 'omd-frontend', 'omd-ast-grep', 'omd-debugging', 'omd-refactor'],
  },
  prometheus: {
    id: 'prometheus',
    displayName: 'Prometheus · OMD',
    title: 'Strategic Planner',
    mode: 'primary',
    order: 12,
    prompt: 'prometheus',
    description: 'Interviews, resolves scope, and writes an approved plan before execution.',
    readOnly: false,
    canDelegate: true,
    allowedSubagents: ['explore', 'librarian', 'metis', 'momus', 'oracle'],
    writeScopes: ['.omd/'],
    toolPolicy: 'planner',
    skills: ['omd-doctor', 'omd-ulw-plan', 'omd-ulw-research', 'omd-review-work', 'omd-ast-grep'],
  },
  atlas: {
    id: 'atlas',
    displayName: 'Atlas · OMD',
    title: 'Plan Conductor',
    mode: 'primary',
    order: 13,
    prompt: 'atlas',
    description: 'Executes an approved plan through delegated workers and verifies every wave.',
    readOnly: true,
    canDelegate: true,
    allowedSubagents: ['sisyphus-junior', 'oracle', 'explore', 'librarian'],
    writeScopes: null,
    toolPolicy: 'conductor',
    skills: ['omd-doctor', 'omd-ulw-execute', 'omd-review-work', 'omd-git-master', 'omd-ast-grep'],
  },
  oracle: {
    id: 'oracle',
    displayName: 'Oracle · OMD',
    title: 'Architecture Consultant',
    mode: 'subagent',
    order: 20,
    prompt: 'oracle',
    description: `Read-only architecture advice, debugging analysis, and plan review. ${DELEGATION_ONLY}`,
    readOnly: true,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'readonly',
    skills: ['omd-doctor', 'omd-review-work', 'omd-ast-grep', 'omd-debugging'],
  },
  librarian: {
    id: 'librarian',
    displayName: 'Librarian · OMD',
    title: 'Docs and OSS Researcher',
    mode: 'subagent',
    order: 21,
    prompt: 'librarian',
    description: `Read-only documentation and upstream source research with citations. ${DELEGATION_ONLY}`,
    readOnly: true,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'readonly',
    skills: ['omd-doctor', 'omd-ulw-research', 'omd-review-work'],
  },
  explore: {
    id: 'explore',
    displayName: 'Explore · OMD',
    title: 'Codebase Scanner',
    mode: 'subagent',
    order: 22,
    prompt: 'explore',
    description: `Fast read-only codebase reconnaissance and pattern location. ${DELEGATION_ONLY}`,
    readOnly: true,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'readonly',
    skills: ['omd-doctor', 'omd-ulw-research', 'omd-ast-grep'],
  },
  'multimodal-looker': {
    id: 'multimodal-looker',
    displayName: 'Multimodal Looker · OMD',
    title: 'Visual Analyst',
    mode: 'subagent',
    order: 23,
    prompt: 'multimodal-looker',
    description: `Read-only image and visual artifact analysis. ${DELEGATION_ONLY}`,
    readOnly: true,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'looker',
    skills: ['omd-doctor', 'omd-visual-qa'],
  },
  metis: {
    id: 'metis',
    displayName: 'Metis · OMD',
    title: 'Plan Gap Analyst',
    mode: 'subagent',
    order: 24,
    prompt: 'metis',
    description: `Surfaces hidden intent, ambiguity, scope creep, and missing acceptance criteria. ${DELEGATION_ONLY}`,
    readOnly: true,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'readonly',
    skills: ['omd-doctor', 'omd-ulw-plan', 'omd-review-work'],
  },
  momus: {
    id: 'momus',
    displayName: 'Momus · OMD',
    title: 'Adversarial Reviewer',
    mode: 'subagent',
    order: 25,
    prompt: 'momus',
    description: `Reviews plans and implementations for verified blockers, not style preferences. ${DELEGATION_ONLY}`,
    readOnly: true,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'readonly',
    skills: ['omd-doctor', 'omd-review-work', 'omd-ast-grep'],
  },
  'sisyphus-junior': {
    id: 'sisyphus-junior',
    displayName: 'Sisyphus-Junior · OMD',
    title: 'Task Executor',
    mode: 'subagent',
    order: 26,
    prompt: 'sisyphus-junior',
    description: `Executes one delegated task with strict scope, verification, and a DoneClaim. ${DELEGATION_ONLY}`,
    readOnly: false,
    canDelegate: false,
    allowedSubagents: [],
    writeScopes: null,
    toolPolicy: 'executor',
    skills: ['omd-doctor', 'omd-ulw-execute', 'omd-refactor', 'omd-git-master', 'omd-frontend', 'omd-ast-grep', 'omd-remove-ai-slops', 'omd-debugging'],
  },
}

export function getAgent(id) {
  return AGENTS[id] ?? null
}

export function agentIds() {
  return [...AGENT_IDS]
}

export function presetIdFor(id) {
  return `omd-${id}`
}

/**
 * The role a preset id stands for, or `null` when the preset is not an OMD one.
 *
 * This is what makes a single profile-level runtime row work: the row no longer
 * declares `agent`, so the role is read back off whichever preset the session
 * actually runs. Every non-OMD preset (the shipped `standard`, `ptc`, `minimal`
 * and `cordis`) resolves to `null`, the capability-only identity.
 */
export function agentIdFromPreset(presetId) {
  if (!presetId?.startsWith('omd-')) return null
  const id = presetId.slice(4)
  return AGENTS[id] ? id : null
}

/**
 * `null` is the capability-only identity: a session whose preset is not an OMD
 * one still gets the orchestration surface, but no role, no persona, and no
 * role policy. Every reader below therefore treats `null` as "unrestricted"
 * rather than as an unknown role, which is the opposite of how an unknown
 * string id is treated.
 */
export function isReadOnly(id, settings = {}) {
  if (id == null) return Boolean(settings.readOnly)
  return Boolean(AGENTS[id]?.readOnly || settings.readOnly)
}

export function canDelegate(id, settings = {}) {
  if (id == null) return settings.canDelegate !== false
  return Boolean(AGENTS[id]?.canDelegate && settings.canDelegate !== false)
}

export function allowedSubagents(id, config) {
  const override = id == null ? undefined : config?.agents?.[id]?.allowedSubagents
  if (Array.isArray(override)) return override
  if (id == null) return ['*']
  return AGENTS[id]?.allowedSubagents ?? []
}

export function isSubagentAllowed(caller, target, config) {
  const allowed = allowedSubagents(caller, config)
  if (allowed.includes('*')) return true
  return allowed.includes(target)
}

export function writeScopes(id) {
  return AGENTS[id]?.writeScopes ?? null
}

export function skillsFor(id, config) {
  if (id == null) return [...SKILL_NAMES]
  const base = AGENTS[id]?.skills ?? []
  const override = config?.agents?.[id]?.skills
  const list = Array.isArray(override) ? override : base
  if (list.includes('*')) return [...SKILL_NAMES]
  return list
}

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
 * Every role carries `mode`, but nothing is hidden from the user by it: OMD
 * publishes no preset per role, so the picker never lists a role as a choice.
 * `mode` decides who may drive a session and who is only ever a delegation
 * target, and the description marker below states that in the one place a model
 * reads the roster. DSH's `PresetDefinition` still has no hidden/selectable
 * field, so if the presets ever come back, the roster order plus this marker is
 * the only way to show the hierarchy.
 */
export const DELEGATION_ONLY = 'Delegation target — call it from a primary agent with omd_delegate; not meant to drive a session (委派目标：由主 agent 通过 omd_delegate 调用，不适合直接开会话).'

/**
 * The eleven OmO 4.19.4 roles. Policy here is structural: readOnly denies file
 * mutation tools, canDelegate decides whether omd_delegate exists, and
 * writeScopes is enforced by a tool guard.
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
 * The channel OMD carries a role on now that it publishes no preset per role.
 *
 * A delegated child's composition accepts no OMD-specific field, so the role
 * has to ride on something DSH already persists: the durable subagent
 * descriptor's `label`. `delegate.js` and `lookat.js` are its writers, and the
 * readers are `roleFromLabel` and `state/active-role.js`.
 */
export const ROLE_LABEL_PREFIX = 'omd:'

/**
 * The descriptor label that carries `role`, and optionally the category the
 * delegation routed through.
 *
 * The category travels on the same durable label because a delegated child has
 * no other channel: its composition accepts no OMD field, and the category is
 * what selects the model chain the child must fall back through. `@` is the
 * separator and the category is URI-encoded, so a custom category name cannot
 * change the role prefix's meaning. A plain `omd:<role>` label from an older
 * build stays valid and simply carries no category.
 */
export function roleLabelFor(role, category = null) {
  if (typeof role !== 'string' || !role) return null
  const base = `${ROLE_LABEL_PREFIX}${role}`
  if (typeof category !== 'string' || category === '') return base
  try {
    return `${base}@${encodeURIComponent(category)}`
  } catch {
    return base
  }
}

/**
 * Both facts a descriptor label can carry, or `null` when it carries no role.
 *
 * The roster validation is the security boundary: a label OMD did not write, or
 * one naming a role that does not exist, resolves to no role at all rather than
 * to an unknown string id.
 */
export function roleLabelInfo(label) {
  if (typeof label !== 'string') return null
  if (!label.startsWith(ROLE_LABEL_PREFIX)) return null
  const rest = label.slice(ROLE_LABEL_PREFIX.length)
  const at = rest.indexOf('@')
  const id = at === -1 ? rest : rest.slice(0, at)
  if (!id || !AGENTS[id]) return null
  let category = null
  if (at !== -1 && at < rest.length - 1) {
    try {
      category = decodeURIComponent(rest.slice(at + 1)) || null
    } catch {
      category = null
    }
  }
  return { role: id, category }
}

/**
 * The role a descriptor label stands for, or `null` when it carries none.
 *
 * Validates the prefix *and* the roster, which is what keeps a descriptor's
 * label from becoming an escalation path. `null` is the capability-only
 * identity, so an unrecognized label degrades to exactly that.
 */
export function roleFromLabel(label) {
  return roleLabelInfo(label)?.role ?? null
}

/** The category a descriptor label carries, or `null` when it carries none. */
export function categoryFromLabel(label) {
  return roleLabelInfo(label)?.category ?? null
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

import { AGENTS, isReadOnly } from './registry.js'

/**
 * Desired tool restriction for one agent. Unknown names are filtered by the
 * runtime against the tools actually visible in the preset, because
 * ctx.tools.restrict rejects unknown names.
 */
export function restrictionFor(agentId) {
  const agent = AGENTS[agentId]
  if (!agent) return null
  if (agent.toolPolicy === 'looker') {
    // The looker is an allowlist, so every extra capability is named here.
    // omd_doctor is report-only diagnostics and stays visible to read-only roles.
    return { allow: ['read', 'read_image', 'glob', 'grep', 'omd_doctor'] }
  }
  if (isReadOnly(agentId)) {
    return { deny: ['write', 'edit'] }
  }
  return null
}

/** Tools that must never be visible to an agent even if registered globally. */
export function deniedToolsFor(agentId) {
  const restriction = restrictionFor(agentId)
  return restriction?.deny ?? []
}

/** Filter a restriction against the tool names visible to an agent. */
export function filterRestriction(restriction, visibleNames) {
  if (!restriction) return null
  const visible = new Set(visibleNames)
  if (restriction.allow) {
    const allow = restriction.allow.filter((name) => visible.has(name))
    if (!allow.length) return null
    return { allow }
  }
  if (restriction.deny) {
    const deny = restriction.deny.filter((name) => visible.has(name))
    if (!deny.length) return null
    return { deny }
  }
  return null
}

/** Whether a write-like tool call path is inside one of the agent's scopes. */
export function pathAllowedFor(agentId, candidate, root) {
  const scopes = AGENTS[agentId]?.writeScopes
  if (!scopes || !scopes.length) return true
  const normalized = String(candidate).replace(/\\/g, '/')
  const relative = normalized.startsWith(String(root).replace(/\\/g, '/'))
    ? normalized.slice(String(root).replace(/\\/g, '/').length).replace(/^\//, '')
    : normalized
  return scopes.some((scope) => {
    const clean = scope.replace(/^\.\//, '').replace(/\/$/, '')
    return relative === clean || relative.startsWith(`${clean}/`)
  })
}

/** Delegation target presets available to an agent. */
export function delegationPolicy(agentId) {
  const agent = AGENTS[agentId]
  return {
    canDelegate: Boolean(agent?.canDelegate),
    allowedSubagents: agent?.allowedSubagents ?? [],
    writeScopes: agent?.writeScopes ?? null,
    readOnly: Boolean(agent?.readOnly),
  }
}

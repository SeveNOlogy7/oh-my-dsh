import { roleLabelInfo } from '../agents/registry.js'

/**
 * Resolve the OMD role **and category** of a delegated child from its own
 * `subagent/descriptor`.
 *
 * OMD no longer publishes one preset per role, so `agentIdFromPreset` cannot be
 * the role channel any more. The durable label of the child's subagent
 * descriptor can: DSH's subagent service appends it during the child's setup, so
 * it is already on the child's log when an `agent/created` listener first runs,
 * and it survives cold resume because it is what the composition is rebuilt
 * from.
 *
 * The category rides on the same label (`omd:<role>@<encoded category>`) because
 * it selects the model chain the child must use for fallback; a plain role
 * label simply yields `category: null`.
 *
 * The scan goes backwards so a child's own descriptor outranks an ancestor's.
 * `ownEvents()` is the child's own log, but a forked seed can carry an ancestor
 * descriptor into it, and the last one is the current identity — the same
 * last-wins rule DSH itself folds `mode`/`label` with. A descriptor whose label
 * is missing or is not an OMD role is deliberately skipped rather than treated
 * as "this child has no role", so neither an ancestor nor an unrelated label in
 * the same log can mask the child's own role.
 */
export async function resolveDescriptorRoleInfo(ctx, agent) {
  const live = liveSession(ctx, agent)
  const fromLive = infoFromEvents(ownEventsOf(live))
  if (fromLive) return fromLive

  const events = await readSessionEvents(ctx, agent)
  if (events) {
    const fromLog = infoFromEvents(events)
    if (fromLog) return fromLog
  }
  return null
}

/** The role-only view kept for callers that do not need the category. */
export async function resolveDescriptorRole(ctx, agent) {
  return (await resolveDescriptorRoleInfo(ctx, agent))?.role ?? null
}

/** The live session's events, or none when the record cannot produce them. */
function ownEventsOf(live) {
  if (typeof live?.ownEvents !== 'function') return []
  try {
    return live.ownEvents() ?? []
  } catch {
    return []
  }
}

/** One optional service, or `undefined` when the registry cannot produce it. */
function service(ctx, name) {
  try {
    return ctx?.get?.(name)
  } catch {
    return undefined
  }
}

function liveSession(ctx, agent) {
  try {
    return service(ctx, 'sessions')?.get?.(agent?.id)
  } catch {
    return undefined
  }
}

/** The last committed role label in the log, or `null` when it has none. */
function infoFromEvents(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'subagent/descriptor') continue
    const info = roleLabelInfo(event?.data?.label)
    if (info) return info
  }
  return null
}

/**
 * The session's events as read back from disk, or `null` when that read is
 * unavailable or fails.
 *
 * This is a second, independent view of the same log, not a different question:
 * both views scan for the identical `subagent/descriptor` pattern, so a role
 * missed above can only be found here when the LIVE read was unavailable rather
 * than merely role-less. Returning `null` rather than `[]` keeps an unreadable
 * log from being mistaken for a confidently role-less one.
 */
async function readSessionEvents(ctx, agent) {
  if (!agent?.id) return null
  // The method reads `this._corpus`, so it must keep its receiver; calling it
  // detached threw a TypeError that the catch below reported as "unreadable log".
  const query = service(ctx, 'sessionQuery')
  if (!query || typeof query.readSession !== 'function') return null
  try {
    const snapshot = await query.readSession(agent.id)
    return snapshot?.events ?? []
  } catch {
    // The live read already answered; an unreadable log adds no information.
    return null
  }
}

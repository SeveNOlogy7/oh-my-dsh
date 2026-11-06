/**
 * Resolve the preset a session is actually running.
 *
 * `SessionHeader.agentPreset` is immutable creation metadata: a session starts
 * as `standard`, and the preset the user picks in the picker arrives afterwards
 * as an `agent-preset/selected` event. Reading the header alone therefore
 * reports `standard` for every OMD session, which made the doctor's
 * `active-preset` check warn inside the very presets it was checking.
 *
 * The live session's own events come first, a session whose log is only on disk
 * is read through `sessionQuery`, and the header stays the last resort.
 */
function lastSelected(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'agent-preset/selected') continue
    const preset = event?.data?.agentPreset
    if (typeof preset === 'string' && preset) return preset
  }
  return undefined
}

function liveSession(ctx, agent) {
  try {
    return ctx.get('sessions')?.get?.(agent?.id)
  } catch {
    return undefined
  }
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

export async function resolveActivePreset(ctx, agent) {
  const live = liveSession(ctx, agent)
  const fromLive = lastSelected(ownEventsOf(live))
  if (fromLive) return fromLive

  const readSession = ctx.get('sessionQuery')?.readSession
  if (typeof readSession === 'function') {
    try {
      const snapshot = await readSession(agent?.id)
      const fromLog = lastSelected(snapshot?.events ?? [])
      if (fromLog) return fromLog
    } catch {
      // A session whose log cannot be read still has its header value.
    }
  }
  return live?.header?.agentPreset
}

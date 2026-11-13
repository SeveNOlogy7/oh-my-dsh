import { readJsonSafe, writeJsonAtomic, listFiles } from '../core/atomic.js'
import { omdPath, safeStem } from '../core/paths.js'
import { BOULDER_STATUSES } from '../core/constants.js'

export function boulderSlotPath(workspace, stem) {
  return omdPath(workspace, 'boulder', `${safeStem(stem)}.json`)
}

export function boulderViewPath(workspace) {
  return omdPath(workspace, 'boulder.json')
}

export async function readBoulderSlot(workspace, stem) {
  const read = await readJsonSafe(boulderSlotPath(workspace, stem))
  if (!read.ok) return { ok: false, reason: read.reason }
  return { ok: true, value: read.value, bom: read.bom }
}

export async function writeBoulderSlot(workspace, stem, slot) {
  const next = {
    schema: 1,
    stem: safeStem(stem),
    session_ids: [...new Set(slot.session_ids ?? [])],
    active_plan: slot.active_plan ?? null,
    plan_name: slot.plan_name ?? null,
    status: BOULDER_STATUSES.includes(slot.status) ? slot.status : 'active',
    worktree_path: slot.worktree_path ?? null,
    started_at: slot.started_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: slot.finished_at ?? null,
  }
  await writeJsonAtomic(boulderSlotPath(workspace, stem), next)
  await writeBoulderView(workspace)
  return next
}

export async function createBoulder({ workspace, stem, sessionId, planPath, planName }) {
  const now = new Date().toISOString()
  return writeBoulderSlot(workspace, stem, {
    schema: 1,
    stem: safeStem(stem),
    session_ids: sessionId ? [sessionId] : [],
    active_plan: planPath ?? null,
    plan_name: planName ?? null,
    status: 'active',
    worktree_path: null,
    started_at: now,
    updated_at: now,
    finished_at: null,
  })
}

export async function updateBoulder(workspace, stem, patch) {
  const read = await readBoulderSlot(workspace, stem)
  const base = read.ok ? read.value : { schema: 1, stem: safeStem(stem), session_ids: [] }
  return writeBoulderSlot(workspace, stem, { ...base, ...patch })
}

/**
 * Settle a slot that exists. Returns `null` and writes nothing when this session
 * has no slot at all.
 *
 * `updateBoulder` manufactures a base slot when the file is missing, which is
 * right for a caller that means to start or resume a boulder and wrong for a
 * stop: `/omd-stop-continuation` on a session that never ran `/omd-start-work`
 * used to leave behind `.omd/boulder/<stem>.json` with `status:"paused"` and
 * `active_plan:null` (plus a refreshed derived view), so the board then reported
 * an open paused boulder nobody had created. A missing slot is the normal case
 * for a stop, not a state to invent. Any other read failure (unreadable or
 * corrupt file) keeps the previous behavior: the file already exists, so it is
 * rewritten through `updateBoulder`.
 */
export async function clearBoulder(workspace, stem, status = 'done') {
  const read = await readBoulderSlot(workspace, stem)
  if (!read.ok && read.reason === 'missing') return null
  return updateBoulder(workspace, stem, { status, finished_at: new Date().toISOString() })
}

export async function listBoulderSlots(workspace) {
  const dir = omdPath(workspace, 'boulder')
  const files = await listFiles(dir, (name) => name.endsWith('.json'))
  const slots = []
  for (const file of files) {
    const read = await readJsonSafe(file)
    if (read.ok) slots.push(read.value)
  }
  return slots
}

export async function writeBoulderView(workspace) {
  const slots = await listBoulderSlots(workspace)
  const open = slots.filter((slot) => slot.status === 'active' || slot.status === 'paused')
  const view = {
    source: 'derived',
    note: 'Derived from .omd/boulder/<stem>.json; never a decision source.',
    open_count: open.length,
    open_stems: open.map((slot) => slot.stem),
    corrupt_count: 0,
    active_plan: open[0]?.active_plan ?? null,
    active_goal: null,
    active_team: null,
    status: open.length ? 'active' : 'idle',
    derived_at: new Date().toISOString(),
  }
  await writeJsonAtomic(boulderViewPath(workspace), view)
  return view
}

export async function resolveContinuation({ workspace, stem }) {
  const read = await readBoulderSlot(workspace, stem)
  if (read.ok && read.value.status !== 'done') return read.value
  const slots = await listBoulderSlots(workspace)
  const active = slots.find((slot) => slot.status === 'active')
  return active ?? null
}

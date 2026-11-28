import { continuationText } from './keyword.js'
import { evidenceSteerText } from './ultrawork.js'
import { planDeferred } from '../state/plan.js'

/**
 * The continuation decision, as one pure function.
 *
 * `agent/turn-stopping` used to keep the turn open for every continuable mode
 * except ultrawork, which alone asked whether any work was open. A session left
 * in `hyperplan` after the plan was approved therefore got a nudge on every
 * turn close until the round cap: planning had finished, but nothing looked.
 * The gate is now mode-aware, so each mode answers "is work still open?" with
 * the work it is allowed to do.
 */

/**
 * Planning-only modes. Their prompt forbids implementation ("Do not execute the
 * plan"), so an unchecked task row is EXECUTION work this mode must not do —
 * it can never keep the planning turn open. A postponed plan is likewise not
 * open work for them.
 */
const PLANNING_MODES = new Set(['hyperplan'])

/**
 * Consecutive continuation rounds that executed no tool at all before the loop
 * is called stalled. One text-only reply can be legitimate (a question, a
 * report); two in a row cannot be progress, and further nudges only repeat.
 */
export const MAX_IDLE_ROUNDS = 2

/**
 * Decide whether this turn close should be steered open again.
 *
 * Returns `{ steer: false, reason }` to let the turn close, or
 * `{ steer: true, gate, text }` with the reminder to inject. `reason` is a
 * stable slug (`plan-approved`, `plan-deferred`, `work-complete`, `stalled`)
 * so a ledger line can say why the nudging stopped.
 */
export function continuationDecision(
  state,
  { plan = null, tasks = null, tracked = null, dualEvidence = true, idleRounds = 0 } = {},
) {
  const mode = state?.mode?.mode ?? null
  const hasPlan = Boolean(plan && plan.total > 0)
  const planOpen = hasPlan ? plan.open.length : 0
  const openTasks = tasks?.open ?? 0
  const artifacts = tracked?.artifacts ?? 0

  // An explicit stop outranks every other rule: the owner said this plan does
  // not run now, and a deferred plan used to be nudged open for as many rounds
  // as the cap allowed.
  if (planDeferred(plan)) return { steer: false, reason: 'plan-deferred' }

  let decision
  if (PLANNING_MODES.has(mode)) {
    // Planning is finished once the plan has task rows and is no longer a
    // draft. Anything else — no plan, no rows, still draft — means the mode's
    // own deliverable is missing.
    decision = hasPlan && plan.status !== 'draft'
      ? { steer: false, reason: 'plan-approved' }
      : { steer: true, gate: 'planning', text: continuationText(state, { plan, tasks }) }
  } else {
    // Execution modes (ultrawork, team, hyperplan-ulw) work the plan's open
    // rows: open rows, an open board task, or nothing produced yet keeps the
    // turn open.
    const openWork = planOpen > 0 || openTasks > 0 || (!hasPlan && artifacts === 0)
    if (mode === 'ultrawork') {
      const planComplete = hasPlan && planOpen === 0 && openTasks === 0
      const missingEvidence =
        dualEvidence &&
        (artifacts > 0 || planComplete) &&
        ((tracked?.verification ?? 0) === 0 || tracked.verifiedAt < artifacts)
      if (!openWork && !missingEvidence) decision = { steer: false, reason: 'work-complete' }
      // A completed plan with no deliverables is still a completion claim: it
      // needs a verification run before the turn may close.
      else if (!openWork) decision = { steer: true, gate: 'dual-evidence', text: evidenceSteerText() }
      else decision = { steer: true, gate: 'open-work', text: continuationText(state, { plan, tasks }) }
    } else if (!openWork) {
      decision = { steer: false, reason: 'work-complete' }
    } else {
      decision = { steer: true, gate: 'open-work', text: continuationText(state, { plan, tasks }) }
    }
  }

  if (!decision.steer) return decision
  // A stalled loop is reported even when a gate still wants work: the gate says
  // what is missing, the stall says this model is not going to produce it.
  if (idleRounds >= MAX_IDLE_ROUNDS) return { steer: false, reason: 'stalled' }
  return decision
}

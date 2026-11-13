import fs from 'node:fs'
import path from 'node:path'
import { parsePlan } from '../state/plan.js'
import { isInside, safeStem } from '../core/paths.js'

/**
 * The three ultrawork gates that used to be prompt-only.
 *
 * `ultrawork.requirePlanGate`, `ultrawork.requireBaseline`, and
 * `ultrawork.dualEvidence` are read here and nowhere else. The tool guard is a
 * monotonic SYNCHRONOUS hook, so the plan lookup below uses sync filesystem
 * calls: a guard cannot await, and a plan directory holds a handful of small
 * files.
 */

/** A command that establishes or re-runs the project's own verification. */
const VERIFICATION =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|typecheck|build)\b|\bnode\s+--test\b|\bnode\s+scripts[\\/]check[\w-]*\.mjs\b|\b(?:pytest|tox|nox)\b|\bgo\s+test\b|\bcargo\s+(?:test|check)\b|\bdotnet\s+test\b|\bmvn\s+(?:test|verify)\b|\bgradle\w*\s+(?:test|check)\b|\bmake\s+(?:test|check)\b/i

/** Whether a shell command line is a project verification command. */
export function isVerificationCommand(command) {
  if (typeof command !== 'string') return false
  // Commands arrive with shell quoting and often an absolute node path
  // (`& 'C:\…\node.exe' --test tests/`), which a bare `\bnode\s+` cannot match.
  const normalized = command.replace(/["']/g, ' ').replace(/node\.exe\b/gi, 'node')
  return VERIFICATION.test(normalized)
}

/** Flatten the shapes a DSH tool result can take into one text blob. */
export function resultText(result) {
  if (result == null) return ''
  if (typeof result === 'string') return result
  const parts = []
  if (Array.isArray(result.content)) {
    for (const block of result.content) if (typeof block?.text === 'string') parts.push(block.text)
  }
  if (typeof result.text === 'string') parts.push(result.text)
  if (typeof result.output === 'string') parts.push(result.output)
  if (parts.length) return parts.join('\n')
  try {
    return JSON.stringify(result)
  } catch {
    return ''
  }
}

/**
 * Output markers DSH appends when a command did not complete normally. A
 * timed-out or signal-killed run is a SUCCESSFUL tool call with `[exit code:
 * null]` or no exit-code marker at all, so `isError` alone would count it as
 * evidence that never verified anything. The markers are line-anchored: a
 * command that merely prints the text `[exit code: 1]` is not a failure.
 */
const FAILURE_MARKERS = [
  /^\s*\[exit code: (?:null|[1-9]\d*)\]\s*$/m,
  /^\s*\[timed out\b[^\]]*\]\s*$/m,
  /^\s*\[killed by signal:[^\]]*\]\s*$/m,
  /^\s*\[stopped\b[^\]]*\]\s*$/m,
]

/**
 * Whether a tool result records a failed command. DSH reports a non-zero shell
 * exit as an `[exit code: N]` marker on an otherwise successful tool call, so
 * `isError` alone would count a failing test run as passing evidence.
 */
export function resultFailed(result) {
  if (result == null) return false
  if (result.isError === true) return true
  const text = resultText(result)
  return FAILURE_MARKERS.some((marker) => marker.test(text))
}

/**
 * A deliverable file is inside the workspace but outside `.omd/`. Everything
 * under `.omd/` is bookkeeping (plans, notepads, scratch, evidence), so the
 * gates must never block it.
 */
export function isDeliverableFile(workspace, file) {
  if (!workspace || typeof file !== 'string' || file === '') return false
  const absolute = path.isAbsolute(file) ? file : path.resolve(workspace, file)
  if (!isInside(workspace, absolute)) return false
  return !isInside(path.join(workspace, '.omd'), absolute)
}

/** Resolve the boulder's active plan path the way `readPlan` resolves a slug. */
function boulderPlanFile(workspace, stem) {
  if (!stem) return null
  const slot = path.join(workspace, '.omd', 'boulder', `${safeStem(stem)}.json`)
  let value
  try {
    value = JSON.parse(fs.readFileSync(slot, 'utf8'))
  } catch {
    return null
  }
  const plan = value?.active_plan
  if (typeof plan !== 'string' || plan === '') return null
  return path.isAbsolute(plan) ? plan : path.join(workspace, '.omd', 'plans', `${safeStem(plan)}.md`)
}

/**
 * The plan that can satisfy the plan gate: at least one task row, a status other
 * than `draft`, and either the boulder's explicit active plan or a file written
 * or updated after this ultrawork run started. A plan left over from an earlier
 * session must not unlock a new run. Returns the parsed plan, or null.
 */
export function qualifyingPlan(workspace, { stem = null, since = null } = {}) {
  const parsedSince = Date.parse(since)
  const sinceMs = Number.isFinite(parsedSince) ? parsedSince : 0
  const explicit = boulderPlanFile(workspace, stem)
  const dir = path.join(workspace, '.omd', 'plans')
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    names = []
  }
  const files = new Set()
  if (explicit) files.add(path.resolve(explicit))
  for (const name of names) {
    if (name.endsWith('.md')) files.add(path.join(dir, name))
  }
  let best = null
  for (const file of files) {
    let text
    let mtime
    try {
      text = fs.readFileSync(file, 'utf8')
      mtime = fs.statSync(file).mtimeMs
    } catch {
      continue
    }
    let doc
    try {
      doc = parsePlan(text, file)
    } catch {
      continue
    }
    if (doc.tasks.length === 0 || doc.status === 'draft') continue
    const isExplicit = explicit !== null && path.resolve(file) === path.resolve(explicit)
    if (!isExplicit && sinceMs > 0 && mtime < sinceMs) continue
    if (!best || mtime > best.mtime) best = { doc, mtime }
  }
  return best?.doc ?? null
}

/** The refusal text for a deliverable write with no qualifying plan, or null. */
export function planGateReason(workspace, file, options = {}) {
  if (!isDeliverableFile(workspace, file)) return null
  if (qualifyingPlan(workspace, options)) return null
  return 'OMD ultrawork plan gate: write .omd/plans/<slug>.md with a task list and a non-draft status before editing deliverable files (or set ultrawork.requirePlanGate: false). A plan from before this ultrawork run does not count; the boulder active plan does. Files under .omd/ are exempt.'
}

/** The refusal text for the first deliverable write before a baseline run, or null. */
export function baselineGateReason(workspace, file, commands) {
  if (!isDeliverableFile(workspace, file)) return null
  const configured = Array.isArray(commands)
    ? commands
        .map((entry) => [entry?.command, ...(Array.isArray(entry?.args) ? entry.args : [])].filter(Boolean).join(' '))
        .filter(Boolean)
    : []
  const hint = configured.length ? configured.join('; ') : "the project's test/check command (for example npm test)"
  return `OMD ultrawork baseline gate: run ${hint} once before the first deliverable edit (or set ultrawork.requireBaseline: false).`
}

/** The turn-stopping steer when the work is done but no verification was recorded. */
export function evidenceSteerText() {
  return "[OMD DUAL EVIDENCE] The work looks complete but no successful verification run has been recorded this ultrawork run. Run the project's verification command (for example npm test / npm run check), keep the command, its output, and its exit status, and record the real artifact (file, screenshot, or transcript) before closing. If the project has no verification command, set ultrawork.dualEvidence: false."
}

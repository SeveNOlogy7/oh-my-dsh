const FENCED = /```[\s\S]*?```/g
const INLINE = /`[^`\n]*`/g

/**
 * A mode keyword only counts as a directive, never as a mention. The old
 * detector matched the word anywhere, so "检查 ultrawork 模式" or "please use
 * team review" silently switched the session's mode and started continuation
 * rounds. The directive forms are:
 *
 *   ulw fix the parser            ultrawork: fix the parser
 *   [ultrawork] fix the parser    /ulw fix the parser
 *   team review this              [team] review this
 *   hyperplan-ulw: ...            hpp: ...
 */
const DIRECTIVE = /^(?:\[(hyperplan-ulw|ultrawork|ulw|team|hyperplan|hpp)\]|\/?(hyperplan-ulw|ultrawork|ulw|team|hyperplan|hpp)(?=$|[:\s]))/i

/** Remove code examples so a keyword inside code does not trigger a mode. */
export function stripCode(text) {
  return String(text ?? '')
    .replace(FENCED, ' ')
    .replace(INLINE, ' ')
}

/**
 * Detect the OmO 4.19.4 keyword set in directive position. `mass ulw` is a 5.x
 * tagline and is not recognized by this 4.19.4-aligned implementation.
 */
export function detectMode(text, keywords = {}) {
  const clean = stripCode(text).trimStart()
  const match = DIRECTIVE.exec(clean)
  if (!match) return null
  const word = (match[1] ?? match[2]).toLowerCase()
  const allowed = (key) => keywords[key] !== false
  if (word === 'hyperplan-ulw') return allowed('hyperplan') && allowed('ultrawork') ? 'hyperplan-ulw' : null
  if (word === 'ultrawork' || word === 'ulw') return allowed('ultrawork') ? 'ultrawork' : null
  if (word === 'hyperplan' || word === 'hpp') return allowed('hyperplan') ? 'hyperplan' : null
  if (word === 'team') return allowed('team') ? 'team' : null
  return null
}

export function continuationText(state, { plan = null, tasks = null } = {}) {
  const lines = ['[OMD CONTINUATION] The turn is about to close but orchestration work is still open.']
  if (state.mode?.mode) lines.push(`mode: ${state.mode.mode}`)
  if (plan) lines.push(`plan: ${plan.title} (${plan.checked}/${plan.total})`)
  if (tasks?.open) lines.push(`tasks: ${tasks.open} open`)
  lines.push(
    'Continue with the next concrete step. If the work is actually complete, mark the plan/task done and show the evidence. Do not stop while an item is in progress.',
  )
  return lines.join('\n')
}

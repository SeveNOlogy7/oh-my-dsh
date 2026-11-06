const FENCED = /```[\s\S]*?```/g
const INLINE = /`[^`\n]*`/g

/** Remove code examples so a keyword inside code does not trigger a mode. */
export function stripCode(text) {
  return String(text ?? '')
    .replace(FENCED, ' ')
    .replace(INLINE, ' ')
}

/**
 * Detect the OmO 4.19.4 keyword set. `mass ulw` is a 5.x tagline and is not
 * recognized by this 4.19.4-aligned implementation.
 */
export function detectMode(text, keywords = {}) {
  const clean = stripCode(text).toLowerCase()
  const ultrawork = keywords.ultrawork !== false && /\b(ultrawork|ulw)\b/.test(clean)
  const hyperplan = keywords.hyperplan !== false && /\b(hyperplan|hpp)\b/.test(clean)
  const team = keywords.team !== false && /\bteam\b/.test(clean)
  if (hyperplan && ultrawork) return 'hyperplan-ulw'
  if (hyperplan) return 'hyperplan'
  if (ultrawork) return 'ultrawork'
  if (team) return 'team'
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

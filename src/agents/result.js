/** Extract the last fenced JSON object that looks like an OMD result. */
export function parseResultBlock(text) {
  const source = String(text ?? '')
  const blocks = []
  const fence = /```(?:json|omd-result|omd_result)?\s*\n?([\s\S]*?)```/gi
  let match
  while ((match = fence.exec(source))) blocks.push(match[1])
  const candidates = [...blocks, source]
  for (const candidate of candidates.reverse()) {
    const parsed = tryJson(candidate)
    if (parsed && typeof parsed === 'object') return parsed
  }
  return null
}

function tryJson(text) {
  const trimmed = String(text).trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    // try the outer object only
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

export function parseDoneClaim(text) {
  const value = parseResultBlock(text)
  if (!value) return null
  if (value.task || value.changed_files || value.tests) {
    return {
      task: value.task ?? null,
      changed_files: Array.isArray(value.changed_files) ? value.changed_files : [],
      tests: Array.isArray(value.tests) ? value.tests : [],
      manual_qa: value.manual_qa ?? null,
      cleanup: value.cleanup ?? null,
      risks: Array.isArray(value.risks) ? value.risks : [],
    }
  }
  return null
}

export function parseVerdict(text) {
  const value = parseResultBlock(text)
  if (!value) return null
  if (['confirmed', 'false-positive', 'needs-fix', 'needs-human-review'].includes(value.verdict)) {
    return {
      verdict: value.verdict,
      evidence: Array.isArray(value.evidence) ? value.evidence : [],
      repro: value.repro ?? null,
      confidence: value.confidence ?? null,
    }
  }
  return null
}

export function hasEvidence(text) {
  const value = parseResultBlock(text)
  if (!value) return false
  if (Array.isArray(value.tests) && value.tests.length) return true
  if (Array.isArray(value.evidence) && value.evidence.length) return true
  if (Array.isArray(value.changed_files) && value.changed_files.length) return true
  return false
}

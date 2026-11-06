/**
 * Small JSONC reader: strips // and block comments plus trailing commas while
 * preserving string contents, then delegates to JSON.parse.
 */
export function parseJsonc(text, source = '<jsonc>') {
  const input = String(text).replace(/^\uFEFF/, '')
  const stripped = stripComments(input)
  const normalized = stripTrailingCommas(stripped)
  try {
    return JSON.parse(normalized)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid JSONC in ${source}: ${detail}`)
  }
}

export function stripComments(text) {
  let out = ''
  let index = 0
  let inString = false
  let quote = ''
  let escaped = false
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) inString = false
      index += 1
      continue
    }
    if (char === '"' || char === "'") {
      inString = true
      quote = char
      out += char
      index += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    out += char
    index += 1
  }
  return out
}

export function stripTrailingCommas(text) {
  let out = ''
  let index = 0
  let inString = false
  let escaped = false
  while (index < text.length) {
    const char = text[index]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      index += 1
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      index += 1
      continue
    }
    if (char === ',') {
      let look = index + 1
      while (look < text.length && /\s/.test(text[look])) look += 1
      if (text[look] === '}' || text[look] === ']') {
        index += 1
        continue
      }
    }
    out += char
    index += 1
  }
  return out
}

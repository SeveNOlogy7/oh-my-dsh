/** Convert a glob pattern into an anchored RegExp. */
export function globToRegExp(pattern) {
  const source = String(pattern)
  let out = ''
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '*') {
      if (source[index + 1] === '*') {
        if (source[index + 2] === '/') {
          out += '(?:.*/)?'
          index += 3
          continue
        }
        out += '.*'
        index += 2
        continue
      }
      out += '[^/]*'
      index += 1
      continue
    }
    if (char === '?') {
      out += '[^/]'
      index += 1
      continue
    }
    if (char === '{') {
      const end = source.indexOf('}', index + 1)
      if (end > index) {
        const options = source
          .slice(index + 1, end)
          .split(',')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        out += `(?:${options.join('|')})`
        index = end + 1
        continue
      }
    }
    if (char === '[') {
      const end = source.indexOf(']', index + 1)
      if (end > index) {
        out += source.slice(index, end + 1)
        index = end + 1
        continue
      }
    }
    out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    index += 1
  }
  return new RegExp(`^${out}$`)
}

export function matchGlob(pattern, filePath) {
  const normalized = String(filePath).replace(/\\/g, '/').replace(/^\.\//, '')
  const candidates = [normalized]
  if (!String(pattern).includes('/')) candidates.push(normalized.split('/').pop() ?? normalized)
  const regex = globToRegExp(String(pattern).replace(/\\/g, '/'))
  return candidates.some((candidate) => regex.test(candidate))
}

export function matchesAny(patterns, filePath) {
  return (patterns ?? []).some((pattern) => matchGlob(pattern, filePath))
}

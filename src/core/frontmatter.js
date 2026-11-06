/** Parse a small YAML frontmatter block without a YAML dependency. */
export function parseFrontmatter(text) {
  const source = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!source.startsWith('---')) return { data: {}, body: source, hasFrontmatter: false }
  const end = source.indexOf('\n---', 3)
  if (end < 0) return { data: {}, body: source, hasFrontmatter: false }
  const header = source.slice(3, end).replace(/^\n/, '')
  const body = source.slice(end + 4).replace(/^\n/, '')
  return { data: parseYamlLite(header), body, hasFrontmatter: true }
}

export function parseYamlLite(text) {
  const data = {}
  const lines = String(text).split('\n')
  let index = 0
  while (index < lines.length) {
    const raw = lines[index]
    if (!raw.trim() || raw.trim().startsWith('#')) {
      index += 1
      continue
    }
    const match = /^([A-Za-z0-9_.-]+):(.*)$/.exec(raw)
    if (!match) {
      index += 1
      continue
    }
    const key = match[1]
    let rest = match[2].trim()
    if (rest === '') {
      const items = []
      let look = index + 1
      while (look < lines.length) {
        const line = lines[look]
        const item = /^\s*-\s*(.*)$/.exec(line)
        if (!item) break
        items.push(parseScalar(item[1]))
        look += 1
      }
      if (items.length) {
        data[key] = items
        index = look
        continue
      }
      data[key] = ''
      index += 1
      continue
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      data[key] = rest
        .slice(1, -1)
        .split(',')
        .map((part) => parseScalar(part))
        .filter((part) => part !== '')
    } else {
      data[key] = parseScalar(rest)
    }
    index += 1
  }
  return data
}

export function parseScalar(value) {
  let text = String(value).trim()
  if (!text) return ''
  const hash = text.indexOf(' #')
  if (hash >= 0 && !text.startsWith('"') && !text.startsWith("'")) text = text.slice(0, hash).trim()
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1)
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10)
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text)
  return text
}

/** Build a frontmatter block from flat scalar values. */
export function renderFrontmatter(data) {
  const lines = ['---']
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) lines.push(`${key}: [${value.map((v) => JSON.stringify(String(v))).join(', ')}]`)
    else lines.push(`${key}: ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

/**
 * Comment- and trailing-comma-preserving edits to a JSONC document.
 *
 * `src/core/jsonc.js` can READ JSONC, but a write through `JSON.stringify`
 * would delete every comment and every trailing comma in `.omd/config.jsonc` —
 * the shipped template is commented on purpose, and the project treats the
 * file as the human-readable configuration surface. This module therefore
 * locates the exact source span of the values being replaced and splices only
 * those spans, so untouched text (comments, blank lines, key order, trailing
 * commas) survives byte for byte.
 *
 * The scanner is deliberately small: it understands objects, arrays, strings
 * with escapes, numbers/literals, `//` and block comments, and trailing commas.
 * Anything it cannot parse returns `null`, and the caller falls back to
 * rewriting the whole document.
 */
import { stripComments } from '../core/jsonc.js'

const TRIVIA = new Set([' ', '\t', '\n', '\r'])

class Scanner {
  constructor(text) {
    this.text = text
    this.at = 0
  }

  skipTrivia() {
    const text = this.text
    while (this.at < text.length) {
      const char = text[this.at]
      if (TRIVIA.has(char)) {
        this.at += 1
        continue
      }
      if (char === '/' && text[this.at + 1] === '/') {
        while (this.at < text.length && text[this.at] !== '\n') this.at += 1
        continue
      }
      if (char === '/' && text[this.at + 1] === '*') {
        this.at += 2
        while (this.at < text.length && !(text[this.at] === '*' && text[this.at + 1] === '/')) this.at += 1
        this.at += 2
        continue
      }
      break
    }
  }

  parseValue() {
    this.skipTrivia()
    const char = this.text[this.at]
    if (char === '{') return this.parseObject()
    if (char === '[') return this.parseArray()
    if (char === '"') {
      const parsed = this.parseString()
      return { kind: 'scalar', start: parsed.start, end: parsed.end, value: parsed.value }
    }
    return this.parseLiteral()
  }

  parseString() {
    const start = this.at
    this.at += 1
    while (this.at < this.text.length) {
      const char = this.text[this.at]
      if (char === '\\') {
        this.at += 2
        continue
      }
      if (char === '"') {
        this.at += 1
        return { value: JSON.parse(this.text.slice(start, this.at)), start, end: this.at }
      }
      this.at += 1
    }
    throw new Error('unterminated string')
  }

  parseLiteral() {
    const start = this.at
    while (this.at < this.text.length && !/[\s,}\]]/.test(this.text[this.at])) this.at += 1
    const raw = this.text.slice(start, this.at)
    if (!/^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(raw)) throw new Error(`unexpected token ${JSON.stringify(raw)}`)
    return { kind: 'scalar', start, end: this.at, value: raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : Number(raw) }
  }

  parseObject() {
    const start = this.at
    this.at += 1
    const entries = new Map()
    while (true) {
      this.skipTrivia()
      if (this.text[this.at] === '}') {
        const closeStart = this.at
        this.at += 1
        return { kind: 'object', start, end: this.at, closeStart, entries }
      }
      if (entries.size > 0 && this.text[this.at] !== '"') throw new Error('expected a key')
      const keyStart = this.at
      const key = this.parseString()
      const keyEnd = key.end
      this.skipTrivia()
      if (this.text[this.at] !== ':') throw new Error('expected ":"')
      this.at += 1
      const node = this.parseValue()
      entries.set(key.value, { key: key.value, keyStart, keyEnd, valueStart: node.start, valueEnd: node.end, node })
      this.skipTrivia()
      if (this.text[this.at] === ',') {
        this.at += 1
        continue
      }
      if (this.text[this.at] === '}') {
        const closeStart = this.at
        this.at += 1
        return { kind: 'object', start, end: this.at, closeStart, entries }
      }
      throw new Error('expected "," or "}"')
    }
  }

  parseArray() {
    const start = this.at
    this.at += 1
    const items = []
    while (true) {
      this.skipTrivia()
      if (this.text[this.at] === ']') {
        const closeStart = this.at
        this.at += 1
        return { kind: 'array', start, end: this.at, closeStart, items }
      }
      const node = this.parseValue()
      items.push({ start: node.start, end: node.end, node })
      this.skipTrivia()
      if (this.text[this.at] === ',') {
        this.at += 1
        continue
      }
      if (this.text[this.at] === ']') {
        const closeStart = this.at
        this.at += 1
        return { kind: 'array', start, end: this.at, closeStart, items }
      }
      throw new Error('expected "," or "]"')
    }
  }
}

/** Scan one JSONC document into a span-carrying tree; throws on malformed input. */
export function scanJsonc(text) {
  const scanner = new Scanner(String(text).replace(/^\uFEFF/, ''))
  const root = scanner.parseValue()
  scanner.skipTrivia()
  if (scanner.at !== scanner.text.length) throw new Error('trailing content after the root value')
  return root
}

/** Leading whitespace of the line containing `index`. */
function lineIndent(source, index) {
  const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  const match = /^[ \t]*/.exec(source.slice(lineStart, index))
  return match === null ? '' : match[0]
}

/** Serialize a value with every line after the first aligned to `indent`. */
function serializeValue(value, indent) {
  const json = JSON.stringify(value, null, 2)
  if (json === undefined) throw new Error('cannot serialize an undefined value')
  return indent === '' ? json : json.split('\n').join(`\n${indent}`)
}

/** Entry whose value ends last in the source, which is where a new key goes. */
function lastEntry(node) {
  let last = null
  for (const entry of node.entries.values()) {
    if (last === null || entry.valueEnd > last.valueEnd) last = entry
  }
  return last
}

function insertionEdit(source, node, entries) {
  if (node.kind !== 'object' || entries.length === 0) return null
  const closeIndent = lineIndent(source, node.start)
  if (node.entries.size === 0) {
    const inner = `${closeIndent}  `
    const body = entries.map((entry) => `${inner}${JSON.stringify(entry.key)}: ${serializeValue(entry.value, inner)}`).join(',\n')
    return { start: node.start + 1, end: node.start + 1, text: `\n${body}\n${closeIndent}` }
  }
  const last = lastEntry(node)
  const between = stripComments(source.slice(last.valueEnd, node.closeStart))
  const comma = between.indexOf(',')
  const hasComma = comma !== -1
  const keyIndent = lineIndent(source, last.keyStart)
  const start = hasComma ? last.valueEnd + comma + 1 : last.valueEnd
  const body = entries.map((entry) => `${keyIndent}${JSON.stringify(entry.key)}: ${serializeValue(entry.value, keyIndent)}`).join(',\n')
  return { start, end: start, text: `${hasComma ? '' : ','}\n${body}` }
}

/** Deep-merge the update list into one patch document, last value winning. */
function mergeUpdates(updates) {
  const doc = {}
  for (const update of updates) {
    const path = (Array.isArray(update.path) ? update.path : []).map((segment) => String(segment))
    if (path.length === 0) throw new Error('an update path must not be empty')
    let target = doc
    for (const segment of path.slice(0, -1)) {
      const child = target[segment]
      if (child === null || typeof child !== 'object' || Array.isArray(child)) target[segment] = {}
      target = target[segment]
    }
    target[path[path.length - 1]] = update.value
  }
  return doc
}

function isObjectLike(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Plan edits by walking the patch document against the source tree, so several
 * new keys in one object become one insertion (with the commas between them)
 * instead of overlapping splices.
 */
function planNode(source, node, patch, replacements, insertions) {
  if (node.kind !== 'object') return false
  for (const [key, value] of Object.entries(patch)) {
    const entry = node.entries.get(key)
    if (entry !== undefined && entry.node.kind === 'object' && isObjectLike(value) && Object.keys(value).length > 0) {
      if (!planNode(source, entry.node, value, replacements, insertions)) return false
      continue
    }
    if (entry !== undefined) {
      replacements.push({ start: entry.valueStart, end: entry.valueEnd, text: serializeValue(value, lineIndent(source, entry.valueStart)) })
      continue
    }
    let bucket = insertions.get(node)
    if (bucket === undefined) {
      bucket = []
      insertions.set(node, bucket)
    }
    bucket.push({ key, value })
  }
  return true
}

function overlaps(left, right) {
  const zeroLength = left.start === left.end || right.start === right.end
  if (zeroLength) return left.start > right.start && left.start < right.end
  return left.start < right.end && right.start < left.end
}

/**
 * Splice value replacements into a JSONC document.
 * @param text - source document (a BOM is dropped).
 * @param updates - `[{path: string[], value: unknown}]`; paths address object keys.
 * @returns `{text, mode:'patch'}` or `null` when the document cannot be patched
 *   confidently, in which case the caller rewrites the whole document.
 */
export function applyPathUpdates(text, updates) {
  const source = String(text).replace(/^\uFEFF/, '')
  try {
    if (!Array.isArray(updates) || updates.length === 0) return { text: source, mode: 'patch' }
    const root = scanJsonc(source)
    if (root.kind !== 'object') return null
    const replacements = []
    const insertions = new Map()
    if (!planNode(source, root, mergeUpdates(updates), replacements, insertions)) return null
    const edits = [...replacements]
    for (const [node, entries] of insertions) {
      const edit = insertionEdit(source, node, entries)
      if (edit === null) return null
      edits.push(edit)
    }
    for (let index = 0; index < edits.length; index += 1) {
      for (let other = index + 1; other < edits.length; other += 1) {
        if (overlaps(edits[index], edits[other])) return null
      }
    }
    let out = source
    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
    }
    return { text: out, mode: 'patch' }
  } catch {
    return null
  }
}

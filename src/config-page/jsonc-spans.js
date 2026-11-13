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
 * Two operations share the scanner:
 * - `applyPathUpdates` replaces (or inserts) the value at a key path.
 * - `applyPathRemovals` DELETES the member at a key path, and prunes a parent
 *   object that the removal left empty — never the document root. Deleting a
 *   member is not expressible as a value update: the whole `"key": value` text
 *   plus exactly one separating comma has to go, and which comma is "the"
 *   separator depends on whether the member is first, last, or alone. That is
 *   why the scanner records the source order of every member and the position
 *   of the comma after it.
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
    // Source order, kept apart from `entries` (a lookup map): it answers "which
    // member is last in the file" and "did these removals empty this object",
    // and `order.length !== entries.size` is exactly the duplicate-key case a
    // removal cannot be spliced confidently.
    const order = []
    while (true) {
      this.skipTrivia()
      if (this.text[this.at] === '}') {
        const closeStart = this.at
        this.at += 1
        return { kind: 'object', start, end: this.at, closeStart, entries, order, duplicate: order.length !== entries.size }
      }
      if (order.length > 0 && this.text[this.at] !== '"') throw new Error('expected a key')
      const keyStart = this.at
      const key = this.parseString()
      const keyEnd = key.end
      this.skipTrivia()
      if (this.text[this.at] !== ':') throw new Error('expected ":"')
      this.at += 1
      const node = this.parseValue()
      const entry = { key: key.value, keyStart, keyEnd, valueStart: node.start, valueEnd: node.end, node, commaStart: -1, commaEnd: -1 }
      order.push(entry)
      entries.set(key.value, entry)
      this.skipTrivia()
      if (this.text[this.at] === ',') {
        entry.commaStart = this.at
        this.at += 1
        entry.commaEnd = this.at
        continue
      }
      if (this.text[this.at] === '}') {
        const closeStart = this.at
        this.at += 1
        return { kind: 'object', start, end: this.at, closeStart, entries, order, duplicate: order.length !== entries.size }
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

/** Index of the first character of the line containing `index`. */
function startOfLine(source, index) {
  return source.lastIndexOf('\n', Math.max(0, index - 1)) + 1
}

/** Leading whitespace of the line containing `index`. */
function lineIndent(source, index) {
  const match = /^[ \t]*/.exec(source.slice(startOfLine(source, index), index))
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

/**
 * End of a deleted member's line, when everything from `from` to the end of that
 * line is trailing trivia.
 *
 * A `// note` written after a member belongs to that member, so it leaves with
 * it; and when the rest of the line is only whitespace the line break goes too,
 * so a removal does not leave a blank line behind. A sibling member or a closing
 * brace on the same line stops the extension, so an inline document keeps its
 * neighbours and only loses the member plus the whitespace between them.
 */
function consumeLineTail(source, from) {
  let at = from
  while (at < source.length && (source[at] === ' ' || source[at] === '\t')) at += 1
  let consumed = false
  if (source[at] === '/' && source[at + 1] === '/') {
    while (at < source.length && source[at] !== '\n') at += 1
    consumed = true
  } else if (source[at] === '/' && source[at + 1] === '*') {
    at += 2
    while (at < source.length && !(source[at] === '*' && source[at + 1] === '/')) at += 1
    at = Math.min(at + 2, source.length)
    while (at < source.length && (source[at] === ' ' || source[at] === '\t')) at += 1
    consumed = true
  }
  if (at < source.length && source[at] === '\r') at += 1
  if (at < source.length && source[at] === '\n') {
    at += 1
    consumed = true
  }
  return consumed ? at : from
}

/**
 * Map every member to its containing object and every object to the member that
 * holds it, so a removal can walk back up to prune an emptied parent.
 */
function indexTree(node, parents, holders) {
  if (node.kind === 'object') {
    for (const entry of node.order) {
      parents.set(entry, node)
      if (entry.node.kind === 'object') holders.set(entry.node, entry)
      indexTree(entry.node, parents, holders)
    }
  } else if (node.kind === 'array') {
    for (const item of node.items) indexTree(item.node, parents, holders)
  }
}

/**
 * The member a key path names, or `null` when the path is not in this document.
 * Throws when an object on the way repeats a key: the parsed value names one
 * member where the text has two, so the span is undecidable and the caller falls
 * back to the whole-document rewrite.
 */
function resolveEntry(root, path) {
  let node = root
  for (let index = 0; index < path.length; index += 1) {
    // A duplicate key names two members, so which one to delete is undecidable
    // from the parsed value; the caller rewrites the document instead.
    if (node.duplicate) throw new Error(`the document repeats a key inside ${JSON.stringify(path.slice(0, index)) || '{}'}`)
    if (node.kind !== 'object') return null
    const entry = node.entries.get(path[index])
    if (entry === undefined) return null
    if (index === path.length - 1) return entry
    node = entry.node
  }
  return null
}

/**
 * The one or two splices that delete one member.
 *
 * A member followed by a comma is deleted from its own indentation through that
 * comma, so the surviving members keep one separating comma each. The last
 * member has no comma of its own, so the comma BEFORE it is removed as a second
 * edit: a single range from the comma to the value would also swallow whatever
 * the previous member's line carries after that comma (its own trailing
 * comment), which is text the removal must not touch.
 */
function removalEdits(source, parent, entry) {
  const position = parent.order.indexOf(entry)
  if (position === -1) return null
  const ownLine = /^[ \t]*$/.test(source.slice(startOfLine(source, entry.keyStart), entry.keyStart))
  const start = ownLine ? startOfLine(source, entry.keyStart) : entry.keyStart
  if (entry.commaEnd > 0) return [{ start, end: consumeLineTail(source, entry.commaEnd), text: '' }]
  const edits = [{ start, end: consumeLineTail(source, entry.valueEnd), text: '' }]
  const before = parent.order[position - 1]
  if (before !== undefined && before.commaStart >= 0) edits.push({ start: before.commaStart, end: before.commaEnd, text: '' })
  return edits
}

/** Every splice that removes `paths` and prunes what they empty; `null` if unsure. */
function planRemovals(source, root, paths) {
  const parents = new Map()
  const holders = new Map()
  indexTree(root, parents, holders)

  const removed = new Set()
  for (const path of paths) {
    const entry = resolveEntry(root, path)
    if (entry !== null) removed.add(entry)
  }
  if (removed.size === 0) return []

  // An object the request emptied is pruned as a whole: deleting its members one
  // by one would leave `{}` behind and delete the same comma from both sides.
  // Collapsing can empty the next object up, so it runs to a fixed point.
  let sweepRoot = false
  let collapsed = true
  while (collapsed) {
    collapsed = false
    const byParent = new Map()
    for (const entry of removed) {
      const parent = parents.get(entry)
      if (parent === undefined) return null
      if (parent.duplicate) throw new Error('a parent object repeats a key')
      const list = byParent.get(parent) ?? []
      list.push(entry)
      byParent.set(parent, list)
    }
    for (const [parent, list] of byParent) {
      if (list.length !== parent.order.length) continue
      for (const entry of list) removed.delete(entry)
      if (parent === root) {
        // The document root is never pruned: the file must keep being an object.
        sweepRoot = true
      } else {
        const holder = holders.get(parent)
        if (holder === undefined) return null
        removed.add(holder)
      }
      collapsed = true
    }
  }

  if (sweepRoot) {
    // Every top-level member is going: one range from the first member's
    // indentation to the last member's line, which keeps any header comment
    // written above the first member.
    const first = root.order[0]
    const last = root.order[root.order.length - 1]
    const ownLine = /^[ \t]*$/.test(source.slice(startOfLine(source, first.keyStart), first.keyStart))
    const start = ownLine ? startOfLine(source, first.keyStart) : first.keyStart
    const lastEnd = last.commaEnd > 0 ? last.commaEnd : last.valueEnd
    return [{ start, end: consumeLineTail(source, lastEnd), text: '' }]
  }

  const edits = []
  for (const entry of removed) {
    const parent = parents.get(entry)
    if (parent === undefined) return null
    const own = removalEdits(source, parent, entry)
    if (own === null) return null
    edits.push(...own)
  }
  for (let index = 0; index < edits.length; index += 1) {
    for (let other = index + 1; other < edits.length; other += 1) {
      if (overlaps(edits[index], edits[other])) return null
    }
  }
  return edits
}

/**
 * Drop the paths a longer path is nested under (and exact duplicates): removing
 * `a` removes `a.b` too, so keeping both would splice away the same text twice
 * and report a removal that no longer has anything to remove.
 * @param paths - `string[][]`.
 * @returns the paths that are not implied by another one, in order.
 */
export function dropNestedPaths(paths) {
  return paths.filter((path, index) =>
    !paths.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.length <= path.length &&
        other.every((segment, at) => segment === path[at]) &&
        // Equal-length duplicates are the same path twice: keep the first.
        (other.length < path.length || otherIndex < index),
    ),
  )
}

/**
 * Splice key removals into a JSONC document.
 * @param text - source document (a BOM is dropped).
 * @param paths - `string[][]`; each path addresses object keys, and a path that
 *   is not in the document is ignored (it may be inherited from another layer).
 * @returns `{text, mode:'patch'}` or `null` when the document cannot be edited
 *   confidently, in which case the caller rewrites the whole document.
 */
export function applyPathRemovals(text, paths) {
  const source = String(text).replace(/^\uFEFF/, '')
  try {
    const wanted = dropNestedPaths(
      (Array.isArray(paths) ? paths : [])
        .filter((path) => Array.isArray(path) && path.length > 0)
        .map((path) => path.map((segment) => String(segment))),
    )
    if (wanted.length === 0) return { text: source, mode: 'patch' }
    const root = scanJsonc(source)
    if (root.kind !== 'object') return null
    const edits = planRemovals(source, root, wanted)
    if (edits === null) return null
    let out = source
    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
    }
    return { text: out, mode: 'patch' }
  } catch {
    return null
  }
}

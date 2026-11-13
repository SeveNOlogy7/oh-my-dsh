/**
 * Read and write one workspace's `.omd/config.jsonc` for the OMD settings page.
 *
 * The page cannot touch the filesystem: it runs in the browser. Everything in
 * this module runs on the Host inside the `/omd-config` command, which the
 * profile-level OMD runtime row registers per agent, so the workspace is the
 * session's own working directory and needs no discovery.
 *
 * Contract used by the page (see `src/commands/index.js`):
 * - `read()` returns the effective configuration, every contributing layer with
 *   the top-level keys it sets, the parse diagnostics, and the file's own raw
 *   object. `src/core/defaults.js` holds the defaults, which the page shows as
 *   the inherited value of a key that no layer sets.
 * - `write(patch, unset)` merges one partial patch and deletes the `unset` key
 *   paths, rejects invalid results with the schema validator's own message, and
 *   splices both changes into the file text so comments and trailing commas
 *   survive. A removal only ever addresses the workspace file: a key inherited
 *   from a user or ancestor layer is not this page's to delete, and removing the
 *   file's own value is exactly what makes the inherited one apply again.
 *   The file is written without a BOM.
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { readTextSafe, writeTextAtomic } from '../core/atomic.js'
import { loadConfig, clone, isPlainObject, mergeDeep } from '../core/config.js'
import { parseJsonc } from '../core/jsonc.js'
import { TOP_LEVEL_KEYS } from '../core/defaults.js'
import { applyPathRemovals, applyPathUpdates, dropNestedPaths } from './jsonc-spans.js'
import { collectProblems } from './schema.js'

const DEFAULT_SCHEMA_FILE = fileURLToPath(new URL('../../schema/omd-config.schema.json', import.meta.url))
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

const schemaCache = new Map()

/** Load (and cache) `schema/omd-config.schema.json`. */
export async function loadConfigSchema(schemaFile = DEFAULT_SCHEMA_FILE) {
  if (schemaCache.has(schemaFile)) return schemaCache.get(schemaFile)
  const read = await readTextSafe(schemaFile)
  if (!read.ok) throw new Error(`cannot read the OMD config schema at ${schemaFile} (${read.reason})`)
  const schema = JSON.parse(read.value)
  schemaCache.set(schemaFile, schema)
  return schema
}

/** Every leaf path a patch touches; an empty object counts as a leaf. */
export function patchPaths(patch, prefix = [], out = []) {
  if (!isPlainObject(patch)) return out
  for (const [key, value] of Object.entries(patch)) {
    if (BLOCKED_KEYS.has(key)) continue
    const next = [...prefix, key]
    if (isPlainObject(value) && Object.keys(value).length > 0) patchPaths(value, next, out)
    else out.push(next)
  }
  return out
}

function isSameOrNested(candidate, other) {
  if (other.length < candidate.length) return other.every((segment, index) => segment === candidate[index])
  return candidate.every((segment, index) => segment === other[index])
}

/** A schema problem blocks the write only when it touches a patched path. */
export function splitProblems(problems, touched) {
  const blocking = []
  const preexisting = []
  for (const problem of problems) {
    if (touched.some((candidate) => isSameOrNested(candidate, problem.path))) blocking.push(problem)
    else preexisting.push(problem)
  }
  return { blocking, preexisting }
}

function unknownTopLevelKeys(patch) {
  return Object.keys(patch).filter((key) => key !== '$schema' && !TOP_LEVEL_KEYS.includes(key))
}

/** Describe a payload value the way the usage messages do. */
function describePayload(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return `string ${JSON.stringify(value)}`
  if (typeof value === 'object') return 'object'
  return String(value)
}

/**
 * Validate the structured `unset` payload: an array of key paths, each an array
 * of non-empty key names.
 *
 * A dotted string (`"delegation.maxConcurrent"`) is refused rather than split:
 * a configuration key may itself contain a dot, so only the array form says
 * unambiguously which key each segment names.
 * @param value - the payload, `undefined` when the form carried no `unset`.
 * @returns `{ok:true, paths}` or `{ok:false, reason}` for a usage message.
 */
export function normalizeUnsetPaths(value) {
  if (value === undefined) return { ok: true, paths: [] }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      reason: `unset must be an array of key paths, each written as an array of key names such as ["delegation","maxConcurrent"] (got ${describePayload(value)})`,
    }
  }
  const paths = []
  for (const entry of value) {
    if (!Array.isArray(entry)) {
      return {
        ok: false,
        reason: `each unset path must be an array of key names such as ["delegation","maxConcurrent"] (got ${describePayload(entry)})`,
      }
    }
    if (entry.length === 0) return { ok: false, reason: 'an unset path must name at least one key' }
    if (!entry.every((segment) => typeof segment === 'string' && segment.trim() !== '')) {
      return { ok: false, reason: `every unset path segment must be a non-empty string (got ${JSON.stringify(entry)})` }
    }
    const path = entry.map((segment) => segment.trim())
    const blocked = path.find((segment) => BLOCKED_KEYS.has(segment))
    if (blocked !== undefined) return { ok: false, reason: `an unset path cannot name ${blocked}` }
    paths.push(path)
  }
  return { ok: true, paths }
}

/** Value at an object-key path, or `undefined` when the path is not there. */
function getPath(document, path) {
  let node = document
  for (const segment of path) {
    if (!isPlainObject(node) || !Object.hasOwn(node, segment)) return undefined
    node = node[segment]
  }
  return node
}

/** True when `document` sets this object-key path. */
export function hasPath(document, path) {
  return Array.isArray(path) && path.length > 0 && getPath(document, path) !== undefined
}

/** Delete one object-key path, pruning the parent objects the removal emptied. */
function removeDocumentPath(document, path) {
  const parent = getPath(document, path.slice(0, -1))
  if (!isPlainObject(parent)) return false
  delete parent[path[path.length - 1]]
  // A removal that empties an object deletes the object too (never the root).
  // This is tidiness, not semantics: an empty object merges to nothing, so the
  // resolved configuration is the same either way. Leaving `{"delegation": {}}`
  // behind would only be noise the next edit has to step around.
  for (let depth = path.length - 1; depth >= 1; depth -= 1) {
    const node = getPath(document, path.slice(0, depth))
    if (!isPlainObject(node) || Object.keys(node).length > 0) break
    const holder = getPath(document, path.slice(0, depth - 1))
    if (!isPlainObject(holder)) break
    delete holder[path[depth - 1]]
  }
  return true
}

/** The file's own document with every removal applied. */
function withoutPaths(document, paths) {
  const out = clone(document)
  for (const path of paths) removeDocumentPath(out, path)
  return out
}

/**
 * Splice removals and then updates into the document text.
 *
 * Removals go first so the patch overwrites whatever the removal left behind:
 * both halves arrive as one request, and the patch is the value the user just
 * typed, so it must win wherever the two touch the same or an overlapping path.
 * @returns the new text, or `null` when a span could not be computed.
 */
function spliceWrite(source, removals, updates) {
  let text = source
  if (removals.length > 0) {
    const removed = applyPathRemovals(text, removals)
    if (removed === null) return null
    text = removed.text
  }
  if (updates.length > 0) {
    const updated = applyPathUpdates(text, updates)
    if (updated === null) return null
    text = updated.text
  }
  return text
}

/** True when `text` parses to exactly the validated document. */
function parsesAs(text, document) {
  try {
    return isDeepStrictEqual(parseJsonc(text), document)
  } catch {
    return false
  }
}

/**
 * Top-level key sets of every layer that parsed, farthest layer first.
 *
 * `loadConfig` answers the merged document and the files it merged, but not
 * which key came from where; the shared loader in `src/core` must not grow a
 * page-only field, so each contributing file is read once more here. A layer
 * that stops parsing between the two reads simply drops out of this audit list
 * instead of failing the page.
 */
async function describeLayers(files) {
  const layers = []
  for (const file of files) {
    const read = await readTextSafe(file)
    if (!read.ok) continue
    let value
    try {
      value = parseJsonc(read.value, file)
    } catch {
      continue
    }
    if (!isPlainObject(value)) continue
    layers.push({ file, keys: Object.keys(value).filter((key) => !BLOCKED_KEYS.has(key)).sort() })
  }
  return layers
}

export function createConfigStore(options = {}) {
  const home = options.home ?? os.homedir()
  const schemaFile = options.schemaFile ?? DEFAULT_SCHEMA_FILE

  /**
   * Inspect one workspace configuration without writing anything.
   * @returns the effective config, its sources, parse diagnostics, and the raw
   *   file state (`text` is kept for the write path and stripped from the report).
   */
  async function inspect(workspace) {
    const root = path.resolve(workspace ?? process.cwd())
    const file = path.join(root, '.omd', 'config.jsonc')
    const raw = await readTextSafe(file)
    let fileConfig = null
    let bom = false
    let parse = { ok: true }
    if (raw.ok) {
      bom = raw.value.charCodeAt(0) === 0xfeff
      try {
        const value = parseJsonc(raw.value, file)
        if (isPlainObject(value)) fileConfig = value
        else parse = { ok: false, reason: 'shape', detail: 'the document root is not an object' }
      } catch (error) {
        parse = { ok: false, reason: 'parse', detail: String(error?.message ?? error) }
      }
    }
    const loaded = await loadConfig({ workspace: root, home })
    const layers = await describeLayers(loaded.sources)
    const diagnostics = [...loaded.diagnostics]
    if (!parse.ok) diagnostics.unshift({ path: file, reason: parse.reason, detail: parse.detail })
    return {
      workspace: root,
      file,
      exists: raw.ok || raw.reason !== 'missing',
      text: raw.ok ? raw.value : null,
      bom,
      parse,
      fileConfig,
      config: loaded.config,
      sources: loaded.sources,
      layers,
      diagnostics,
    }
  }

  /** Public read: the file text stays inside the process. */
  async function read(workspace) {
    const state = await inspect(workspace)
    const { text, ...rest } = state
    return rest
  }

  /**
   * Merge one partial patch into the workspace file and delete the `unset` paths
   * from it.
   *
   * Validation runs on the merged document so a missing required field inside a
   * patched or emptied object is caught, but only problems on a touched path
   * block the write: an invalid value the user did not touch (an older file,
   * another layer) is reported as a pre-existing problem instead of locking the
   * page. A blocked write never touches the file, so a rejection is always
   * recoverable by editing again.
   *
   * @param workspace - the session working directory.
   * @param patch - partial configuration merged over the file's own document.
   * @param unset - `string[][]` key paths to delete from the file's own document.
   *   A path the file does not set is a no-op (it may be inherited), and the
   *   patch wins wherever the two forms touch the same or an overlapping path.
   */
  async function write(workspace, patch, unset) {
    if (patch !== undefined && patch !== null && !isPlainObject(patch)) {
      return { ok: false, error: { kind: 'usage', message: 'the patch must be a JSON object of configuration keys' } }
    }
    const body = isPlainObject(patch) ? patch : {}
    const requested = normalizeUnsetPaths(unset)
    if (!requested.ok) return { ok: false, error: { kind: 'usage', message: requested.reason } }
    if (Object.keys(body).length === 0 && requested.paths.length === 0) {
      return { ok: false, error: { kind: 'usage', message: 'nothing to write: the patch is empty' } }
    }
    const unknown = unknownTopLevelKeys(body)
    if (unknown.length > 0) {
      return {
        ok: false,
        error: {
          kind: 'unknown-key',
          message: `${unknown[0]} is not an allowed key here (top-level OMD configuration keys: ${TOP_LEVEL_KEYS.join(', ')})`,
          path: [unknown[0]],
        },
      }
    }
    const state = await inspect(workspace)
    if (state.exists && !state.parse.ok) {
      return {
        ok: false,
        error: {
          kind: 'parse',
          message: `${state.file} cannot be edited until it parses: ${state.parse.detail ?? state.parse.reason}`,
          path: [state.file],
        },
      }
    }

    const document = isPlainObject(state.fileConfig) ? state.fileConfig : {}
    // Only a removal this file actually performs is reported and validated: a
    // path that is not in the file may be inherited from a layer the page does
    // not own, or already gone, and either way nothing changes.
    const removedPaths = dropNestedPaths(requested.paths.filter((path) => hasPath(document, path)))
    if (Object.keys(body).length === 0 && removedPaths.length === 0) {
      return {
        ok: false,
        error: { kind: 'usage', message: 'nothing to write: none of the requested keys are set in this file' },
      }
    }

    const schema = await loadConfigSchema(schemaFile)
    // Removals land first, so a patch that names the same or a nested path wins.
    const merged = mergeDeep(withoutPaths(document, removedPaths), body)
    const keys = patchPaths(body)
    // A patch whose only content was blocked keys sanitizes to empty parents the
    // JSONC splicer never emits; writing it would degrade to a whole-document
    // rewrite for no change. Refuse instead of losing every comment.
    if (keys.length === 0 && removedPaths.length === 0) {
      return {
        ok: false,
        error: { kind: 'usage', message: 'nothing to write: the patch contains no writable keys (blocked keys are stripped)' },
      }
    }
    const touched = [...keys, ...removedPaths]
    const { blocking, preexisting } = splitProblems(collectProblems(schema, merged), touched)
    if (blocking.length > 0) {
      const first = blocking[0]
      return { ok: false, error: { kind: 'validation', message: first.message, path: first.path.map(String) } }
    }

    const spliced = spliceWrite(state.text === null ? '{}' : state.text, removedPaths, flattenPatch(body))
    // The spliced text is trusted only when it parses back to exactly the
    // document that was validated: a span the scanner got wrong must degrade to
    // a comment-losing whole-document rewrite, never to a file whose content
    // disagrees with the answer the page just showed.
    const faithful = spliced !== null && parsesAs(spliced, merged)
    const nextText = faithful ? spliced : `${JSON.stringify(merged, null, 2)}\n`
    const mode = faithful ? (state.text === null ? 'create' : 'patch') : 'rewrite'
    await writeTextAtomic(state.file, nextText)

    const after = await inspect(workspace)
    const { text, ...rest } = after
    void text
    return {
      ok: true,
      ...rest,
      write: {
        mode,
        keys: keys.map((segments) => segments.join('.')),
        unset: removedPaths.map((path) => path.join('.')),
      },
      schemaProblems: preexisting.map((problem) => ({ path: problem.path.map(String), message: problem.message })),
    }
  }

  return { inspect, read, write, schemaFile }
}

/** Flatten a nested patch into `[{path, value}]` for the JSONC splicer. */
export function flattenPatch(patch, prefix = [], out = []) {
  for (const [key, value] of Object.entries(patch)) {
    if (BLOCKED_KEYS.has(key)) continue
    const next = [...prefix, key]
    if (isPlainObject(value) && Object.keys(value).length > 0) flattenPatch(value, next, out)
    else out.push({ path: next, value })
  }
  return out
}

/**
 * Read and write one workspace's `.omd/config.jsonc` for the OMD settings page.
 *
 * The page cannot touch the filesystem: it runs in the browser. Everything in
 * this module runs on the Host inside the `/omd-config` command, which the
 * preset plugin already mounts per OMD agent, so the workspace is the session's
 * own working directory and needs no discovery.
 *
 * Contract used by the page (see `src/commands/index.js`):
 * - `read()` returns the effective configuration, every contributing layer, the
 *   parse diagnostics, and the file's own raw object.
 * - `write(patch)` merges one partial patch, rejects invalid values with the
 *   schema validator's own message, and splices the change into the file text so
 *   comments and trailing commas survive. The file is written without a BOM.
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTextSafe, writeTextAtomic } from '../core/atomic.js'
import { loadConfig, isPlainObject, mergeDeep } from '../core/config.js'
import { parseJsonc } from '../core/jsonc.js'
import { TOP_LEVEL_KEYS } from '../core/defaults.js'
import { applyPathUpdates } from './jsonc-spans.js'
import { collectProblems, validate } from './schema.js'

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
   * Merge one partial patch into the workspace file.
   *
   * Validation runs on the merged document so a missing required field inside a
   * patched object is caught, but only problems on a patched path block the
   * write: an invalid value the user did not touch (an older file, another
   * layer) is reported as a pre-existing problem instead of locking the page.
   */
  async function write(workspace, patch) {
    if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
      return { ok: false, error: { kind: 'usage', message: 'nothing to write: the patch is empty' } }
    }
    const unknown = unknownTopLevelKeys(patch)
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

    const schema = await loadConfigSchema(schemaFile)
    const merged = mergeDeep(state.fileConfig ?? {}, patch)
    const touched = patchPaths(patch)
    const { blocking, preexisting } = splitProblems(collectProblems(schema, merged), touched)
    if (blocking.length > 0) {
      const first = blocking[0]
      return { ok: false, error: { kind: 'validation', message: first.message, path: first.path.map(String) } }
    }
    const whole = validate(schema, merged)
    if (!whole.ok && touched.length === 0) {
      return { ok: false, error: { kind: 'validation', message: whole.message, path: whole.path.map(String) } }
    }

    const updates = flattenPatch(patch)
    const patched = state.text === null ? applyPathUpdates('{}', updates) : applyPathUpdates(state.text, updates)
    const nextText = patched === null ? `${JSON.stringify(merged, null, 2)}\n` : patched.text
    const mode = patched === null ? 'rewrite' : state.text === null ? 'create' : 'patch'
    await writeTextAtomic(state.file, nextText)

    const after = await inspect(workspace)
    const { text, ...rest } = after
    void text
    return {
      ok: true,
      ...rest,
      write: { mode, keys: touched.map((segments) => segments.join('.')) },
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

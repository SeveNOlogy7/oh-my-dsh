/**
 * OMD settings page — Host half.
 *
 * The page is a browser surface, so every read and write crosses the OMD
 * endpoint `POST api/omd/config`, registered by this package on DSH's
 * already-authenticated `/api` channel (`src/config-page/transport.js`). The
 * same line grammar is served by the session-scoped `/omd-config` command
 * (`src/commands/index.js`), so the page and a human typing the command share one
 * parser, one write path, and one envelope; the page does not borrow the command
 * plane, because executing a command appends records to the live session log.
 *
 * The transport is the reason this file exists at all: the command output is a
 * JSON envelope the page parses, and the write form has a structured shape:
 * - `set {<patch>}` — merge one partial configuration patch. This is the
 *   original form and still what the page sends when it has nothing to remove.
 * - `set {"patch": {<patch>}, "unset": [["a","b"], …]}` — patch AND delete key
 *   paths from the workspace file in one request. Both keys are optional and at
 *   least one must be non-empty; the write path enforces that, so `{}`,
 *   `{"patch":{}}` and `{"unset":[]}` all answer the same "nothing to write"
 *   usage error.
 *
 * Envelope (protocol 1): protocol, ok, workspace, file, exists, bom, parse,
 * sources, layers, diagnostics, config, fileConfig, defaults, plugin — plus
 * write and schemaProblems on a successful `set`. `layers` is every
 * configuration layer that parsed, farthest first (the order of `sources`), with
 * the top-level keys that layer sets; `defaults` is a clone of the shipped
 * defaults, so the page can show an inherited value instead of calling it unset.
 */
import { isPlainObject } from '../core/config.js'
import { cloneDefaults } from '../core/defaults.js'
import { createConfigStore, normalizeUnsetPaths } from './config-store.js'
import { buildPluginSection } from './plugin-info.js'

export {
  createConfigStore,
  loadConfigSchema,
  patchPaths,
  flattenPatch,
  splitProblems,
  hasPath,
  normalizeUnsetPaths,
} from './config-store.js'
export { applyPathRemovals, applyPathUpdates, dropNestedPaths, scanJsonc } from './jsonc-spans.js'
export { collectProblems, validate, unsupportedKeywordsIn } from './schema.js'
export { buildLanguageSnippet, buildPluginSection, languageInfo, routingTiers } from './plugin-info.js'

/** Command the page calls; must match the registration in `src/commands/index.js`. */
export const CONFIG_COMMAND_NAME = 'omd-config'
/** Prefix both write forms share; the rest of the line is the JSON payload. */
export const CONFIG_SET_PREFIX = 'set'
/** Envelope version; the page refuses an envelope it does not understand. */
export const CONFIG_PAGE_PROTOCOL = 1

/**
 * The one line both write forms are documented in.
 *
 * A malformed payload answers with this appended to the specific reason: a
 * person who wrote a dotted path instead of an array sees the shape to repeat
 * rather than a bare rejection.
 */
export const CONFIG_USAGE = `usage: /${CONFIG_COMMAND_NAME} [set <json object> | set {"patch":{...},"unset":[["key","child"]]}]`

/** Payload keys that make a `set` body the structured form. */
const STRUCTURED_KEYS = new Set(['patch', 'unset'])

/**
 * True when the parsed payload is the structured `set {"patch":…,"unset":…}`
 * form.
 *
 * The test is strict on purpose — every own key must be one of the two — and
 * that is what keeps the legacy form unambiguous: no top-level OMD configuration
 * key is named `patch` or `unset`, so an object mixing them with real keys is a
 * patch that the write path then refuses as an unknown key, exactly as before.
 */
function isStructuredPayload(value) {
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((key) => STRUCTURED_KEYS.has(key))
}

/**
 * Parse the command's raw input.
 * @returns `{kind:'read'}` (bare command), `{kind:'set', patch, unset}` for
 *   either write form (`unset` is `[]` for the legacy one), or
 *   `{kind:'usage', message}` for anything else.
 */
export function parseConfigInput(rawInput) {
  const input = String(rawInput ?? '').trim()
  if (input === '') return { kind: 'read' }
  if (!/^set(?:\s|$)/.test(input)) return { kind: 'usage', message: CONFIG_USAGE }
  const body = input.slice(CONFIG_SET_PREFIX.length).trim()
  if (body === '') return { kind: 'usage', message: CONFIG_USAGE }
  let payload
  try {
    payload = JSON.parse(body)
  } catch (error) {
    return { kind: 'usage', message: `the set payload is not valid JSON: ${String(error?.message ?? error)}; ${CONFIG_USAGE}` }
  }
  if (!isPlainObject(payload)) {
    return { kind: 'usage', message: `${CONFIG_COMMAND_NAME} set expects a JSON object of configuration keys; ${CONFIG_USAGE}` }
  }
  if (!isStructuredPayload(payload)) return { kind: 'set', patch: payload, unset: [] }

  const patch = Object.hasOwn(payload, 'patch') ? payload.patch : {}
  if (!isPlainObject(patch)) {
    return { kind: 'usage', message: `"patch" must be a JSON object of configuration keys; ${CONFIG_USAGE}` }
  }
  const unset = normalizeUnsetPaths(Object.hasOwn(payload, 'unset') ? payload.unset : undefined)
  if (!unset.ok) return { kind: 'usage', message: `${unset.reason}; ${CONFIG_USAGE}` }
  return { kind: 'set', patch, unset: unset.paths }
}

/**
 * Order the envelope fields so the readable keys stay first in the chat cell.
 *
 * `defaults` is cloned per answer rather than exported from here: it is what the
 * page shows as the value an unset key falls back to, and a caller must never be
 * able to mutate the shipped object.
 */
function report(state, extra = {}) {
  return {
    protocol: CONFIG_PAGE_PROTOCOL,
    ok: true,
    workspace: state.workspace,
    file: state.file,
    exists: state.exists,
    bom: state.bom,
    parse: state.parse,
    sources: state.sources,
    layers: state.layers,
    diagnostics: state.diagnostics,
    config: state.config,
    fileConfig: state.fileConfig,
    defaults: cloneDefaults(),
    ...extra,
  }
}

/**
 * Build the page's Host operations.
 * @param options.home - home directory for the configuration layer search.
 * @param options.schemaFile - override for tests.
 * @param options.packageRoot - package root holding `presets/` for the snippet.
 */
export function createConfigPage(options = {}) {
  const store = createConfigStore(options)
  const pluginSection = (state, context) =>
    buildPluginSection({
      config: state.config,
      language: context.language,
      role: context.agentId ?? null,
      packageRoot: options.packageRoot,
      profileDir: options.profileDir ?? process.env.DSH_PROFILE_DIR ?? null,
    })

  return {
    /** Read the workspace configuration for the page. */
    async read({ workspace, agentId, language }) {
      const state = await store.read(workspace)
      return report(state, { plugin: await pluginSection(state, { agentId, language }) })
    },
    /** Apply one partial patch and/or one set of removals, and answer the new state. */
    async set({ workspace, agentId, language, patch, unset }) {
      const result = await store.write(workspace, patch, unset)
      if (!result.ok) return result
      return report(result, {
        write: result.write,
        schemaProblems: result.schemaProblems,
        plugin: await pluginSection(result, { agentId, language }),
      })
    },
  }
}

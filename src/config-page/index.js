/**
 * OMD settings page — Host half.
 *
 * The page is a browser surface, so every read and write crosses the existing
 * session-scoped `/omd-config` command (`src/commands/index.js`) through
 * `ctx.remote.commands.execute(agentId, line, [], signal)`. Reusing that command
 * keeps the OMD package zero-footprint for non-OMD sessions: no global command
 * is registered, and no new command name needs a client cell.
 *
 * The transport is the reason this file exists at all: the command output is a
 * JSON envelope the page parses, and `set <json>` is the write form.
 */
import { isPlainObject } from '../core/config.js'
import { createConfigStore } from './config-store.js'
import { buildPluginSection } from './plugin-info.js'

export { createConfigStore, loadConfigSchema, patchPaths, flattenPatch, splitProblems } from './config-store.js'
export { applyPathUpdates, scanJsonc } from './jsonc-spans.js'
export { collectProblems, validate, unsupportedKeywordsIn } from './schema.js'
export { buildLanguageSnippet, buildPluginSection, languageInfo, routingTiers } from './plugin-info.js'

/** Command the page calls; must match the registration in `src/commands/index.js`. */
export const CONFIG_COMMAND_NAME = 'omd-config'
/** Write form: `/omd-config set <json object>`. */
export const CONFIG_SET_PREFIX = 'set'
/** Envelope version; the page refuses an envelope it does not understand. */
export const CONFIG_PAGE_PROTOCOL = 1

/**
 * Parse the command's raw input.
 * @returns `{kind:'read'}` (bare command), `{kind:'set', patch}`, or
 *   `{kind:'usage', message}` for anything else.
 */
export function parseConfigInput(rawInput) {
  const input = String(rawInput ?? '').trim()
  if (input === '') return { kind: 'read' }
  if (!/^set(?:\s|$)/.test(input)) {
    return { kind: 'usage', message: `usage: /${CONFIG_COMMAND_NAME} [set <json object>]` }
  }
  const body = input.slice(CONFIG_SET_PREFIX.length).trim()
  if (body === '') return { kind: 'usage', message: `usage: /${CONFIG_COMMAND_NAME} set <json object>` }
  let patch
  try {
    patch = JSON.parse(body)
  } catch (error) {
    return { kind: 'usage', message: `the set payload is not valid JSON: ${String(error?.message ?? error)}` }
  }
  if (!isPlainObject(patch)) return { kind: 'usage', message: `${CONFIG_COMMAND_NAME} set expects a JSON object of configuration keys` }
  return { kind: 'set', patch }
}

/** Order the envelope fields so the readable keys stay first in the chat cell. */
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
    diagnostics: state.diagnostics,
    config: state.config,
    fileConfig: state.fileConfig,
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
    /** Apply one partial patch and answer with the new state. */
    async set({ workspace, agentId, language, patch }) {
      const result = await store.write(workspace, patch)
      if (!result.ok) return result
      return report(result, {
        write: result.write,
        schemaProblems: result.schemaProblems,
        plugin: await pluginSection(result, { agentId, language }),
      })
    },
  }
}

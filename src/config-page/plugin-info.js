/**
 * The read-only half of the OMD settings page: values that live in the user's
 * profile (a `cordis.patch.yml` row config) rather than in the workspace.
 *
 * Two facts the page must not pretend it can save:
 * - `language` is the plugin row's Config key (`src/runtime/runtime.js` reads
 *   `config.language`), so it is composition time.
 * - the model-routing tiers the built-in categories resolve to are read per
 *   workspace from `.omd/config.jsonc` (`src/core/config.js` `routeFor`), which
 *   the page edits in its Project section instead.
 *
 * The copyable snippet is generated from the shipped preset patch so it is the
 * exact override the Loader accepts: a patch replaces `config` wholesale, never
 * deep-merges, so the row must restate its whole config.
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CATEGORIES } from '../core/defaults.js'
import { isPlainObject, routeFor } from '../core/config.js'

/** Kept in sync with `LANGUAGES` in `src/i18n/messages.js`; read-only display. */
export const SUPPORTED_LANGUAGES = ['en', 'zh']

const DEFAULT_PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** The generated top-level row that mounts the OMD runtime for the profile. */
export const RUNTIME_ROW_ID = 'omd-runtime'

/**
 * The module specifier that row uses, read from the package itself so a release
 * rename cannot leave the snippet naming a package that no longer resolves.
 */
const RUNTIME_PACKAGE = JSON.parse(
  readFileSync(path.join(DEFAULT_PACKAGE_ROOT, 'package.json'), 'utf8'),
).name

/** Describe the effective row language beside the values this build supports. */
export function languageInfo(language) {
  const value = typeof language === 'string' && language ? language : 'en'
  return {
    value,
    supported: SUPPORTED_LANGUAGES,
    source: 'plugin row Config (cordis.patch.yml)',
    recognized: SUPPORTED_LANGUAGES.includes(value),
  }
}

/** The effective model-routing tier of every built-in (and overridden) category. */
export function routingTiers(config) {
  const categories = isPlainObject(config?.categories) ? config.categories : {}
  const names = [...new Set([...Object.keys(DEFAULT_CATEGORIES), ...Object.keys(categories)])]
  return names.map((name) => {
    const override = isPlainObject(categories[name]) ? categories[name] : null
    const builtin = DEFAULT_CATEGORIES[name] ?? {}
    const route = routeFor(config ?? {}, { category: name })
    return {
      name,
      description: override?.description ?? builtin.description ?? '',
      disabled: Boolean(override?.disabled),
      modelRef: override?.modelRef ?? null,
      provider: route.provider ?? null,
      model: route.model ?? null,
      source: override ? 'project' : 'builtin',
    }
  })
}

/**
 * The exact profile patch a user pastes to set the OMD row language.
 *
 * `language` used to live on the `omd` row nested inside one preset, so the
 * snippet had to restate that preset's whole config. The runtime is one
 * top-level row now, and `language` is its only configurable key, so the
 * snippet is the row itself.
 * @returns `{text, rowId, presetFile}`.
 */
export function buildLanguageSnippet({ language, profileDir = null } = {}) {
  const target = profileDir === null ? '<your DSH profile>/cordis.patch.yml' : path.join(profileDir, 'cordis.patch.yml')
  const text = [
    `# Paste into ${target}`,
    '#',
    '# A Loader patch replaces `config` wholesale (it never deep-merges), so this',
    "# restates the runtime row's own config and adds `language`.",
    `- id: ${RUNTIME_ROW_ID}`,
    `  name: ${JSON.stringify(RUNTIME_PACKAGE)}`,
    '  config:',
    `    language: ${JSON.stringify(language)}`,
    '',
  ].join('\n')
  return { text, rowId: RUNTIME_ROW_ID, presetFile: `presets/${RUNTIME_ROW_ID}.patch.yml` }
}

/**
 * Assemble everything the page shows in its read-only Plugin section.
 * @param options.config - effective workspace configuration (for the tiers).
 * @param options.language - the runtime's effective row language.
 * @param options.role - the OMD role this session resolved to, or null for the
 *   capability-only identity.
 */
export async function buildPluginSection({
  config,
  language,
  role = null,
  packageRoot = DEFAULT_PACKAGE_ROOT,
  profileDir = process.env.DSH_PROFILE_DIR ?? null,
} = {}) {
  const snippet = buildLanguageSnippet({ language: languageInfo(language).value, profileDir })
  return {
    compositionTime: true,
    language: languageInfo(language),
    role,
    tiers: routingTiers(config),
    snippet: snippet.text,
    snippetFrom: snippet.presetFile,
    presetRowId: snippet.rowId,
    profileDir,
    note:
      'language is a plugin-row Config value: it is read when the profile composes, so it is shown read-only with the exact cordis.patch.yml override. ' +
      'Model routing is read per workspace from .omd/config.jsonc, so the Project section above edits it.',
  }
}

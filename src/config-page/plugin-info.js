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
import { fileURLToPath } from 'node:url'
import { readTextSafe } from '../core/atomic.js'
import { DEFAULT_CATEGORIES } from '../core/defaults.js'
import { isPlainObject, routeFor } from '../core/config.js'
import { presetIdFor } from '../agents/registry.js'

/** Kept in sync with `LANGUAGES` in `src/i18n/messages.js`; read-only display. */
export const SUPPORTED_LANGUAGES = ['en', 'zh']

const DEFAULT_PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

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
 * Pull the preset row's `config:` block out of a shipped patch file.
 * @param patchText - the shipped patch file.
 * @param parentIndent - indentation the block's parent key gets in the snippet.
 * @returns `{rowId, block}` with the block re-indented under its new parent.
 */
export function extractConfigBlock(patchText, parentIndent = 2) {
  const lines = String(patchText).replace(/\r\n/g, '\n').split('\n')
  const configIndex = lines.findIndex((line) => /^\s*config:\s*$/.test(line))
  if (configIndex === -1) return null
  const indent = /^(\s*)/.exec(lines[configIndex])[1]
  const drop = Math.max(0, indent.length - parentIndent)
  const rowLine = lines.find((line) => /^\s*-\s*id:\s*\S+/.test(line) || /^\s*id:\s*\S+/.test(line))
  const rowId = rowLine === undefined ? null : (/id:\s*(\S+)/.exec(rowLine)?.[1] ?? null)
  let end = configIndex + 1
  while (end < lines.length) {
    const line = lines[end]
    if (line.trim() === '') {
      end += 1
      continue
    }
    const leading = /^(\s*)/.exec(line)[1]
    if (leading.length > indent.length) {
      end += 1
      continue
    }
    break
  }
  const block = lines
    .slice(configIndex + 1, end)
    .filter((line, index, all) => !(line.trim() === '' && index === all.length - 1))
    .map((line) => (drop === 0 || line.length < drop || line.slice(0, drop).trim() !== '' ? line : line.slice(drop)))
  return block.length === 0 ? null : { rowId, block }
}

/**
 * Add `language` to the `omd` child row inside an extracted config block.
 * @returns the block text with the key inserted at the child's own indentation.
 */
export function injectLanguage(block, language) {
  const lines = [...block]
  let target = -1
  let indent = ''
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^(\s*)agent:\s*["']?[\w-]+["']?\s*$/.exec(lines[index])
    if (match === null) continue
    target = index
    indent = match[1]
    break
  }
  if (target === -1) return block
  lines.splice(target + 1, 0, `${indent}language: ${JSON.stringify(language)}`)
  return lines.join('\n')
}

/**
 * The exact profile patch a user pastes to change this preset's row language.
 * @returns `{text, rowId, presetFile}`; `text` is null when the shipped preset
 *   patch could not be read, so the page can omit the snippet.
 */
export function buildLanguageSnippet({ presetPatchText, agentId, language, profileDir = null }) {
  const extracted = presetPatchText === null || presetPatchText === undefined ? null : extractConfigBlock(presetPatchText)
  if (extracted === null) return { text: null, rowId: null, presetFile: null }
  const rowId = extracted.rowId ?? `preset-${presetIdFor(agentId)}`
  const block = injectLanguage(extracted.block, language)
  const target = profileDir === null ? '<your DSH profile>/cordis.patch.yml' : path.join(profileDir, 'cordis.patch.yml')
  const text = [
    `# Paste into ${target}`,
    '#',
    '# A Loader patch replaces `config` wholesale (it never deep-merges), so this',
    '# restates the preset row\'s own config and adds `language` to its omd row.',
    `- id: ${rowId}`,
    '  name: "@deepseek-ai/dsh-agent-preset"',
    '  config:',
    block,
    '',
  ].join('\n')
  return { text, rowId, presetFile: `presets/${presetIdFor(agentId)}.patch.yml` }
}

/**
 * Assemble everything the page shows in its read-only Plugin section.
 * @param options.config - effective workspace configuration (for the tiers).
 * @param options.language - the runtime's effective row language.
 * @param options.agentId - OMD agent id (`sisyphus`, ...) naming the preset row.
 */
export async function buildPluginSection({
  config,
  language,
  agentId,
  packageRoot = DEFAULT_PACKAGE_ROOT,
  profileDir = process.env.DSH_PROFILE_DIR ?? null,
} = {}) {
  const presetFile = path.join(packageRoot, 'presets', `${presetIdFor(agentId)}.patch.yml`)
  const presetRead = await readTextSafe(presetFile)
  const snippet = buildLanguageSnippet({
    presetPatchText: presetRead.ok ? presetRead.value : null,
    agentId,
    language: languageInfo(language).value,
    profileDir,
  })
  return {
    compositionTime: true,
    language: languageInfo(language),
    tiers: routingTiers(config),
    snippet: snippet.text,
    snippetFrom: snippet.presetFile,
    presetRowId: snippet.rowId ?? `preset-${presetIdFor(agentId)}`,
    profileDir,
    note:
      'language is a plugin-row Config value: it is read when the profile composes, so it is shown read-only with the exact cordis.patch.yml override. ' +
      'Model routing is read per workspace from .omd/config.jsonc, so the Project section above edits it.',
  }
}

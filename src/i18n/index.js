import { DEFAULT_LANGUAGE, LANGUAGES, MESSAGES } from './messages.js'

const SUPPORTED = new Set(LANGUAGES)

/**
 * Normalize a plugin-row `language` value to a language this build ships.
 *
 * The row config is authored by hand in the profile's `cordis.patch.yml`, so
 * the read is deliberately defensive and plain: anything that is not a
 * supported language string — a missing key, a number, an unknown code —
 * resolves to the default instead of breaking the mount.
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE
  const candidate = value.trim().toLowerCase()
  return SUPPORTED.has(candidate) ? candidate : DEFAULT_LANGUAGE
}

/**
 * Resolve one description string.
 *
 * Order: the localized entry, then the English entry, then `fallback`. A key
 * missing from the catalog is not an error — the caller's own English string is
 * the last resort, so registration never depends on catalog completeness.
 */
export function text(language, key, fallback = '') {
  if (typeof key !== 'string' || !key) return typeof fallback === 'string' ? fallback : ''
  const resolved = normalizeLanguage(language)
  const localized = MESSAGES[resolved]?.[key]
  if (typeof localized === 'string') return localized
  const english = MESSAGES[DEFAULT_LANGUAGE]?.[key]
  if (typeof english === 'string') return english
  return typeof fallback === 'string' ? fallback : ''
}

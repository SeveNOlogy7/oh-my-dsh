import { DEFAULT_CATEGORIES } from '../core/defaults.js'
import { categoryNames as names, categorySettings } from '../core/config.js'

export const BUILTIN_CATEGORIES = DEFAULT_CATEGORIES

export function categoryNames(config) {
  return names(config)
}

export function categoryList(config) {
  return categoryNames(config)
    .map((name) => {
      const settings = categorySettings(config, name)
      return {
        name,
        description: settings.description ?? '',
        disabled: Boolean(settings.disabled),
        modelRef: settings.modelRef ?? null,
        provider: settings.provider ?? null,
        model: settings.model ?? null,
        reasoningEffort: settings.reasoningEffort ?? null,
      }
    })
    .filter((entry) => !entry.disabled)
}

export function isCategory(name, config) {
  return categoryNames(config).includes(name) && !categorySettings(config, name).disabled
}

export function categoryPrompt(config, name) {
  const settings = categorySettings(config, name)
  return settings.promptAppend ?? ''
}

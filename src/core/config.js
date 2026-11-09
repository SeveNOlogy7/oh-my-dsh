import os from 'node:os'
import path from 'node:path'
import { readTextSafe } from './atomic.js'
import { parseJsonc } from './jsonc.js'
import { DEFAULT_CATEGORIES, DEFAULT_CONFIG, DEFAULT_AGENT_SETTINGS, NEUTRAL_AGENT_SETTINGS, TOP_LEVEL_KEYS } from './defaults.js'

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function mergeDeep(base, patch) {
  if (!isPlainObject(patch)) return clone(base)
  const out = clone(base)
  for (const [key, value] of Object.entries(patch)) {
    if (BLOCKED_KEYS.has(key)) continue
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeDeep(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}

export function clone(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // fall through to JSON clone for non-cloneable values
    }
  }
  return JSON.parse(JSON.stringify(value))
}

/** Candidate config files from user layer and every ancestor project layer. */
export function configCandidates(workspace, home = os.homedir()) {
  const user = path.join(home, '.omd', 'config.jsonc')
  const layers = []
  let current = path.resolve(workspace)
  const homeResolved = path.resolve(home)
  while (true) {
    if (current !== homeResolved) layers.push(path.join(current, '.omd', 'config.jsonc'))
    const parent = path.dirname(current)
    if (parent === current) break
    if (parent === homeResolved) break
    current = parent
  }
  return [user, ...layers.reverse()]
}

/**
 * Load and merge configuration layers.
 * @returns {{config:object,sources:string[],diagnostics:Array<{path:string,reason:string}>,bom:boolean}}
 */
export async function loadConfig({ workspace, home = os.homedir(), candidates } = {}) {
  const root = path.resolve(workspace ?? process.cwd())
  const files = candidates ?? configCandidates(root, home)
  const diagnostics = []
  let merged = clone(DEFAULT_CONFIG)
  const sources = []
  let sawBom = false
  const disabledHooks = new Set(DEFAULT_CONFIG.disabledHooks)
  for (const file of files) {
    const read = await readTextSafe(file)
    if (!read.ok) {
      if (read.reason !== 'missing') diagnostics.push({ path: file, reason: read.reason })
      continue
    }
    let parsed
    try {
      parsed = parseJsonc(read.value, file)
    } catch (error) {
      diagnostics.push({ path: file, reason: 'parse', detail: String(error.message ?? error) })
      continue
    }
    if (!isPlainObject(parsed)) {
      diagnostics.push({ path: file, reason: 'shape' })
      continue
    }
    if (read.value.charCodeAt(0) === 0xfeff) sawBom = true
    sources.push(file)
    merged = mergeDeep(merged, parsed)
    if (Array.isArray(parsed.disabledHooks)) {
      for (const hook of parsed.disabledHooks) if (typeof hook === 'string') disabledHooks.add(hook)
    }
  }
  if (disabledHooks.size) merged.disabledHooks = [...disabledHooks]
  const normalized = normalizeConfig(merged, diagnostics, root)
  return { config: normalized, sources, diagnostics, bom: sawBom }
}

export function normalizeConfig(input, diagnostics = [], workspace = process.cwd()) {
  const config = clone(DEFAULT_CONFIG)
  if (isPlainObject(input)) {
    for (const [key, value] of Object.entries(input)) {
      if (BLOCKED_KEYS.has(key)) continue
      config[key] = value
    }
  }
  for (const key of Object.keys(config)) {
    if (!TOP_LEVEL_KEYS.includes(key)) diagnostics.push({ path: workspace, reason: 'unknown-key', detail: key })
  }
  config.keywordHook = Boolean(config.keywordHook)
  config.keywords = { ...DEFAULT_CONFIG.keywords, ...(isPlainObject(config.keywords) ? config.keywords : {}) }
  config.agents = isPlainObject(config.agents) ? config.agents : {}
  config.categories = isPlainObject(config.categories) ? config.categories : {}
  config.models = isPlainObject(config.models) ? config.models : { catalog: {} }
  config.models.catalog = isPlainObject(config.models.catalog) ? config.models.catalog : {}
  config.delegation = { ...DEFAULT_CONFIG.delegation, ...(isPlainObject(config.delegation) ? config.delegation : {}) }
  config.delegation.maxConcurrent = positiveInt(config.delegation.maxConcurrent, 5)
  config.delegation.maxDepth = nonNegativeInt(config.delegation.maxDepth, 1)
  config.delegation.defaultBackground = Boolean(config.delegation.defaultBackground)
  config.delegation.waitTimeoutMs = positiveInt(config.delegation.waitTimeoutMs, 600000)
  config.delegation.pollMs = positiveInt(config.delegation.pollMs, 30000)
  config.taskSystem = { ...DEFAULT_CONFIG.taskSystem, ...(isPlainObject(config.taskSystem) ? config.taskSystem : {}) }
  config.taskSystem.enabled = Boolean(config.taskSystem.enabled)
  config.ultrawork = { ...DEFAULT_CONFIG.ultrawork, ...(isPlainObject(config.ultrawork) ? config.ultrawork : {}) }
  config.ultrawork.requirePlanGate = Boolean(config.ultrawork.requirePlanGate)
  config.ultrawork.dualEvidence = Boolean(config.ultrawork.dualEvidence)
  config.ultrawork.maxWaves = positiveInt(config.ultrawork.maxWaves, 8)
  config.ultrawork.maxContinuationRounds = positiveInt(config.ultrawork.maxContinuationRounds, 20)
  config.review = { ...DEFAULT_CONFIG.review, ...(isPlainObject(config.review) ? config.review : {}) }
  config.review.maxRounds = positiveInt(config.review.maxRounds, 2)
  config.review.highAccuracyDefault = Boolean(config.review.highAccuracyDefault)
  config.hooks = { ...DEFAULT_CONFIG.hooks, ...(isPlainObject(config.hooks) ? config.hooks : {}) }
  if (!['off', 'warn', 'block'].includes(config.hooks.commentChecker)) config.hooks.commentChecker = 'warn'
  for (const key of ['todoContinuation', 'rulesInjection', 'prometheusGuard', 'notepadGuard', 'planValidator', 'modelRouting']) {
    config.hooks[key] = Boolean(config.hooks[key])
  }
  config.disabledHooks = Array.isArray(config.disabledHooks)
    ? [...new Set(config.disabledHooks.filter((x) => typeof x === 'string'))]
    : []
  config.rules = { ...DEFAULT_CONFIG.rules, ...(isPlainObject(config.rules) ? config.rules : {}) }
  if (!Array.isArray(config.rules.paths)) config.rules.paths = [...DEFAULT_CONFIG.rules.paths]
  config.rules.maxBytes = positiveInt(config.rules.maxBytes, 65536)
  config.skills = { ...DEFAULT_CONFIG.skills, ...(isPlainObject(config.skills) ? config.skills : {}) }
  if (!Array.isArray(config.skills.paths)) config.skills.paths = [...DEFAULT_CONFIG.skills.paths]
  config.diagnostics = { ...DEFAULT_CONFIG.diagnostics, ...(isPlainObject(config.diagnostics) ? config.diagnostics : {}) }
  if (!Array.isArray(config.diagnostics.commands)) config.diagnostics.commands = []
  config.telemetry = Boolean(config.telemetry)
  return config
}

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

function nonNegativeInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export function agentSettings(config, id) {
  // `id == null` is the capability-only identity, which has no registry entry.
  // It must resolve to the neutral settings rather than to whichever role a
  // lookup miss happens to land on.
  const base = (id == null ? undefined : DEFAULT_AGENT_SETTINGS[id]) ?? NEUTRAL_AGENT_SETTINGS
  const override = id == null ? undefined : config?.agents?.[id]
  return { ...base, ...(isPlainObject(override) ? override : {}) }
}

export function categorySettings(config, name) {
  const base = DEFAULT_CATEGORIES[name] ?? {}
  return { ...base, ...(isPlainObject(config?.categories?.[name]) ? config.categories[name] : {}) }
}

export function categoryNames(config) {
  return [...new Set([...Object.keys(DEFAULT_CATEGORIES), ...Object.keys(config?.categories ?? {})])]
}

/** Resolve a catalog alias or a provider/model string into a route object. */
export function resolveModelRef(config, ref) {
  if (!ref || typeof ref !== 'string') return null
  const catalog = config?.models?.catalog ?? {}
  if (isPlainObject(catalog[ref])) return { ref, ...catalog[ref] }
  const slash = ref.indexOf('/')
  if (slash > 0 && slash < ref.length - 1) {
    return { provider: ref.slice(0, slash), model: ref.slice(slash + 1) }
  }
  return null
}

/** Resolve one layer's explicit model settings, preferring an explicit route. */
function routeFromSettings(config, settings) {
  if (!settings) return null
  if (settings.provider && settings.model) {
    return { provider: settings.provider, model: settings.model }
  }
  if (typeof settings.model === 'string' && settings.model.includes('/')) {
    const slash = settings.model.indexOf('/')
    return { provider: settings.model.slice(0, slash), model: settings.model.slice(slash + 1) }
  }
  if (typeof settings.model === 'string' && settings.model) {
    if (settings.provider) return { provider: settings.provider, model: settings.model }
    const alias = resolveModelRef(config, settings.model)
    if (alias?.provider && alias?.model) return { provider: alias.provider, model: alias.model }
  }
  if (settings.modelRef) {
    const alias = resolveModelRef(config, settings.modelRef)
    if (alias?.provider && alias?.model) return { provider: alias.provider, model: alias.model }
  }
  if (settings.provider) return { provider: settings.provider, model: null }
  return null
}

/** Merge an agent/category route into a DSH AgentOptions-shaped object. */
export function routeFor(config, { agentId, category, override } = {}) {
  const agent = agentId ? agentSettings(config, agentId) : {}
  const cat = category ? categorySettings(config, category) : {}
  const pick = override ?? {}
  const ref = pick.modelRef ?? agent.modelRef ?? cat.modelRef ?? null
  const fromRef = resolveModelRef(config, ref)
  const agentRoute = routeFromSettings(config, agent)
  const catRoute = routeFromSettings(config, cat)
  const provider = pick.provider ?? agentRoute?.provider ?? catRoute?.provider ?? fromRef?.provider ?? null
  const model = pick.model ?? agentRoute?.model ?? catRoute?.model ?? fromRef?.model ?? null
  const reasoningEffort =
    pick.reasoningEffort ??
    fromRef?.reasoningEffort ??
    agent.reasoningEffort ??
    cat.reasoningEffort ??
    null
  const maxTokens = pick.maxTokens ?? agent.maxTokens ?? cat.maxTokens ?? fromRef?.maxTokens ?? null
  const temperature = pick.temperature ?? agent.temperature ?? cat.temperature ?? fromRef?.temperature ?? null
  const out = {}
  if (provider) out.provider = provider
  if (model) out.model = model
  if (reasoningEffort) out.reasoningEffort = reasoningEffort
  if (Number.isInteger(maxTokens) && maxTokens > 0) out.maxTokens = maxTokens
  if (typeof temperature === 'number') out.temperature = temperature
  return out
}

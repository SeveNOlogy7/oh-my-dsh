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
      out[key] = sanitizeValue(value)
    }
  }
  return out
}

/**
 * Deep-copy one value with every blocked key dropped.
 *
 * `mergeDeep` refuses a blocked key only at the level it happens to iterate, so
 * a subtree it *assigns* — `out[key] = value`, taken whenever the target path
 * does not already exist — would carry a nested `__proto__`, `prototype`, or
 * `constructor` with it into the resolved configuration. `normalizeConfig`
 * copies its top-level values the same way. Both copy through here, so a
 * blocked key never survives at any depth, including inside an array element,
 * while every key that is not blocked keeps its value and its shape.
 */
export function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry))
  if (!isPlainObject(value)) return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(key)) continue
    out[key] = sanitizeValue(entry)
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
      config[key] = sanitizeValue(value)
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
  config.delegation.childPreset = normalizeChildPreset(config.delegation.childPreset)
  config.taskSystem = { ...DEFAULT_CONFIG.taskSystem, ...(isPlainObject(config.taskSystem) ? config.taskSystem : {}) }
  config.taskSystem.enabled = Boolean(config.taskSystem.enabled)
  config.ultrawork = { ...DEFAULT_CONFIG.ultrawork, ...(isPlainObject(config.ultrawork) ? config.ultrawork : {}) }
  config.ultrawork.requirePlanGate = Boolean(config.ultrawork.requirePlanGate)
  config.ultrawork.requireBaseline = Boolean(config.ultrawork.requireBaseline)
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

/**
 * Normalize `delegation.childPreset`, the only remaining override for the preset
 * a delegated child composes from.
 *
 * `null` means "inherit the parent preset": the delegate tools then omit
 * `agentPreset` from the activation request, which is what lets DSH's
 * `composeFrom` path run. Only a non-empty string names a preset, because an
 * empty id would be a lookup for something the user never named; every
 * non-string collapses to `null` for the same reason, so one stray value in a
 * config file can never turn into a broken preset request.
 */
export function normalizeChildPreset(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
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
function legacyRouteFor(config, { agentId, category, override } = {}) {
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

/** Copy the route fields a chain step contributes, or an empty object. */
function routeFields(value) {
  if (!isPlainObject(value)) return {}
  const out = {}
  if (typeof value.provider === 'string' && value.provider) out.provider = value.provider
  if (typeof value.model === 'string' && value.model) out.model = value.model
  if (typeof value.reasoningEffort === 'string' && value.reasoningEffort) out.reasoningEffort = value.reasoningEffort
  if (Number.isInteger(value.maxTokens) && value.maxTokens > 0) out.maxTokens = value.maxTokens
  if (typeof value.temperature === 'number') out.temperature = value.temperature
  return out
}

/**
 * Resolve one chain step into a complete route.
 *
 * A step is a reference string (`catalog alias` or `provider/model`) or an
 * object whose fields overlay the catalog entry it names. Nothing is inherited
 * from other steps: a fallback that names only a model is invalid rather than
 * silently borrowing the primary route's provider.
 *
 * @returns a detached step with `valid`, `via`, and a `warning` when invalid.
 */
export function resolveChainStep(config, step, index = 0) {
  if (typeof step === 'string') {
    const ref = step.trim()
    if (!ref) return { index, ref, valid: false, via: 'route', warning: 'empty model reference' }
    const alias = isPlainObject(config?.models?.catalog?.[ref]) ? config.models.catalog[ref] : null
    if (alias) {
      const fields = routeFields(alias)
      return {
        index,
        ref,
        ...fields,
        valid: Boolean(fields.provider && fields.model),
        via: 'catalog',
        warning: fields.provider && fields.model ? null : `catalog alias "${ref}" needs provider and model`,
      }
    }
    const route = resolveModelRef(config, ref)
    if (route?.provider && route?.model) {
      return { index, ref, provider: route.provider, model: route.model, valid: true, via: 'route', warning: null }
    }
    return { index, ref, valid: false, via: 'route', warning: `unknown model alias or provider/model reference "${ref}"` }
  }

  if (isPlainObject(step)) {
    const modelRef = typeof step.modelRef === 'string' && step.modelRef ? step.modelRef : null
    const alias = modelRef ? resolveModelRef(config, modelRef) : null
    const base = isPlainObject(alias) ? routeFields(alias) : {}
    const explicit = routeFields(step)
    const provider = explicit.provider ?? base.provider ?? null
    let model = explicit.model ?? base.model ?? null
    // A `model` that is itself an alias is legal only when no provider was
    // named; that mirrors `routeFromSettings` and keeps the two resolvers from
    // disagreeing about what a step means.
    if (!explicit.provider && typeof step.model === 'string' && step.model && !step.model.includes('/')) {
      const fromModel = resolveModelRef(config, step.model)
      if (fromModel?.provider && fromModel?.model) {
        model = fromModel.model
        return {
          index,
          ref: modelRef,
          provider: fromModel.provider,
          model,
          reasoningEffort: explicit.reasoningEffort ?? fromModel.reasoningEffort ?? null,
          temperature: explicit.temperature ?? fromModel.temperature,
          maxTokens: explicit.maxTokens ?? fromModel.maxTokens,
          valid: true,
          via: 'catalog',
          warning: null,
        }
      }
    }
    if (!explicit.provider && typeof model === 'string' && model.includes('/')) {
      const slash = model.indexOf('/')
      const splitProvider = model.slice(0, slash)
      const splitModel = model.slice(slash + 1)
      if (splitProvider && splitModel) {
        return {
          index,
          ref: modelRef,
          provider: splitProvider,
          model: splitModel,
          reasoningEffort: explicit.reasoningEffort ?? base.reasoningEffort ?? null,
          temperature: explicit.temperature ?? base.temperature,
          maxTokens: explicit.maxTokens ?? base.maxTokens,
          valid: true,
          via: base.provider ? 'catalog' : 'inline',
          warning: null,
        }
      }
    }
    const resolvedProvider = provider
    const resolvedModel = model
    const valid = Boolean(resolvedProvider && resolvedModel)
    return {
      index,
      ref: modelRef,
      provider: resolvedProvider,
      model: resolvedModel,
      reasoningEffort: explicit.reasoningEffort ?? base.reasoningEffort ?? null,
      temperature: explicit.temperature ?? base.temperature,
      maxTokens: explicit.maxTokens ?? base.maxTokens,
      valid,
      via: base.provider ? 'catalog' : 'inline',
      warning: valid ? null : 'a chain step needs a provider and a model (or a complete catalog alias)',
    }
  }

  return { index, ref: null, valid: false, via: 'inline', warning: 'a chain step must be a string or an object' }
}

/** The route object `routeFor` returns for one resolved step. */
function routeFromStep(step) {
  const out = {}
  if (step?.provider) out.provider = step.provider
  if (step?.model) out.model = step.model
  if (step?.reasoningEffort) out.reasoningEffort = step.reasoningEffort
  if (Number.isInteger(step?.maxTokens) && step.maxTokens > 0) out.maxTokens = step.maxTokens
  if (typeof step?.temperature === 'number') out.temperature = step.temperature
  return out
}

/**
 * Resolve an ordered model chain for one agent, category, or delegation call.
 *
 * `chain` on the agent wins over `chain` on the category. With neither, the
 * legacy single-route resolution is returned as a one-step chain, so callers
 * have one shape to reason about and every existing configuration keeps its
 * meaning. An explicit `override` (the delegation tool's provider/model
 * arguments) replaces step 0 and leaves the configured fallbacks after it.
 *
 * @returns `{source, steps, primary, warnings}`; steps are never filtered, so a
 *   UI or a log can show the invalid one that was skipped at runtime.
 */
export function chainFor(config, { agentId, category, override } = {}) {
  const agent = agentId ? agentSettings(config, agentId) : {}
  const cat = category ? categorySettings(config, category) : {}
  const agentChain = Array.isArray(agent.chain) ? agent.chain : null
  const categoryChain = Array.isArray(cat.chain) ? cat.chain : null
  let source = 'legacy'
  let raw = null
  if (agentChain && agentChain.length > 0) {
    source = 'agent'
    raw = agentChain
  } else if (categoryChain && categoryChain.length > 0) {
    source = 'category'
    raw = categoryChain
  }

  let steps
  if (raw) {
    steps = raw.map((step, index) => resolveChainStep(config, step, index))
  } else {
    const legacy = legacyRouteFor(config, { agentId, category, override })
    const provider = legacy.provider ?? null
    const model = legacy.model ?? null
    steps = [
      {
        index: 0,
        ref: null,
        ...routeFields(legacy),
        valid: Boolean(provider && model),
        via: 'legacy',
        warning: provider && model ? null : 'this session inherits the session model: no complete agent/category route is configured',
      },
    ]
    source = 'legacy'
  }

  if (override && (override.provider || override.model || override.reasoningEffort)) {
    const pick = routeFields(override)
    // A complete caller override is a standalone route: the primary's effort,
    // temperature, and token cap belong to the primary model, so they must not
    // leak onto a different route. A partial override still merges, which is what
    // lets the delegation tool name only one half and inherit the other.
    //
    // With a configured chain the merge base is the step that would actually run
    // (the first valid one), not the legacy resolver: the legacy resolver cannot
    // see a chain, so an effort-only override used to produce an invalid step 0
    // and silently promote the first fallback while dropping the effort.
    const overridden =
      pick.provider && pick.model
        ? pick
        : raw
          ? { ...routeFields(steps.find((step) => step.valid) ?? steps[0]), ...pick }
          : routeFields(legacyRouteFor(config, { agentId, category, override }))
    const valid = Boolean(overridden.provider && overridden.model)
    const first = {
      index: 0,
      ref: steps[0]?.ref ?? null,
      ...overridden,
      valid,
      via: 'override',
      warning: valid ? null : 'the delegation override is incomplete: it needs both provider and model',
    }
    steps = steps.length > 0 ? [first, ...steps.slice(1)] : [first]
    source = 'override'
  }

  const warnings = steps
    .filter((step) => !step.valid)
    .map((step) => ({ index: step.index, message: step.warning }))
  return {
    source,
    steps,
    primary: steps.find((step) => step.valid) ?? null,
    warnings,
  }
}

/**
 * The effective route for an agent/category, or the primary of its chain.
 *
 * With no `chain` this returns `legacyRouteFor` verbatim, including the partial
 * object a provider-only / temperature-only configuration used to produce. That
 * is the compatibility contract callers had before chains existed; a chain
 * changes the shape only when the user actually configured one.
 */
export function routeFor(config, options = {}) {
  const agent = options.agentId ? agentSettings(config, options.agentId) : {}
  const cat = options.category ? categorySettings(config, options.category) : {}
  const hasChain =
    (Array.isArray(agent.chain) && agent.chain.length > 0) ||
    (Array.isArray(cat.chain) && cat.chain.length > 0)
  if (!hasChain) return legacyRouteFor(config, options)
  return routeFromStep(chainFor(config, options).primary)
}

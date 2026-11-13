import { AGENT_IDS } from './constants.js'

/** Exact top-level keys of the resolved configuration. Tests lock this set. */
export const DEFAULT_CONFIG = Object.freeze({
  keywordHook: true,
  keywords: Object.freeze({ ultrawork: true, team: true, hyperplan: true }),
  agents: Object.freeze({}),
  categories: Object.freeze({}),
  models: Object.freeze({ catalog: Object.freeze({}) }),
  delegation: Object.freeze({
    maxConcurrent: 5,
    maxDepth: 1,
    defaultBackground: false,
    waitTimeoutMs: 600000,
    pollMs: 30000,
    childPreset: null,
  }),
  taskSystem: Object.freeze({ enabled: false }),
  ultrawork: Object.freeze({
    requirePlanGate: true,
    requireBaseline: true,
    dualEvidence: true,
    maxWaves: 8,
    maxContinuationRounds: 20,
  }),
  review: Object.freeze({ maxRounds: 2, highAccuracyDefault: false }),
  hooks: Object.freeze({
    todoContinuation: true,
    commentChecker: 'warn',
    rulesInjection: true,
    prometheusGuard: true,
    notepadGuard: true,
    planValidator: true,
    modelRouting: true,
  }),
  disabledHooks: Object.freeze([]),
  rules: Object.freeze({ paths: Object.freeze(['.omd/rules']), maxBytes: 65536 }),
  skills: Object.freeze({ paths: Object.freeze(['.omd/skills']) }),
  diagnostics: Object.freeze({ commands: Object.freeze([]) }),
  telemetry: false,
})

export const TOP_LEVEL_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIG))

/**
 * The neutral settings every role starts from, and the ones the capability-only
 * identity uses.
 *
 * A session whose preset is not an OMD one has no registry entry at all. Sharing
 * this exact object with it means a lookup miss can never hand it another role's
 * defaults, which is what `DEFAULT_AGENT_SETTINGS[id] ?? sisyphus` would do the
 * day a role grows a non-neutral default.
 */
export const NEUTRAL_AGENT_SETTINGS = Object.freeze({
  provider: null,
  model: null,
  modelRef: null,
  chain: null,
  reasoningEffort: null,
  temperature: null,
  maxTokens: null,
  promptAppend: '',
  readOnly: null,
  canDelegate: null,
  allowedSubagents: null,
})

export const DEFAULT_AGENT_SETTINGS = Object.freeze(
  Object.fromEntries(AGENT_IDS.map((id) => [id, NEUTRAL_AGENT_SETTINGS])),
)

export const DEFAULT_CATEGORIES = Object.freeze({
  'visual-engineering': Object.freeze({
    description: 'Frontend, UI/UX, design, styling, animation',
  }),
  ultrabrain: Object.freeze({
    description: 'Hard logic and architecture decisions requiring deep analysis',
  }),
  deep: Object.freeze({
    description: 'Goal-oriented autonomous problem solving',
  }),
  artistry: Object.freeze({
    description: 'Creative and artistic tasks with novel ideas',
  }),
  quick: Object.freeze({
    description: 'Trivial single-file changes, typo fixes, small edits',
  }),
  'unspecified-low': Object.freeze({
    description: 'Tasks outside the other categories with low effort',
  }),
  'unspecified-high': Object.freeze({
    description: 'Tasks outside the other categories with high effort',
  }),
  writing: Object.freeze({
    description: 'Documentation, prose, and technical writing',
  }),
})

export function cloneDefaults() {
  return structuredClone(DEFAULT_CONFIG)
}

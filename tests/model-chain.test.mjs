/**
 * Ordered model chains: the resolution contract shared by delegation, the
 * settings page, and the runtime fallback hook.
 *
 * The single-route behavior is asserted alongside the new shape because every
 * existing `.omd/config.jsonc` must keep its meaning.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { chainFor, resolveChainStep, routeFor } from '../src/core/config.js'

const base = {
  models: {
    catalog: {
      strong: { provider: 'deepseek-account', model: 'deepseek-v4', reasoningEffort: 'max' },
      backup: { provider: 'backup-provider', model: 'backup-model', temperature: 0.2, maxTokens: 16000 },
    },
  },
  agents: {},
  categories: {},
}

function config(overrides = {}) {
  return {
    ...structuredClone(base),
    ...overrides,
    agents: { ...base.agents, ...(overrides.agents ?? {}) },
    categories: { ...base.categories, ...(overrides.categories ?? {}) },
    models: overrides.models ?? structuredClone(base.models),
  }
}

test('the legacy single-route resolution is unchanged and becomes a one-step chain', () => {
  const configs = {
    route: config({ agents: { oracle: { provider: 'p', model: 'm', reasoningEffort: 'high', temperature: 0.1 } } }),
    ref: config({ agents: { oracle: { modelRef: 'strong' } } }),
    category: config({ categories: { deep: { modelRef: 'strong' } } }),
  }
  assert.deepEqual(routeFor(configs.route, { agentId: 'oracle' }), {
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
    temperature: 0.1,
  })
  assert.deepEqual(routeFor(configs.ref, { agentId: 'oracle' }), {
    provider: 'deepseek-account',
    model: 'deepseek-v4',
    reasoningEffort: 'max',
  })
  assert.deepEqual(routeFor(configs.category, { category: 'deep' }), {
    provider: 'deepseek-account',
    model: 'deepseek-v4',
    reasoningEffort: 'max',
  })
  const chain = chainFor(configs.ref, { agentId: 'oracle' })
  assert.equal(chain.source, 'legacy')
  assert.equal(chain.steps.length, 1)
  assert.equal(chain.steps[0].via, 'legacy')
  assert.equal(chain.primary.provider, 'deepseek-account')
})

test('an agent chain resolves catalog aliases, exact routes, and inline fields in order', () => {
  const configs = config({
    agents: {
      oracle: {
        chain: [
          'strong',
          'backup-provider/backup-model',
          { modelRef: 'backup', reasoningEffort: 'low', maxTokens: 8000 },
          { provider: 'inline-provider', model: 'inline-model', temperature: 0.4 },
        ],
      },
    },
  })
  const chain = chainFor(configs, { agentId: 'oracle' })
  assert.equal(chain.source, 'agent')
  assert.deepEqual(
    chain.steps.map((step) => [step.index, step.provider, step.model, step.valid, step.via]),
    [
      [0, 'deepseek-account', 'deepseek-v4', true, 'catalog'],
      [1, 'backup-provider', 'backup-model', true, 'route'],
      [2, 'backup-provider', 'backup-model', true, 'catalog'],
      [3, 'inline-provider', 'inline-model', true, 'inline'],
    ],
  )
  assert.equal(chain.steps[0].reasoningEffort, 'max')
  assert.equal(chain.steps[2].reasoningEffort, 'low')
  assert.equal(chain.steps[2].maxTokens, 8000)
  assert.equal(chain.steps[3].temperature, 0.4)
  assert.deepEqual(routeFor(configs, { agentId: 'oracle' }), {
    provider: 'deepseek-account',
    model: 'deepseek-v4',
    reasoningEffort: 'max',
  })
})

test('a category chain is used only when no agent chain applies', () => {
  const configs = config({
    agents: { oracle: { chain: ['strong'] } },
    categories: { deep: { chain: ['backup'] } },
  })
  const agentChain = chainFor(configs, { agentId: 'oracle' })
  assert.equal(agentChain.source, 'agent')
  assert.equal(agentChain.primary.provider, 'deepseek-account')

  const categoryChain = chainFor(configs, { category: 'deep' })
  assert.equal(categoryChain.source, 'category')
  assert.equal(categoryChain.primary.provider, 'backup-provider')

  // Both named: the agent chain wins, mirroring `routeFor`'s older precedence.
  assert.equal(chainFor(configs, { agentId: 'oracle', category: 'deep' }).source, 'agent')
})

test('an invalid step is reported but a later valid step still becomes the primary', () => {
  const configs = config({
    agents: { oracle: { chain: ['missing-alias', { provider: 'p' }, 'strong'] } },
  })
  const chain = chainFor(configs, { agentId: 'oracle' })
  assert.equal(chain.steps[0].valid, false)
  assert.match(chain.steps[0].warning, /unknown model alias/)
  assert.equal(chain.steps[1].valid, false)
  assert.match(chain.steps[1].warning, /provider and a model/)
  assert.equal(chain.primary.model, 'deepseek-v4')
  assert.deepEqual(
    chain.warnings.map((warning) => warning.index),
    [0, 1],
  )
  assert.equal(routeFor(configs, { agentId: 'oracle' }).provider, 'deepseek-account')
})

test('a chain step object needs both parts unless a complete alias supplies them', () => {
  assert.equal(resolveChainStep(config(), { provider: 'p' }).valid, false)
  assert.equal(resolveChainStep(config(), { model: 'm' }).valid, false)
  assert.equal(resolveChainStep(config(), {}).valid, false)
  assert.equal(resolveChainStep(config(), 42).valid, false)
  assert.equal(resolveChainStep(config(), '').valid, false)

  const aliasOnly = resolveChainStep(config(), { modelRef: 'strong' })
  assert.equal(aliasOnly.valid, true)
  assert.equal(aliasOnly.provider, 'deepseek-account')
  assert.equal(aliasOnly.reasoningEffort, 'max')

  const aliasOverride = resolveChainStep(config(), { modelRef: 'strong', provider: 'other', model: 'other-model' })
  assert.equal(aliasOverride.provider, 'other')
  assert.equal(aliasOverride.model, 'other-model')

  const split = resolveChainStep(config(), { model: 'provider/model' })
  assert.equal(split.provider, 'provider')
  assert.equal(split.model, 'model')

  const modelAlias = resolveChainStep(config(), { model: 'strong' })
  assert.equal(modelAlias.provider, 'deepseek-account')
  assert.equal(modelAlias.model, 'deepseek-v4')
})

test('an explicit delegation override replaces step 0 and keeps the configured fallbacks', () => {
  const configs = config({
    agents: { oracle: { chain: ['strong', 'backup'] } },
  })
  const chain = chainFor(configs, {
    agentId: 'oracle',
    override: { provider: 'caller-provider', model: 'caller-model', reasoningEffort: 'low' },
  })
  assert.equal(chain.source, 'override')
  assert.deepEqual([chain.steps[0].provider, chain.steps[0].model, chain.steps[0].reasoningEffort], [
    'caller-provider',
    'caller-model',
    'low',
  ])
  assert.equal(chain.steps[1].model, 'backup-model')
  assert.deepEqual(routeFor(configs, { agentId: 'oracle', override: { provider: 'p', model: 'm' } }), {
    provider: 'p',
    model: 'm',
  })
})

test('a partial delegation override overlays the configured primary instead of promoting a fallback', () => {
  const configs = config({
    agents: { oracle: { chain: ['strong', 'backup'] } },
  })
  // An effort-only override is a request about the route this call would have
  // used, which is step 0. Merging it through the legacy resolver invalidated
  // step 0 (that resolver cannot see a chain) and the first fallback silently
  // became the model that ran, with the requested effort dropped.
  assert.deepEqual(routeFor(configs, { agentId: 'oracle', override: { reasoningEffort: 'low' } }), {
    provider: 'deepseek-account',
    model: 'deepseek-v4',
    reasoningEffort: 'low',
  })
  const chain = chainFor(configs, { agentId: 'oracle', override: { reasoningEffort: 'low' } })
  assert.equal(chain.source, 'override')
  assert.equal(chain.primary.index, 0)
  assert.equal(chain.steps[1].model, 'backup-model')
  // One half of the route is inherited from the primary, as the legacy merge did.
  assert.deepEqual(routeFor(configs, { agentId: 'oracle', override: { provider: 'caller' } }), {
    provider: 'caller',
    model: 'deepseek-v4',
    reasoningEffort: 'max',
  })
  // The merge base is the step that would run, so an invalid step 0 does not
  // swallow the effort either.
  const broken = config({ agents: { oracle: { chain: ['no-such-alias', 'backup'] } } })
  assert.deepEqual(routeFor(broken, { agentId: 'oracle', override: { reasoningEffort: 'low' } }), {
    provider: 'backup-provider',
    model: 'backup-model',
    reasoningEffort: 'low',
    temperature: 0.2,
    maxTokens: 16000,
  })
})

test('routeFor keeps the legacy partial object when no chain exists', () => {
  // These shapes were legal before chains (and still are); changing them to an
  // empty object would be a silent contract break for callers of `routeFor`.
  const partials = config({
    agents: {
      oracle: { provider: 'provider-only' },
      metis: { temperature: 0.1 },
      momus: { provider: 'p', model: 'm', reasoningEffort: 'high', maxTokens: 1000, temperature: 0.1 },
    },
  })
  assert.deepEqual(routeFor(partials, { agentId: 'oracle' }), { provider: 'provider-only' })
  assert.deepEqual(routeFor(partials, { agentId: 'metis' }), { temperature: 0.1 })
  assert.deepEqual(
    routeFor(partials, { agentId: 'momus', override: { provider: 'override-provider', model: 'override-model' } }),
    {
      provider: 'override-provider',
      model: 'override-model',
      reasoningEffort: 'high',
      maxTokens: 1000,
      temperature: 0.1,
    },
  )
})

test('the delegated category route uses the category chain, not the junior role chain', () => {
  const configs = config({
    agents: { 'sisyphus-junior': { chain: ['strong'] } },
    categories: { quick: { chain: ['backup', 'strong'] } },
  })
  const chain = chainFor(configs, { agentId: null, category: 'quick' })
  assert.equal(chain.source, 'category')
  assert.deepEqual(chain.steps.map((step) => step.model), ['backup-model', 'deepseek-v4'])
})

test('a catalog entry without provider and model makes the step invalid', () => {
  const configs = config({
    models: { catalog: { broken: { reasoningEffort: 'max' }, strong: base.models.catalog.strong } },
    agents: { oracle: { chain: ['broken'] } },
  })
  const chain = chainFor(configs, { agentId: 'oracle' })
  assert.equal(chain.primary, null)
  assert.match(chain.steps[0].warning, /needs provider and model/)
})

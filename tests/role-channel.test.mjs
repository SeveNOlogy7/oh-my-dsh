import test from 'node:test'
import assert from 'node:assert/strict'

import { ROLE_LABEL_PREFIX, categoryFromLabel, roleFromLabel, roleLabelFor } from '../src/agents/registry.js'
import { resolveDescriptorRole, resolveDescriptorRoleInfo } from '../src/state/active-role.js'
import { createFakeContext, descriptorEvent, emit } from './helpers/fake-context.mjs'
import { apply } from '../src/runtime/index.js'

/**
 * The role channel.
 *
 * A delegated child cannot receive an OMD-specific field: DSH's child
 * composition accepts only `agentPreset`/`persona`/`toolFilter`, and the latter
 * two are replayed on cold resume only. So the role rides the subagent
 * descriptor's durable `label` instead, and the runtime reads it back off the
 * child's own session log. These tests pin that contract on both ends: the
 * writer (the label format) and the reader.
 */

test('the label prefix is the one DSH stores verbatim', () => {
  assert.equal(ROLE_LABEL_PREFIX, 'omd:')
  assert.equal(roleLabelFor('oracle'), 'omd:oracle')
})

test('roleFromLabel accepts only a real OMD role', () => {
  assert.equal(roleFromLabel('omd:oracle'), 'oracle')
  assert.equal(roleFromLabel('omd:sisyphus-junior'), 'sisyphus-junior')
  // An unknown role must not be invented, and it must not fall through to the
  // capability-only identity by accident either — both ends answer `null`.
  assert.equal(roleFromLabel('omd:nope'), null)
  // A bare preset id is not a label: the prefix is what distinguishes a role
  // from a preset the deployment happens to name.
  assert.equal(roleFromLabel('standard'), null)
  assert.equal(roleFromLabel('omd:'), null)
  assert.equal(roleFromLabel(''), null)
  assert.equal(roleFromLabel(undefined), null)
  assert.equal(roleFromLabel(null), null)
  assert.equal(roleFromLabel(42), null)
  assert.equal(roleFromLabel({ label: 'omd:oracle' }), null)
})

test('a label can carry the category the delegation routed through', () => {
  assert.equal(roleLabelFor('sisyphus-junior', 'quick'), 'omd:sisyphus-junior@quick')
  assert.equal(roleLabelFor('sisyphus-junior', 'my category/with spaces'), 'omd:sisyphus-junior@my%20category%2Fwith%20spaces')
  assert.equal(roleLabelFor('sisyphus-junior', null), 'omd:sisyphus-junior')
  assert.equal(roleLabelFor('sisyphus-junior', ''), 'omd:sisyphus-junior')

  const label = roleLabelFor('sisyphus-junior', 'my category/with spaces')
  assert.equal(roleFromLabel(label), 'sisyphus-junior')
  assert.equal(categoryFromLabel(label), 'my category/with spaces')
  // A plain role label and an invalid one carry no category.
  assert.equal(categoryFromLabel('omd:oracle'), null)
  assert.equal(categoryFromLabel('omd:nope@quick'), null)
  assert.equal(categoryFromLabel('omd:oracle@'), null)
  assert.equal(categoryFromLabel('omd:oracle@%E0%A4%A'), null)
  assert.equal(categoryFromLabel(42), null)
})

test('resolveDescriptorRoleInfo reads the role and category off the session log', async () => {
  const seen = await resolveDescriptorRoleInfo(
    createFakeContext({ cwd: process.cwd(), role: 'sisyphus-junior', events: [descriptorEvent('sisyphus-junior', 'quick')] }).ctx,
    { id: 'session-1' },
  )
  assert.deepEqual(seen, { role: 'sisyphus-junior', category: 'quick' })
  // A plain role label from an older build still resolves the role and leaves
  // the category unset.
  const plain = await resolveDescriptorRoleInfo(
    createFakeContext({ cwd: process.cwd(), role: 'sisyphus-junior' }).ctx,
    { id: 'session-1' },
  )
  assert.deepEqual(plain, { role: 'sisyphus-junior', category: null })
})

test('resolveDescriptorRole reads the role off the session log', async () => {
  const seen = await resolveDescriptorRole(
    createFakeContext({ cwd: process.cwd(), role: 'oracle' }).ctx,
    { id: 'session-1' },
  )
  assert.equal(seen, 'oracle')
})

test('resolveDescriptorRole answers null, and never throws, without a descriptor', async () => {
  // A session with no descriptor at all: an ordinary session, or the parent of
  // a delegation. It must read as capability-only rather than failing.
  const bare = createFakeContext({ cwd: process.cwd() }).ctx
  assert.equal(await resolveDescriptorRole(bare, { id: 'session-1' }), null)

  // A descriptor whose label is not an OMD role is skipped, not treated as a
  // decision: an unrelated label must not mask a later real one.
  const unrelated = createFakeContext({
    cwd: process.cwd(),
    events: [
      { type: 'subagent/descriptor', data: { label: 'some-other-plugin:thing' } },
      descriptorEvent('metis'),
    ],
  }).ctx
  assert.equal(await resolveDescriptorRole(unrelated, { id: 'session-1' }), 'metis')

  // No context, no services, no agent: still null, never a throw.
  assert.equal(await resolveDescriptorRole(undefined, undefined), null)
  assert.equal(await resolveDescriptorRole({ get: () => { throw new Error('no service') } }, { id: 's' }), null)
})

test('resolveDescriptorRole takes the last descriptor, so a child outranks a forked ancestor', async () => {
  const { ctx } = createFakeContext({
    cwd: process.cwd(),
    events: [descriptorEvent('sisyphus'), descriptorEvent('librarian')],
  })
  assert.equal(await resolveDescriptorRole(ctx, { id: 'session-1' }), 'librarian')
})

test('a role only the persisted log carries is still resolved', async () => {
  // The live session has no events yet (a resumed Session whose in-memory log
  // was not replayed), so the role can only come from the on-disk log. DSH's
  // `sessionQuery.readSession` is a class method reading `this._corpus`; the
  // fake mirrors that by reading `this.events`, so a caller that extracts the
  // method and calls it detached fails here exactly as it did in production —
  // where the thrown TypeError was swallowed and reported as "no role".
  const { ctx } = createFakeContext({ cwd: process.cwd(), events: [] })
  ctx.sessionQuery.events = [descriptorEvent('oracle')]
  assert.equal(await resolveDescriptorRole(ctx, { id: 'session-1' }), 'oracle')
})

test('a session resolves its role through the delegation channel, not through the preset', async () => {
  // `preset: 'standard'` is deliberately a non-OMD preset: under the old
  // architecture this session would have been capability-only. The role now
  // comes from the descriptor label alone.
  const { ctx, agent, state } = createFakeContext({ cwd: process.cwd(), agentPreset: 'standard', role: 'atlas' })
  for (const name of ['read', 'write', 'edit', 'pwsh', 'grep', 'glob']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, {})
  await emit(ctx, 'agent/created', { agent })
  await dispose.runtime.stateFor(agent)
  try {
    assert.equal((await dispose.runtime.roleFor(agent)), 'atlas')
    const persona = state.sections.find((section) => section.name === 'deployment:persona-prefix')
    assert.ok(persona, 'the role persona section is registered')
    assert.match(persona.text(), /Atlas/, 'the delegated role persona is live')
    // Atlas is read-only, so the role policy must be enforced even though the
    // session runs a non-OMD preset.
    assert.ok(
      state.restrictions.some((filter) => filter.deny?.includes('write') && filter.deny?.includes('edit')),
      'the delegated role installs its tool policy',
    )
  } finally {
    dispose()
  }
})

test('a session with no descriptor stays capability-only', async () => {
  const { ctx, agent, state } = createFakeContext({ cwd: process.cwd(), agentPreset: 'standard' })
  for (const name of ['read', 'write', 'edit']) {
    state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  const dispose = apply(ctx, {})
  await emit(ctx, 'agent/created', { agent })
  await dispose.runtime.stateFor(agent)
  try {
    assert.equal((await dispose.runtime.roleFor(agent)), null)
    const persona = state.sections.find((section) => section.name === 'deployment:persona-prefix')
    assert.equal(persona.text(), '', 'no role means no persona')
  } finally {
    dispose()
  }
})

/**
 * Independent acceptance test for the single top-level OMD runtime row.
 *
 * Written by the verification pass, deliberately NOT mirroring
 * `tests/runtime.test.mjs`:
 *
 *  - the per-role tool policy is checked against a policy matrix stated here in
 *    full (the historical OmO 4.19.4 contract), not against `src/agents/*`;
 *  - the effective tool surface is recomputed from the restrictions the row
 *    actually installed, using DSH's documented semantics
 *    (`@deepseek-ai/dsh-tools` `ToolLayer.admits`: every filter must admit the
 *    name, `allow` is a whitelist, `deny` a blacklist);
 *  - the preset switch is driven ONLY by the `agent-preset/selected` payload the
 *    picker emits; `ctx.sessions.get` is never restubbed, so the test fails if
 *    the row needs a second read of the session log to notice the switch;
 *  - `omd_delegate` is checked by inspecting the activation request it really
 *    hands to the subagent service, not by reading its source;
 *  - the shipped patch files are asserted from disk as well, because C4
 *    ("exactly one top-level runtime row, zero nested") is a property of the
 *    shipped bytes; `dsh --profile <p> --dump-config` is the E2E counterpart.
 *
 * Scratch workspaces live under the OS temp directory (the convention this
 * suite already uses) and every one is removed again in `after()`.
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply } from '../src/runtime/index.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

/** The eleven OMD roles, written out as the contract states them. */
const ROLE_IDS = [
  'sisyphus',
  'hephaestus',
  'prometheus',
  'atlas',
  'oracle',
  'librarian',
  'explore',
  'multimodal-looker',
  'metis',
  'momus',
  'sisyphus-junior',
]

/**
 * The historical per-role policy: whether the role may mutate files, whether it
 * may delegate, and (for the looker) the exact allowlist.
 */
const POLICY = {
  sisyphus: { write: true, delegate: true },
  hephaestus: { write: true, delegate: true },
  prometheus: { write: true, delegate: true },
  atlas: { write: false, delegate: true },
  oracle: { write: false, delegate: false },
  librarian: { write: false, delegate: false },
  explore: { write: false, delegate: false },
  'multimodal-looker': {
    write: false,
    delegate: false,
    allow: ['read', 'read_image', 'glob', 'grep', 'omd_doctor'],
  },
  metis: { write: false, delegate: false },
  momus: { write: false, delegate: false },
  'sisyphus-junior': { write: true, delegate: false },
}

/** Base DSH tools every shipped preset composes, plus the looker's read_image. */
const BASE_TOOLS = ['read', 'write', 'edit', 'read_image', 'pwsh', 'grep', 'glob', 'todo_write']

const roots = []

after(async () => {
  for (const root of roots) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }
})

/**
 * Build one scratch workspace and mount the row the way
 * `presets/omd-runtime.patch.yml` does: `apply(ctx, {})`, no `agent` key.
 *
 * The workspace config pins the keys these assertions depend on, so a user-level
 * `~/.omd/config.jsonc` cannot change the outcome.
 */
async function mount({ preset = 'standard', agent, lsp = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-global-row-'))
  roots.push(root)
  const workspace = path.join(root, 'project')
  await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
  await fs.writeFile(
    path.join(workspace, '.omd', 'config.jsonc'),
    JSON.stringify({
      taskSystem: { enabled: false },
      hooks: { prometheusGuard: true, notepadGuard: true },
      delegation: { defaultBackground: false },
    }),
  )

  const fake = createFakeContext({ cwd: workspace, agentPreset: preset })
  for (const name of BASE_TOOLS) {
    fake.state.tools.push({ name, description: name, parameters: { type: 'object' } })
  }
  // `omd_lsp` registers only when the host exposes an LSP service
  // (src/tools/misc.js). The shipped web profile mounts none, so dropping it
  // here keeps this fake's conditional-tool set closer to the shipped one. The
  // separate LSP test below pins the opposite case. `omd_look_at` registers in
  // both places: the fake provides fs/attachments/subagents, and the shipped
  // probe measures it present for the four delegating roles.
  if (!lsp) delete fake.ctx.lsp

  const dispose = apply(fake.ctx, agent === undefined ? {} : { agent })
  await emit(fake.ctx, 'agent/created', { agent: fake.agent })
  await waitFor(() => fake.state.sections.some((section) => section.name === 'deployment:persona-prefix'))

  return { ...fake, workspace, dispose }
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for a condition')
}

function section(state, name) {
  const found = state.sections.find((entry) => entry.name === name)
  assert.ok(found, `prompt section ${name} must be registered`)
  return found
}

/** The names DSH would let this agent call, given the restrictions it installed. */
function effectiveTools(state) {
  return state.tools
    .map((tool) => tool.name)
    .filter((name) =>
      state.restrictions.every((filter) => {
        if (filter.allow && !filter.allow.includes(name)) return false
        if (filter.deny && filter.deny.includes(name)) return false
        return true
      }),
    )
}

function omdNames(names) {
  return names.filter((name) => name.startsWith('omd_')).sort()
}

test('C4: the preset patch set declares the runtime row exactly once, at the top level, with no agent key', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const patches = pkg.dsh.bundle.patch
  assert.equal(patches[0], './presets/omd-runtime.patch.yml', 'the runtime row is listed first')
  assert.equal(patches.length, 13, 'runtime + 11 role presets + the UI asset')
  assert.deepEqual(
    patches.slice(1, 12).sort(),
    ROLE_IDS.map((id) => `./presets/omd-${id}.patch.yml`).sort(),
  )
  assert.equal(patches[12], './presets/omd-ui.patch.yml')

  const presetsDir = path.join(ROOT, 'presets')
  const files = (await fs.readdir(presetsDir)).filter((file) => file.endsWith('.patch.yml'))
  assert.equal(files.length, 13, '11 role presets + runtime + UI')

  const pinning = []
  for (const file of files) {
    const body = await fs.readFile(path.join(presetsDir, file), 'utf8')
    for (const line of body.split('\n')) {
      if (line.includes('@jhcai11/oh-my-dsh') && line.trim().startsWith('name:')) {
        pinning.push({ file, line: line.trim() })
      }
    }
  }
  assert.deepEqual(pinning, [
    { file: 'omd-runtime.patch.yml', line: 'name: "@jhcai11/oh-my-dsh"' },
  ])

  const runtimePatch = await fs.readFile(path.join(presetsDir, 'omd-runtime.patch.yml'), 'utf8')
  const runtimeBody = runtimePatch
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
  assert.equal(runtimeBody[0], '- insert:', 'the row must be inserted at the patch top level')
  assert.deepEqual(runtimeBody, [
    '- insert:',
    '    - id: omd-runtime',
    '      name: "@jhcai11/oh-my-dsh"',
  ])
  assert.doesNotMatch(runtimePatch, /^\s*agent:/m, 'the runtime row must not pin an agent')
  assert.doesNotMatch(runtimePatch, /^\s*config:/m, 'the runtime row carries no config at all')

  for (const id of ROLE_IDS) {
    const body = await fs.readFile(path.join(presetsDir, `omd-${id}.patch.yml`), 'utf8')
    assert.match(body, new RegExp(`id: omd-${id}\\b`), `omd-${id}.patch.yml declares its preset id`)
    assert.match(body, /name: '@deepseek-ai\/dsh-agent-preset'/)
    assert.doesNotMatch(body, /oh-my-dsh/, `omd-${id}.patch.yml must not mount the runtime row`)
    assert.doesNotMatch(body, /^\s*agent:/m, `omd-${id}.patch.yml must not name an agent`)
  }
})

test('C1: a non-OMD preset gets the orchestration surface, an empty persona, and no role policy', async () => {
  const env = await mount({ preset: 'standard' })
  try {
    const names = env.state.tools.map((tool) => tool.name)
    assert.ok(names.includes('omd_delegate'), 'capability-only keeps orchestration')
    assert.ok(names.includes('omd_background_output'))
    assert.ok(names.includes('omd_doctor'))
    assert.ok(names.includes('omd_mode'))
    assert.ok(names.includes('omd_status'))

    // An empty persona, but still a *lazy* section so the role can arrive later.
    const persona = section(env.state, 'deployment:persona-prefix')
    assert.equal(typeof persona.text, 'function', 'the persona must be read at request time')
    assert.equal(persona.text(), '', 'capability-only injects no OMD persona')
    assert.equal(section(env.state, 'omd:rules').text(), '')
    assert.equal(section(env.state, 'omd:mode').text(), '')

    // No role policy: write/edit/delegate survive, and the only thing denied is
    // the task surface, which is off by default config.
    const effective = effectiveTools(env.state)
    for (const name of ['write', 'edit', 'omd_delegate', 'omd_background_output', 'omd_background_cancel', 'omd_background_list']) {
      assert.ok(effective.includes(name), `${name} must stay visible to a capability-only session`)
    }
    assert.ok(env.state.restrictions.length > 0, 'the default-off task surface is denied')
    for (const filter of env.state.restrictions) {
      assert.equal(filter.allow, undefined, 'capability-only must not install an allowlist')
      assert.ok(filter.deny?.length)
      for (const name of filter.deny) {
        assert.match(name, /^omd_task_/, `${name} must not be denied to a capability-only session`)
      }
    }
    assert.deepEqual(
      effective.filter((name) => !name.startsWith('omd_task_')).sort(),
      BASE_TOOLS
        .concat([
          'omd_delegate',
          'omd_background_output',
          'omd_background_cancel',
          'omd_background_list',
          'omd_session_list',
          'omd_session_read',
          'omd_session_search',
          'omd_notepad',
          'omd_mode',
          'omd_status',
          'omd_doctor',
          'omd_diagnostics',
          'omd_ui_status',
          'omd_look_at',
        ])
        .sort(),
      'exactly the capability surface is visible (the shipped probe measured one fewer omd_* because omd_look_at did not register there)',
    )
  } finally {
    env.dispose()
  }
})

test('a host that provides an LSP service adds omd_lsp and nothing else', async () => {
  const withLsp = await mount({ preset: 'omd-oracle', lsp: true })
  const withoutLsp = await mount({ preset: 'omd-oracle' })
  try {
    const a = omdNames(effectiveTools(withLsp.state))
    const b = omdNames(effectiveTools(withoutLsp.state))
    assert.ok(b.includes('omd_lsp') === false)
    assert.deepEqual(a, [...b, 'omd_lsp'].sort(), 'the only difference an LSP service makes is omd_lsp')
  } finally {
    withLsp.dispose()
    withoutLsp.dispose()
  }
})

test('a capability-only session exposes no delegate tool it cannot use', async () => {
  const env = await mount({ preset: 'standard' })
  try {
    const delegate = env.state.tools.find((tool) => tool.name === 'omd_delegate')
    const result = await delegate.execute(
      { prompt: 'noop', subagent_type: 'oracle', run_in_background: true },
      { agent: env.agent, signal: new AbortController().signal },
    )
    assert.match(result, /started background task bg_/, 'a role-less session may delegate')
  } finally {
    env.dispose()
  }
})

test('C2: each of the eleven OMD presets keeps its historical tool policy', async () => {
  for (const id of ROLE_IDS) {
    const env = await mount({ preset: `omd-${id}` })
    try {
      const expected = POLICY[id]
      const effective = effectiveTools(env.state)

      assert.equal(
        effective.includes('write') && effective.includes('edit'),
        expected.write,
        `omd-${id}: write/edit visibility`,
      )
      assert.equal(
        effective.includes('omd_delegate'),
        expected.delegate,
        `omd-${id}: omd_delegate visibility`,
      )
      assert.equal(
        effective.includes('omd_look_at'),
        expected.delegate,
        `omd-${id}: omd_look_at follows delegation`,
      )
      assert.deepEqual(
        effective.includes('omd_background_output'),
        expected.delegate,
        `omd-${id}: background tools follow delegation`,
      )

      const omd = omdNames(effective)
      if (expected.allow) {
        assert.deepEqual(
          [...effective].sort(),
          [...expected.allow].sort(),
          `omd-${id} is an allowlist and nothing else`,
        )
      } else if (expected.delegate) {
        assert.ok(omd.includes('omd_delegate'), `omd-${id} keeps omd_delegate`)
        assert.ok(omd.length > 9, `omd-${id} keeps the full orchestration surface`)
      } else {
        assert.equal(omd.length, 9, `omd-${id} sees exactly the nine non-delegating omd_* tools`)
        assert.deepEqual(omd, [
          'omd_diagnostics',
          'omd_doctor',
          'omd_mode',
          'omd_notepad',
          'omd_session_list',
          'omd_session_read',
          'omd_session_search',
          'omd_status',
          'omd_ui_status',
        ])
      }
    } finally {
      env.dispose()
    }
  }
})

test('a row that still names an agent resolves that role without asking the session', async () => {
  const env = await mount({ agent: 'oracle', preset: 'standard' })
  try {
    const persona = section(env.state, 'deployment:persona-prefix')
    const oraclePrompt = (await fs.readFile(path.join(ROOT, 'prompts', 'agents', 'oracle.md'), 'utf8')).trim()
    assert.ok(persona.text().includes(oraclePrompt), 'a pinned row uses its own role prompt')
    const effective = effectiveTools(env.state)
    assert.equal(effective.includes('write'), false)
    assert.equal(effective.includes('omd_delegate'), false)
    assert.ok(effective.includes('read'))
  } finally {
    env.dispose()
  }
})

test('C3: a preset selected before the first turn changes the persona and starts enforcing its write scope', async () => {
  const env = await mount({ preset: 'standard' })
  try {
    const persona = section(env.state, 'deployment:persona-prefix')
    const guard = env.state.guards[0]
    assert.ok(guard, 'the write-scope guard is installed')

    assert.equal(persona.text(), '')
    assert.equal(
      guard({ name: 'write', arguments: { file_path: path.join(env.workspace, 'src', 'a.ts') } }),
      undefined,
      'a role-less session has no write scope',
    )

    // Exactly what the picker emits. No session-log restub: the payload alone
    // must be enough.
    await emit(env.ctx, 'agent-preset/selected', env.agent.id, 'omd-prometheus')

    const prometheusPrompt = (await fs.readFile(path.join(ROOT, 'prompts', 'agents', 'prometheus.md'), 'utf8')).trim()
    const contract = (await fs.readFile(path.join(ROOT, 'prompts', 'agents', '_contract.md'), 'utf8')).trim()
    const text = persona.text()
    assert.ok(text.includes(prometheusPrompt), 'the Prometheus persona must be live after the switch')
    assert.ok(text.includes(contract), 'the shared contract still composes')
    assert.equal(text.includes('OMD strategic planner'), true)

    const denied = guard({ name: 'write', arguments: { file_path: path.join(env.workspace, 'src', 'a.ts') } })
    assert.match(String(denied), /OMD write scope/, 'the Prometheus write scope must be enforced now')
    assert.match(String(denied), /\.omd/)
    assert.equal(guard({ name: 'write', arguments: { file_path: path.join(env.workspace, '.omd', 'plans', 'a.md') } }), undefined)

    // Prometheus is not read-only, so the switch installs no role deny. The
    // disposer lifts the previous policy rather than the new one stacking on
    // top of it, so the ACTIVE set must be exactly what the new role implies:
    // one filter, the task-system deny. (Lead note: this assertion replaces an
    // earlier `restrictions.length > before`, which only held while the fake
    // context returned a no-op disposer. See the reverse-switch test in
    // tests/runtime.test.mjs for the lifting half.)
    assert.equal(env.state.restrictions.length, 1, 'a switch replaces the policy instead of stacking it')
    const active = env.state.restrictions[0]
    assert.ok(
      active.deny.every((name) => name.startsWith('omd_task_')),
      'only the task-system deny remains for a non-read-only role',
    )
    assert.ok(!active.deny.includes('write'), 'Prometheus keeps write')
    assert.ok(!active.deny.includes('omd_delegate'), 'Prometheus keeps delegation')

    // A read-only role selected the same way must add the role deny.
    await emit(env.ctx, 'agent-preset/selected', env.agent.id, 'omd-oracle')
    const oracleDeny = env.state.restrictions.find(
      (filter) => filter.deny?.includes('write') && filter.deny?.includes('edit'),
    )
    assert.ok(oracleDeny, 'switching to a read-only role installs its deny')
    assert.ok(oracleDeny.deny.includes('omd_delegate'))
    assert.ok(!oracleDeny.deny.includes('read'))
    assert.equal(
      guard({ name: 'write', arguments: { file_path: path.join(env.workspace, 'src', 'a.ts') } }),
      undefined,
      'oracle has no write scope of its own; the deny filter carries that policy',
    )
  } finally {
    env.dispose()
  }
})

test('delegation pins the child preset to omd-<subagent_type>, so all eleven must stay registered', async () => {
  const env = await mount({ preset: 'omd-sisyphus' })
  try {
    const delegate = env.state.tools.find((tool) => tool.name === 'omd_delegate')
    await delegate.execute(
      { prompt: 'review this', subagent_type: 'oracle', run_in_background: true },
      { agent: env.agent, signal: new AbortController().signal },
    )
    await waitFor(() => env.state.activations.length > 0)
    assert.equal(env.state.activations[0].request.agentPreset, 'omd-oracle')

    await delegate.execute(
      { prompt: 'quick job', category: 'quick', run_in_background: true },
      { agent: env.agent, signal: new AbortController().signal },
    )
    await waitFor(() => env.state.activations.length > 1)
    assert.equal(env.state.activations[1].request.agentPreset, 'omd-sisyphus-junior')
    assert.equal(env.state.activations[1].request.prompt[0].text.includes('<omd-delegation target="quick"'), true)
  } finally {
    env.dispose()
  }
})

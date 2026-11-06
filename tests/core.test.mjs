import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { parseJsonc, stripComments } from '../src/core/jsonc.js'
import { parseFrontmatter, parseYamlLite, renderFrontmatter } from '../src/core/frontmatter.js'
import { globToRegExp, matchGlob } from '../src/core/glob.js'
import { safeStem, sessionStem, assertInside, omdPath, relativePosix } from '../src/core/paths.js'
import {
  writeJsonAtomic,
  readJsonSafe,
  readJsoncSafe,
  writeTextAtomic,
  readTextSafe,
  listFiles,
  createMutex,
} from '../src/core/atomic.js'
import {
  loadConfig,
  mergeDeep,
  normalizeConfig,
  agentSettings,
  categorySettings,
  resolveModelRef,
  routeFor,
} from '../src/core/config.js'
import { DEFAULT_CONFIG, TOP_LEVEL_KEYS } from '../src/core/defaults.js'
import { parsePlan, validatePlanFormat, planSummary, nextOpenTask, listPlans, latestPlan } from '../src/state/plan.js'
import { createBoulder, readBoulderSlot, writeBoulderView, resolveContinuation, listBoulderSlots } from '../src/state/boulder.js'
import { TaskStore } from '../src/state/tasks.js'
import { readMode, writeMode, clearMode, bumpContinuation } from '../src/state/modes.js'
import { appendNotepad, readNotepads } from '../src/state/notepads.js'
import { appendLedger, readLedger } from '../src/state/ledger.js'
import { BackgroundRegistry } from '../src/state/background.js'
import { buildStatus, renderStatus } from '../src/state/status.js'

async function tempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-test-'))
  const home = path.join(root, 'home')
  const workspace = path.join(root, 'project')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(workspace, { recursive: true })
  return { root, home, workspace }
}

test('jsonc strips comments and trailing commas without touching strings', () => {
  const text = `{
    // line comment
    "url": "https://example.com/a//b",
    "text": "keep /* this */",
    "nested": { "a": 1, },
    /* block */
  }`
  const value = parseJsonc(text)
  assert.equal(value.url, 'https://example.com/a//b')
  assert.equal(value.text, 'keep /* this */')
  assert.equal(value.nested.a, 1)
  assert.match(stripComments('"a//b" // c'), /a\/\/b/)
  assert.throws(() => parseJsonc('{ bad }', 'x'))
})

test('frontmatter parses scalars, arrays, booleans', () => {
  const text = '---\nname: demo\nalwaysApply: true\nglobs: [\"*.ts\", \"src/**/*.js\"]\n---\nbody\n'
  const parsed = parseFrontmatter(text)
  assert.equal(parsed.hasFrontmatter, true)
  assert.equal(parsed.data.name, 'demo')
  assert.equal(parsed.data.alwaysApply, true)
  assert.deepEqual(parsed.data.globs, ['*.ts', 'src/**/*.js'])
  assert.equal(parsed.body.trim(), 'body')
  assert.deepEqual(parseYamlLite('items:\n  - one\n  - two\n'), { items: ['one', 'two'] })
  assert.match(renderFrontmatter({ name: 'x', list: ['a'] }), /name: "x"/)
})

test('glob matching handles **, *, braces and basenames', () => {
  assert.equal(matchGlob('**/*.ts', 'src/a/b.ts'), true)
  assert.equal(matchGlob('src/**', 'src/a/b.ts'), true)
  assert.equal(matchGlob('*.md', 'docs/readme.md'), true)
  assert.equal(matchGlob('src/*.ts', 'src/a/b.ts'), false)
  assert.equal(matchGlob('*.{ts,js}', 'a.js'), true)
  assert.equal(globToRegExp('a?c').test('abc'), true)
})

test('path helpers reject escapes and normalize stems', () => {
  const root = path.resolve('C:/tmp/project/.omd')
  assert.throws(() => assertInside(root, path.resolve('C:/tmp/project/other')))
  assert.equal(safeStem('session/with space'), 'session_with_space')
  assert.equal(safeStem(''), 'session')
  assert.equal(sessionStem({ sessionId: 'ses_1' }).id_source, 'session-id')
  assert.equal(sessionStem({ createdAt: 0, gitHead: 'abc' }).id_source, 'timestamp-githead')
  assert.equal(relativePosix('C:/tmp/project', 'C:/tmp/project/src/a.js'), 'src/a.js')
  assert.equal(relativePosix('C:/tmp/project', 'C:/tmp/other'), null)
})

test('atomic writes are LF, BOM-tolerant on read, and report corrupt JSON', async () => {
  const { workspace } = await tempWorkspace()
  const file = path.join(workspace, 'a.json')
  await writeJsonAtomic(file, { a: 1 })
  const raw = await fs.readFile(file, 'utf8')
  assert.equal(raw.includes('\r\n'), false)
  assert.deepEqual((await readJsonSafe(file)).value, { a: 1 })
  await writeTextAtomic(file, '\uFEFF{"b":2}')
  const bom = await readJsonSafe(file)
  assert.equal(bom.ok, true)
  assert.equal(bom.bom, true)
  await writeTextAtomic(file, '{ bad')
  assert.equal((await readJsonSafe(file)).reason, 'parse')
  assert.equal((await readJsonSafe(path.join(workspace, 'missing.json'))).reason, 'missing')
  await writeTextAtomic(path.join(workspace, 'b.txt'), 'x\n')
  assert.equal((await listFiles(workspace)).length, 2)
  assert.equal((await readTextSafe(path.join(workspace, 'missing.txt'))).ok, false)
})

test('readJsoncSafe accepts comments and trailing commas, rejects real JSON errors', async () => {
  const { workspace } = await tempWorkspace()
  const commented = path.join(workspace, 'config.jsonc')
  await writeTextAtomic(
    commented,
    '{\n  // project layer\n  "keywordHook": true,\n  "diagnostics": { "commands": [] },\n}\n',
  )
  const jsonc = await readJsoncSafe(commented)
  assert.equal(jsonc.ok, true)
  assert.deepEqual(jsonc.value, { keywordHook: true, diagnostics: { commands: [] } })
  assert.equal((await readJsonSafe(commented)).reason, 'parse', 'strict JSON still reports JSONC as a parse failure')
  await writeTextAtomic(commented, '\uFEFF{ "a": 1, }')
  const bom = await readJsoncSafe(commented)
  assert.equal(bom.ok, true)
  assert.equal(bom.bom, true)
  await writeTextAtomic(commented, '{ bad, }')
  const broken = await readJsoncSafe(commented)
  assert.equal(broken.ok, false)
  assert.equal(broken.reason, 'parse')
  assert.match(broken.detail, /invalid JSONC/)
  assert.equal((await readJsoncSafe(path.join(workspace, 'missing.jsonc'))).reason, 'missing')
})

test('mutex serializes work per key', async () => {  const lock = createMutex()
  const order = []
  await Promise.all([
    lock('k', async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 10))
      order.push('a-end')
    }),
    lock('k', async () => {
      order.push('b-start')
      order.push('b-end')
    }),
  ])
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end'])
})

test('default config has the exact documented key set', () => {
  assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), [...TOP_LEVEL_KEYS].sort())
  assert.equal(DEFAULT_CONFIG.keywordHook, true)
  assert.equal(DEFAULT_CONFIG.taskSystem.enabled, false)
  assert.equal(DEFAULT_CONFIG.delegation.maxConcurrent, 5)
})

test('config merge is layered, unions disabled hooks, and blocks prototype pollution', async () => {
  const { home, workspace } = await tempWorkspace()
  await fs.mkdir(path.join(home, '.omd'), { recursive: true })
  await fs.writeFile(
    path.join(home, '.omd', 'config.jsonc'),
    '{\n // user\n "delegation": {"maxConcurrent": 3},\n "disabledHooks": ["a"],\n}\n',
  )
  await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
  await fs.writeFile(
    path.join(workspace, '.omd', 'config.jsonc'),
    '{"delegation":{"maxDepth":2},"disabledHooks":["b"],"agents":{"sisyphus":{"model":"x"}}}\n',
  )
  const loaded = await loadConfig({ workspace, home })
  assert.equal(loaded.config.delegation.maxConcurrent, 3)
  assert.equal(loaded.config.delegation.maxDepth, 2)
  assert.deepEqual(loaded.config.disabledHooks.sort(), ['a', 'b'])
  assert.equal(loaded.sources.length, 2)
  const polluted = mergeDeep({}, JSON.parse('{"__proto__":{"polluted":true}}'))
  assert.equal({}.polluted, undefined)
  assert.equal(polluted.polluted, undefined)
})

test('normalizeConfig coerces values and preserves unknown keys with diagnostics', () => {
  const diagnostics = []
  const config = normalizeConfig(
    { keywordHook: 0, delegation: { maxConcurrent: -1 }, hooks: { commentChecker: 'nope' }, extra: 1 },
    diagnostics,
  )
  assert.equal(config.keywordHook, false)
  assert.equal(config.delegation.maxConcurrent, 5)
  assert.equal(config.hooks.commentChecker, 'warn')
  assert.ok(diagnostics.some((item) => item.reason === 'unknown-key' && item.detail === 'extra'))
})

test('agent/category/model route helpers resolve aliases and overrides', () => {
  const config = normalizeConfig({
    models: { catalog: { fast: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low' } } },
    agents: { oracle: { model: 'openai/gpt-x', temperature: 0.1 } },
    categories: { deep: { modelRef: 'fast', maxTokens: 100 } },
  })
  assert.equal(agentSettings(config, 'oracle').model, 'openai/gpt-x')
  assert.equal(categorySettings(config, 'deep').maxTokens, 100)
  assert.deepEqual(resolveModelRef(config, 'fast'), {
    ref: 'fast',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    reasoningEffort: 'low',
  })
  assert.deepEqual(resolveModelRef(config, 'a/b'), { provider: 'a', model: 'b' })
  const route = routeFor(config, { agentId: 'oracle', category: 'deep' })
  assert.equal(route.provider, 'openai')
  assert.equal(route.model, 'gpt-x')
  assert.equal(route.temperature, 0.1)
  assert.equal(route.maxTokens, 100)
})

const PLAN_TEXT = `---
plan: demo
status: approved
created: 2026-01-01T00:00:00Z
---
# Plan: demo

## TODOs
- [ ] 1. Build the thing
  Recommended task executor category: deep
- [x] 2. Done thing
  Recommended task executor category: quick
- [ ] F1. Final verification
  Recommended task executor category: ultrabrain
`

test('plan parser reads tasks, categories, and counts', () => {
  const doc = parsePlan(PLAN_TEXT, 'demo.md')
  assert.equal(doc.title, 'demo')
  assert.equal(doc.status, 'approved')
  assert.equal(doc.total, 3)
  assert.equal(doc.checked, 1)
  assert.equal(doc.tasks[0].category, 'deep')
  assert.equal(doc.tasks[2].final, true)
  assert.equal(nextOpenTask(doc).id, '1')
  assert.deepEqual(planSummary(doc), {
    source: 'demo.md',
    title: 'demo',
    status: 'approved',
    total: 3,
    checked: 1,
    open: 2,
  })
  assert.ok(validatePlanFormat(PLAN_TEXT).length >= 0)
  assert.ok(validatePlanFormat('## TODOs\n- [ ] bad\n').length >= 1)
})

test('plan files can be listed and latest selected', async () => {
  const { workspace } = await tempWorkspace()
  await fs.mkdir(path.join(workspace, '.omd', 'plans'), { recursive: true })
  await fs.writeFile(path.join(workspace, '.omd', 'plans', 'one.md'), PLAN_TEXT.replace('demo', 'one'))
  await fs.writeFile(path.join(workspace, '.omd', 'plans', 'two.md'), PLAN_TEXT.replace('demo', 'two'))
  const docs = await listPlans(workspace)
  assert.equal(docs.length, 2)
  const latest = await latestPlan(workspace)
  assert.ok(latest.title === 'one' || latest.title === 'two')
})

test('boulder slots are per-session and derive an aggregate view', async () => {
  const { workspace } = await tempWorkspace()
  await createBoulder({ workspace, stem: 's1', sessionId: 's1', planPath: 'p.md', planName: 'p' })
  await createBoulder({ workspace, stem: 's2', sessionId: 's2', planPath: 'q.md', planName: 'q' })
  const slot = await readBoulderSlot(workspace, 's1')
  assert.equal(slot.ok, true)
  assert.equal(slot.value.status, 'active')
  const view = await writeBoulderView(workspace)
  assert.equal(view.source, 'derived')
  assert.equal(view.open_count, 2)
  const resolved = await resolveContinuation({ workspace, stem: 's1' })
  assert.ok(resolved)
  assert.equal((await listBoulderSlots(workspace)).length, 2)
})

test('task store supports dependencies, cycle rejection, and summaries', async () => {
  const { workspace } = await tempWorkspace()
  const store = new TaskStore(workspace)
  const a = await store.create({ subject: 'A' })
  const b = await store.create({ subject: 'B', blockedBy: [a.id] })
  assert.equal((await store.get(b.id)).blockedBy[0], a.id)
  await assert.rejects(() => store.create({ subject: 'C', blockedBy: ['T-nope'] }))
  await store.update({ id: b.id, status: 'in_progress' })
  assert.equal((await store.get(b.id)).status, 'in_progress')
  await store.update({ id: a.id, status: 'completed' })
  const summary = await store.summary()
  assert.equal(summary.total, 2)
  assert.equal(summary.completed, 1)
  assert.equal(summary.in_progress, 1)
  await store.update({ id: b.id, blockedBy: [] })
  assert.equal((await store.get(b.id)).blockedBy.length, 0)
})

test('modes persist and bump continuation rounds', async () => {
  const { workspace } = await tempWorkspace()
  assert.equal(await readMode(workspace, 's'), null)
  await writeMode({ workspace, stem: 's', mode: 'ultrawork', runId: 'r1' })
  assert.equal((await readMode(workspace, 's')).mode, 'ultrawork')
  const bumped = await bumpContinuation(workspace, 's', 'ultrawork')
  assert.equal(bumped.continuation_rounds, 1)
  await clearMode(workspace, 's')
  assert.equal(await readMode(workspace, 's'), null)
})

test('notepads append with headers and sections', async () => {
  const { workspace } = await tempWorkspace()
  await appendNotepad({ workspace, plan: 'p', section: 'learnings', text: 'one', agent: 'sisyphus' })
  await appendNotepad({ workspace, plan: 'p', section: 'learnings', text: 'two' })
  const notes = await readNotepads(workspace, 'p')
  assert.match(notes.learnings, /one/)
  assert.match(notes.learnings, /two/)
  assert.match(notes.learnings, /agent=sisyphus/)
})

test('ledger appends and reads the tail', async () => {
  const { workspace } = await tempWorkspace()
  await appendLedger(workspace, { event: 'a', task: 'T1' })
  await appendLedger(workspace, { event: 'b' })
  const events = await readLedger(workspace, { limit: 1 })
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'b')
})

test('background registry persists results and resolves waits', async () => {
  const { workspace } = await tempWorkspace()
  const registry = new BackgroundRegistry()
  const record = registry.create({ workspace, parentId: 'parent-1', target: 'oracle', description: 'd' })
  const activation = {
    childId: 'child-1',
    result: Promise.resolve({ output: [{ type: 'text', text: 'hello' }], structured: { ok: true }, stopReason: 'completed' }),
    dispose: async () => {},
  }
  registry.attach(record.task_id, activation)
  const settled = await registry.wait(record.task_id, { timeoutMs: 1000 })
  assert.equal(settled.status, 'completed')
  assert.equal(settled.output, 'hello')
  assert.deepEqual(settled.structured, { ok: true })
  const disk = JSON.parse(await fs.readFile(path.join(workspace, '.omd', 'background', `${record.task_id}.json`), 'utf8'))
  assert.equal(disk.status, 'completed')
  const resultFile = path.join(workspace, '.omd', 'runtime', 'parent-1', 'results', `${record.task_id}.json`)
  assert.equal((await fs.stat(resultFile)).isFile(), true)
  const listed = await registry.listFromDisk(workspace, 'parent-1')
  assert.equal(listed.length, 1)
})

test('background cancellation disposes a running activation', async () => {
  const { workspace } = await tempWorkspace()
  const registry = new BackgroundRegistry()
  const record = registry.create({ workspace, parentId: 'p', target: 'explore' })
  let disposed = false
  const activation = {
    childId: 'c',
    result: new Promise(() => {}),
    dispose: async () => {
      disposed = true
    },
  }
  registry.attach(record.task_id, activation)
  await registry.cancel(record.task_id, 'stop')
  assert.equal(disposed, true)
  assert.equal(registry.get(record.task_id).status, 'cancelled')
})

test('attaching a cancelled background task disposes instead of running it', async () => {
  const { workspace } = await tempWorkspace()
  const registry = new BackgroundRegistry()
  const record = registry.create({ workspace, parentId: 'p', target: 'explore', queued: true })
  await registry.cancel(record.task_id, 'queued cancel')
  let disposed = false
  const activation = {
    childId: 'c',
    result: Promise.resolve({ output: [], stopReason: 'completed' }),
    dispose: async () => {
      disposed = true
    },
  }
  await registry.attach(record.task_id, activation)
  assert.equal(disposed, true)
  assert.equal(registry.get(record.task_id).status, 'cancelled')
})

test('status composes and renders without a live context', async () => {
  const { workspace } = await tempWorkspace()
  await writeMode({ workspace, stem: 'agent-1', mode: 'ultrawork' })
  await createBoulder({ workspace, stem: 'agent-1', sessionId: 'agent-1', planPath: null, planName: 'demo' })
  const status = await buildStatus({ workspace, agentId: 'agent-1', backgroundRegistry: new BackgroundRegistry() })
  assert.equal(status.mode, 'ultrawork')
  assert.equal(status.boulder.status, 'active')
  const text = renderStatus(status)
  assert.match(text, /Oh-My-DSH status/)
  assert.match(text, /ultrawork/)
  assert.match(text, /demo/)
})

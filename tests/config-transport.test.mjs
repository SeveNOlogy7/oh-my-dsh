import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  CONFIG_ROUTE,
  createConfigTransport,
  registerConfigTransport,
  resolveWorkspace,
} from '../src/config-page/transport.js'
import { CONFIG_PAGE_PROTOCOL, createConfigPage } from '../src/config-page/index.js'
import { DEFAULT_CONFIG } from '../src/core/defaults.js'
import { apply } from '../src/runtime/index.js'
import { createFakeContext, emit } from './helpers/fake-context.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..')

async function tempWorkspace(config = null) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-transport-'))
  const workspace = path.join(dir, 'project')
  await fs.mkdir(path.join(workspace, '.omd'), { recursive: true })
  if (config !== null) await fs.writeFile(path.join(workspace, '.omd', 'config.jsonc'), config)
  return workspace
}

/** A Host context carrying only the services one case needs. */
function fakeContext(services = {}) {
  return {
    get(name) {
      return services[name]
    },
  }
}

function post(payload) {
  return new Request(`http://127.0.0.1${CONFIG_ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

test('the route is one namespaced POST on the authenticated /api channel', () => {
  const routes = []
  const ctx = fakeContext({
    connection: {
      fetch: {
        register(route) {
          routes.push(route)
          return async () => {}
        },
      },
    },
  })
  const dispose = registerConfigTransport(ctx, { page: createConfigPage({ home: os.tmpdir(), packageRoot: root }) })
  assert.equal(typeof dispose, 'function')
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/api/omd/config')
  assert.deepEqual(routes[0].methods, ['POST'])
  assert.equal(routes[0].requestBody, 'buffered')
  assert.equal(typeof routes[0].fetch, 'function', 'the route owns a Fetch-shaped handler')
})

test('a composition without a browser channel registers nothing and does not throw', () => {
  assert.equal(registerConfigTransport(fakeContext(), {}), undefined)
  assert.equal(registerConfigTransport(fakeContext({ connection: {} }), {}), undefined)
})

test('the runtime row waits for the connection service instead of requiring it', async () => {
  const routes = []
  const { ctx, agent } = createFakeContext({ cwd: await tempWorkspace('{}\n') })
  ctx.connection = {
    fetch: {
      register(route) {
        routes.push(route)
        return async () => {}
      },
    },
  }
  // The real Cordis context offers `inject(deps, callback)` — a sub-fiber that
  // activates only once those services exist. Declaring `connection` in the
  // row's own `inject` would instead keep the WHOLE row inactive in a shell or
  // headless composition that has no browser channel.
  const declared = []
  ctx.inject = (deps, callback) => {
    declared.push(deps)
    callback(ctx)
  }
  const dispose = apply(ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 10))
  await emit(ctx, 'agent/created', { agent })
  assert.deepEqual(declared, [['connection']])
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, CONFIG_ROUTE)
  dispose()
})

test('the OMD runtime row registers the endpoint exactly once', async () => {
  const routes = []
  const { ctx, agent } = createFakeContext({ cwd: await tempWorkspace('{}\n') })
  ctx.connection = {
    fetch: {
      register(route) {
        routes.push(route)
        return async () => {}
      },
    },
  }
  const dispose = apply(ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 10))
  await emit(ctx, 'agent/created', { agent })
  assert.equal(routes.length, 1, 'one profile-level row registers one route')
  assert.equal(routes[0].path, CONFIG_ROUTE)
  dispose()
})

test('a read answers the envelope the /omd-config command answers with', async () => {
  const workspace = await tempWorkspace('{\n  // keep this comment\n  "keywordHook": true,\n}\n')
  const ctx = fakeContext({
    sessions: { get: (id) => (id === 'session-1' ? { header: { cwd: workspace } } : undefined) },
  })
  const handler = createConfigTransport(ctx, {
    page: createConfigPage({ home: os.tmpdir(), packageRoot: root }),
    language: 'en',
  })
  const response = await handler(post({ line: '/omd-config', sessionId: 'session-1' }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.protocol, CONFIG_PAGE_PROTOCOL)
  assert.equal(body.ok, true)
  assert.equal(body.workspace, path.resolve(workspace))
  assert.equal(body.file, path.join(path.resolve(workspace), '.omd', 'config.jsonc'))
  assert.equal(body.config.keywordHook, true)
  assert.ok(Array.isArray(body.sources))
  assert.deepEqual(body.defaults, DEFAULT_CONFIG, 'the page gets the shipped defaults')
  assert.deepEqual(
    body.layers.map((layer) => layer.file),
    body.sources,
    'the layer audit follows the same order as the sources',
  )
})

test('a structured set reaches the store end-to-end through the registered route', async () => {
  const workspace = await tempWorkspace(
    '{\n  // keep this comment\n  "delegation": {\n    "maxConcurrent": 5,\n    "maxDepth": 1,\n  },\n}\n',
  )
  const routes = []
  const ctx = fakeContext({
    workingDirectory: { defaultDirectory: workspace },
    connection: {
      fetch: {
        register(route) {
          routes.push(route)
          return async () => {}
        },
      },
    },
  })
  const dispose = registerConfigTransport(ctx, { page: createConfigPage({ home: os.tmpdir(), packageRoot: root }), language: 'en' })
  assert.equal(typeof dispose, 'function', 'the route really registered')

  const response = await routes[0].fetch(
    post({
      line: '/omd-config set {"patch":{"delegation":{"maxConcurrent":2}},"unset":[["delegation","maxDepth"]]}',
      sessionId: 'session-1',
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.deepEqual(body.write, { mode: 'patch', keys: ['delegation.maxConcurrent'], unset: ['delegation.maxDepth'] })
  assert.deepEqual(body.fileConfig, { delegation: { maxConcurrent: 2 } })
  const text = await fs.readFile(body.file, 'utf8')
  assert.match(text, /\/\/ keep this comment/)
  assert.equal(text.includes('maxDepth'), false)
})

test('a removal the schema rejects answers 400 with the validator message', async () => {
  const workspace = await tempWorkspace('{ "models": { "catalog": { "fast": { "provider": "p", "model": "m" } } } }\n')
  const handler = createConfigTransport(fakeContext({ workingDirectory: { defaultDirectory: workspace } }), {
    page: createConfigPage({ home: os.tmpdir(), packageRoot: root }),
  })
  const response = await handler(post({ line: '/omd-config set {"unset":[["models","catalog","fast","model"]]}', sessionId: 's' }))
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.deepEqual(body.error, { kind: 'command', message: 'models.catalog.fast.model is required' })
})

test('a malformed unset path is a usage refusal, not a 500', async () => {
  const workspace = await tempWorkspace('{}\n')
  const handler = createConfigTransport(fakeContext({ workingDirectory: { defaultDirectory: workspace } }), {
    page: createConfigPage({ home: os.tmpdir(), packageRoot: root }),
  })
  const response = await handler(post({ line: '/omd-config set {"unset":"delegation.maxDepth"}', sessionId: 's' }))
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error.kind, 'command')
  assert.match(body.error.message, /unset must be an array of key paths/)
  assert.match(body.error.message, /usage: \/omd-config/)
})

test('a write goes through the same validated splice and keeps the file comments', async () => {
  const workspace = await tempWorkspace('{\n  // keep this comment\n  "keywordHook": true,\n}\n')
  const ctx = fakeContext({ sessions: { get: () => ({ header: { cwd: workspace } }) } })
  const handler = createConfigTransport(ctx, {
    page: createConfigPage({ home: os.tmpdir(), packageRoot: root }),
    language: 'en',
  })
  const response = await handler(
    post({ line: '/omd-config set {"keywordHook":false,"delegation":{"maxConcurrent":2}}', sessionId: 's' }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.config.keywordHook, false)
  const text = await fs.readFile(body.file, 'utf8')
  assert.match(text, /\/\/ keep this comment/, 'the JSONC splice preserved the comment')
})

test('a rejected value is the validator message, not a 500', async () => {
  const workspace = await tempWorkspace('{}\n')
  const ctx = fakeContext({ sessions: { get: () => ({ header: { cwd: workspace } }) } })
  const handler = createConfigTransport(ctx, { page: createConfigPage({ home: os.tmpdir(), packageRoot: root }) })
  const response = await handler(post({ line: '/omd-config set {"delegation":{"maxDepth":-1}}', sessionId: 's' }))
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error.kind, 'command')
  assert.equal(body.error.message, 'delegation.maxDepth must be integer >= 0 (got -1)')
})

test('the browser never names a path: an unknown session falls back to the profile default', async () => {
  const workspace = await tempWorkspace('{}\n')
  const ctx = fakeContext({
    sessions: { get: () => undefined },
    workingDirectory: { defaultDirectory: workspace },
  })
  assert.equal(await resolveWorkspace(ctx, 'missing-session'), path.resolve(workspace))
  assert.equal(await resolveWorkspace(ctx, null), path.resolve(workspace))
  // A caller-supplied path is ignored outright — it is not even read.
  const handler = createConfigTransport(ctx, { page: createConfigPage({ home: os.tmpdir(), packageRoot: root }) })
  const response = await handler(post({ line: '/omd-config', sessionId: 'C:\\Windows' }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).workspace, path.resolve(workspace))
})

test('a persisted session header resolves the workspace when no live session remains', async () => {
  const workspace = await tempWorkspace('{}\n')
  const ctx = fakeContext({
    sessionQuery: { readSession: async () => ({ session: { header: { cwd: workspace } } }) },
  })
  assert.equal(await resolveWorkspace(ctx, 'session-9'), path.resolve(workspace))
})

test('an unresolvable workspace answers no-session instead of guessing', async () => {
  const handler = createConfigTransport(fakeContext(), { page: createConfigPage({ home: os.tmpdir(), packageRoot: root }) })
  const response = await handler(post({ line: '/omd-config' }))
  assert.equal(response.status, 409)
  assert.deepEqual((await response.json()).error, { kind: 'no-session', message: null })
})

test('malformed requests are refused before the page service runs', async () => {
  const workspace = await tempWorkspace('{}\n')
  const ctx = fakeContext({ workingDirectory: { defaultDirectory: workspace } })
  const handler = createConfigTransport(ctx, { page: createConfigPage({ home: os.tmpdir(), packageRoot: root }) })
  const notJson = await handler(post('this is not json'))
  assert.equal(notJson.status, 400)
  assert.equal((await notJson.json()).error.kind, 'protocol')
  const wrongShape = await handler(post({ line: 42 }))
  assert.equal(wrongShape.status, 400)
  assert.equal((await wrongShape.json()).error.kind, 'protocol')
  const usage = await handler(post({ line: '/omd-config bogus' }))
  assert.equal(usage.status, 400)
  const usageBody = await usage.json()
  assert.equal(usageBody.error.kind, 'command')
  assert.match(usageBody.error.message, /usage: \/omd-config/)
})

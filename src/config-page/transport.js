/**
 * The settings page's own transport — Host half.
 *
 * The page is a browser surface that edits the workspace's `.omd/config.jsonc`.
 * It used to borrow the session-scoped `/omd-config` command through
 * `ctx.remote.commands.execute(...)`, which is wrong on two counts: opening a
 * settings page is not a command the user typed, and `commands.execute` appends
 * `command/run` + `command/done` records to the LIVE session log every time the
 * page mounts (measured: three page opens left three pairs in one session).
 *
 * Instead this module registers one exact Fetch route on DSH's shared `/api`
 * channel — `dsh-client-connection`'s `connection.fetch.register`. That channel
 * applies the Host/Origin fence and the `SameSite=Strict` browser cookie before
 * this handler runs, and answers 403 to any non-owner peer, so the endpoint is
 * authenticated without OMD carrying a token. It also needs no `webServer`, so
 * it keeps working on the shell-owned/Electron carrier.
 *
 * Nothing here is per-session: the request names a session only to ask WHICH
 * workspace's configuration to show. A request without one falls back to the
 * profile's default working directory, which is why the page now works even
 * with no session open.
 */
import path from 'node:path'
import { CONFIG_COMMAND_NAME, createConfigPage, parseConfigInput } from './index.js'

/** Exact route below `/api`; namespaced so a second OMD row cannot collide. */
export const CONFIG_ROUTE = '/api/omd/config'

/**
 * The command's own raw input, or `null` when the line names another command.
 *
 * The page sends a full `/omd-config [set <json>]` line so this endpoint and the
 * human-typed command keep one parser and one envelope contract; the command
 * plane has already stripped the name by the time a handler sees its input, so
 * the strip happens here instead.
 */
export function rawInputOf(line) {
  const text = String(line ?? '').trim()
  const head = `/${CONFIG_COMMAND_NAME}`
  if (text === head) return ''
  if (text.startsWith(`${head} `)) return text.slice(head.length + 1)
  return null
}

/** Service lookup that never throws: OMD must work in compositions without it. */
function service(ctx, name) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the workspace whose configuration the page edits.
 *
 * The browser never names a filesystem path. It names the session it is showing
 * and the Host resolves that session's directory, so this endpoint cannot be
 * turned into an arbitrary-file-write surface by a caller that picks its own
 * path. Both readers are read-only: neither appends a session record.
 * @returns absolute directory, or `null` when nothing can be resolved.
 */
export async function resolveWorkspace(ctx, sessionId) {
  const wanted = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (wanted !== '') {
    try {
      const session = service(ctx, 'sessions')?.get?.(wanted)
      const cwd = session?.header?.cwd
      if (typeof cwd === 'string' && cwd.trim() !== '') return path.resolve(cwd)
    } catch {
      // fall through to the persisted log
    }
    try {
      const reading = await service(ctx, 'sessionQuery')?.readSession?.(wanted)
      const cwd = reading?.session?.header?.cwd ?? reading?.session?.cwd
      if (typeof cwd === 'string' && cwd.trim() !== '') return path.resolve(cwd)
    } catch {
      // fall through to the default directory
    }
  }
  const fallback = service(ctx, 'workingDirectory')?.defaultDirectory
  if (typeof fallback === 'string' && fallback.trim() !== '') return path.resolve(fallback)
  return null
}

/** One JSON answer; the page parses it and nothing else. */
function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Build the route handler.
 * @param options.page - pre-built config page service (tests pass their own).
 * @param options.language - the plugin row's language, for the read-only section.
 * @param options.log - optional warning sink for unexpected failures.
 */
export function createConfigTransport(ctx, options = {}) {
  const page = options.page ?? createConfigPage()
  const language = typeof options.language === 'string' ? options.language : 'en'
  const log = typeof options.log === 'function' ? options.log : () => {}

  return async function handleConfigRequest(request) {
    let body
    try {
      body = await request.json()
    } catch {
      return answer(400, { error: { kind: 'protocol', message: 'the request body must be JSON' } })
    }
    if (body === null || typeof body !== 'object' || typeof body.line !== 'string') {
      return answer(400, { error: { kind: 'protocol', message: 'the request must carry a "line" string' } })
    }
    const workspace = await resolveWorkspace(ctx, body.sessionId)
    if (workspace === null) {
      return answer(409, { error: { kind: 'no-session', message: null } })
    }
    const rawInput = rawInputOf(body.line)
    if (rawInput === null) {
      return answer(400, { error: { kind: 'protocol', message: `the line must start with /${CONFIG_COMMAND_NAME}` } })
    }
    const parsed = parseConfigInput(rawInput)
    if (parsed.kind === 'usage') {
      return answer(400, { error: { kind: 'command', message: parsed.message } })
    }
    try {
      // Both write forms travel as one parsed request: `patch` only for the
      // legacy `set {<patch>}` line, plus `unset` for the structured one.
      const result =
        parsed.kind === 'read'
          ? await page.read({ workspace, agentId: null, language })
          : await page.set({ workspace, agentId: null, language, patch: parsed.patch, unset: parsed.unset })
      if (result.ok === false) {
        return answer(400, { error: { kind: 'command', message: result.error.message } })
      }
      // The page service already answers with its own protocol number and `ok`,
      // so the page parses one envelope shape whether it came from this route or
      // from the `/omd-config` command a human typed.
      return answer(200, result)
    } catch (error) {
      const message = String(error?.message ?? error)
      log('config-transport-failed', { error: message })
      return answer(500, { error: { kind: 'command', message: `omd-config failed: ${message}` } })
    }
  }
}

/**
 * Register the route on the Connection service.
 *
 * Returns the disposer when the transport exists, `undefined` otherwise: a
 * composition without a browser channel (a shell, a headless run) simply has no
 * page to serve, and that must not fail the OMD row.
 */
export function registerConfigTransport(ctx, options = {}) {
  const connection = service(ctx, 'connection')
  const fetchRoutes = connection?.fetch
  if (!fetchRoutes || typeof fetchRoutes.register !== 'function') return undefined
  return fetchRoutes.register({
    path: CONFIG_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: createConfigTransport(ctx, options),
  })
}

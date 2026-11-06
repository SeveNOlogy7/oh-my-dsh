import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseJsonc } from './jsonc.js'

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

function siblingTemp(file) {
  const dir = path.dirname(file)
  const base = path.basename(file)
  const token = `${process.pid}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
  return path.join(dir, `.${base}.tmp-${token}`)
}

const writeQueues = new Map()

async function performWrite(file, text) {
  await ensureDir(path.dirname(file))
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const tmp = siblingTemp(file)
  try {
    await fs.writeFile(tmp, normalized, { encoding: 'utf8' })
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await fs.rename(tmp, file)
        return
      } catch (error) {
        lastError = error
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error?.code) || attempt === 2) throw error
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
      }
    }
    throw lastError
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {})
  }
}

/**
 * Write UTF-8 text with LF endings through a same-directory atomic rename.
 * Concurrent writers to one path are serialized in-process, which matters on
 * Windows where two renames to the same target can race with EPERM.
 */
export function writeTextAtomic(file, text) {
  const key = path.resolve(file)
  const previous = writeQueues.get(key) ?? Promise.resolve()
  const current = previous.then(
    () => performWrite(file, text),
    () => performWrite(file, text),
  )
  const tail = current.catch(() => {})
  writeQueues.set(key, tail)
  const cleanup = () => {
    if (writeQueues.get(key) === tail) writeQueues.delete(key)
  }
  tail.then(cleanup, cleanup)
  return current
}

export async function writeJsonAtomic(file, value) {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

export async function appendText(file, text) {
  await ensureDir(path.dirname(file))
  await fs.appendFile(file, String(text).replace(/\r\n/g, '\n'), { encoding: 'utf8' })
}

export async function appendJsonl(file, value) {
  await appendText(file, `${JSON.stringify(value)}\n`)
}

/**
 * Read JSON with explicit failure reasons instead of throwing.
 * @returns {{ok:true,value:unknown,bom:boolean}|{ok:false,reason:'missing'|'io'|'parse'}}
 */
export async function readJsonSafe(file) {
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: false, reason: 'missing' }
    return { ok: false, reason: 'io' }
  }
  const bom = raw.charCodeAt(0) === 0xfeff
  const text = bom ? raw.slice(1) : raw
  try {
    return { ok: true, value: JSON.parse(text), bom }
  } catch {
    return { ok: false, reason: 'parse' }
  }
}

/**
 * Read a JSONC document (comments and trailing commas allowed) with the same
 * failure contract as `readJsonSafe`. Project config files are JSONC by
 * design, so strict `JSON.parse` reports a false 'parse' failure for them.
 * @returns {{ok:true,value:unknown,bom:boolean}|{ok:false,reason:'missing'|'io'|'parse',detail?:string}}
 */
export async function readJsoncSafe(file) {
  const read = await readTextSafe(file)
  if (!read.ok) return read
  const bom = read.value.charCodeAt(0) === 0xfeff
  try {
    return { ok: true, value: parseJsonc(read.value, file), bom }
  } catch (error) {
    return { ok: false, reason: 'parse', detail: String(error?.message ?? error) }
  }
}

/** Read text with explicit failure reasons. */
export async function readTextSafe(file) {
  try {
    return { ok: true, value: await fs.readFile(file, 'utf8') }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: false, reason: 'missing' }
    return { ok: false, reason: 'io' }
  }
}

export async function exists(file) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export async function listFiles(dir, predicate = () => true) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (entry.isDirectory()) continue
    if (predicate(entry.name)) out.push(path.join(dir, entry.name))
  }
  return out.sort()
}

export async function removeFile(file) {
  await fs.rm(file, { force: true })
}

/** A tiny per-process mutex keyed by an arbitrary string. */
export function createMutex() {
  const chains = new Map()
  return function withLock(key, operation) {
    const previous = chains.get(key) ?? Promise.resolve()
    const current = previous.then(operation, operation)
    chains.set(key, current.catch(() => {}))
    const cleanup = () => {
      if (chains.get(key) === current) chains.delete(key)
    }
    current.then(cleanup, cleanup)
    return current
  }
}

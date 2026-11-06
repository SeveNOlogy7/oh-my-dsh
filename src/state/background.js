import crypto from 'node:crypto'
import { readJsonSafe, writeJsonAtomic } from '../core/atomic.js'
import { omdPath, safeStem } from '../core/paths.js'
import { OMD_MAX_RESULT_BYTES } from '../core/constants.js'

function newTaskId() {
  return `bg_${crypto.randomBytes(5).toString('hex')}`
}

function textFromBlocks(blocks) {
  return (blocks ?? [])
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function clip(text) {
  const value = String(text ?? '')
  if (Buffer.byteLength(value, 'utf8') <= OMD_MAX_RESULT_BYTES) return { text: value, truncated: false }
  const head = value.slice(0, Math.floor(OMD_MAX_RESULT_BYTES / 2))
  const tail = value.slice(-Math.floor(OMD_MAX_RESULT_BYTES / 2))
  return { text: `${head}\n\n… [omd truncated] …\n\n${tail}`, truncated: true }
}

/**
 * In-process registry for delegated background tasks, backed by
 * .omd/background/<task_id>.json and .omd/runtime/<stem>/results/<task_id>.json.
 * Completion is decided by the result promise; notifications are hints.
 */
export class BackgroundRegistry {
  constructor() {
    this.records = new Map()
    this.activations = new Map()
    this.promises = new Map()
  }

  create({ workspace, parentId, target, category = null, description = '', background = true, queued = false }) {
    const taskId = newTaskId()
    const now = new Date().toISOString()
    const record = {
      task_id: taskId,
      target,
      category,
      description,
      status: queued ? 'queued' : 'running',
      parent_session_id: parentId,
      child_session_id: null,
      workspace,
      output: '',
      structured: null,
      stop_reason: null,
      error: null,
      truncated: false,
      background,
      created_at: now,
      started_at: queued ? null : now,
      finished_at: null,
    }
    this.records.set(taskId, record)
    return record
  }

  attach(taskId, activation) {
    const record = this.records.get(taskId)
    if (!record) throw new Error(`unknown background task: ${taskId}`)
    if (record.status === 'cancelled') {
      try {
        activation.dispose?.()
      } catch {
        // cancellation is best effort
      }
      return Promise.resolve(record)
    }
    record.status = 'running'
    record.started_at = new Date().toISOString()
    record.child_session_id = activation.childId ?? null
    this.activations.set(taskId, activation)
    this.persist(record).catch(() => {})
    const promise = Promise.resolve(activation.result)
      .then((result) => this.settle(taskId, result))
      .catch((error) => this.fail(taskId, error))
    this.promises.set(taskId, promise)
    return promise
  }

  async settle(taskId, result) {
    const record = this.records.get(taskId)
    if (!record) return null
    if (record.status === 'cancelled') return record
    const output = clip(textFromBlocks(result?.output))
    const failed = ['error', 'aborted', 'interrupted'].includes(result?.stopReason)
    record.status = failed ? 'failed' : 'completed'
    record.stop_reason = result?.stopReason ?? 'completed'
    record.output = output.text
    record.truncated = output.truncated
    record.structured = result?.structured ?? null
    record.error = failed ? (result?.diagnostic ?? 'child did not complete') : null
    record.finished_at = new Date().toISOString()
    this.activations.delete(taskId)
    await this.persist(record)
    await this.persistResult(record)
    return record
  }

  async fail(taskId, error) {
    const record = this.records.get(taskId)
    if (!record) return null
    if (record.status === 'cancelled') return record
    record.status = 'failed'
    record.error = error instanceof Error ? error.message : String(error)
    record.finished_at = new Date().toISOString()
    this.activations.delete(taskId)
    await this.persist(record)
    await this.persistResult(record)
    return record
  }

  update(taskId, patch) {
    const record = this.records.get(taskId)
    if (!record) return null
    Object.assign(record, patch)
    return record
  }

  get(taskId) {
    return this.records.get(taskId) ?? null
  }

  list(parentId) {
    return [...this.records.values()]
      .filter((record) => record.parent_session_id === parentId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  }

  async load(workspace, taskId) {
    const read = await readJsonSafe(omdPath(workspace, 'background', `${taskId}.json`))
    if (!read.ok) return null
    const record = read.value
    if (record.status === 'queued' || record.status === 'running') record.status = 'unknown'
    this.records.set(taskId, record)
    return record
  }

  async listFromDisk(workspace, parentId) {
    const dir = omdPath(workspace, 'background')
    let names = []
    try {
      const { promises: fs } = await import('node:fs')
      names = await fs.readdir(dir)
    } catch {
      return []
    }
    const out = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const read = await readJsonSafe(omdPath(workspace, 'background', name))
      if (!read.ok) continue
      if (read.value.parent_session_id !== parentId) continue
      if (!this.records.has(read.value.task_id)) {
        if (read.value.status === 'queued' || read.value.status === 'running') read.value.status = 'unknown'
        this.records.set(read.value.task_id, read.value)
      }
      out.push(this.records.get(read.value.task_id))
    }
    return out.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  }

  async wait(taskId, { timeoutMs = 0, signal } = {}) {
    const record = this.records.get(taskId)
    if (!record) return null
    if (['completed', 'failed', 'cancelled', 'unknown'].includes(record.status)) return record
    if (record.continuation_accepted && !this.promises.get(taskId)) return record
    const promise = this.promises.get(taskId)
    if (promise) {
      if (timeoutMs <= 0) return promise
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(this.records.get(taskId) ?? record), timeoutMs)
        const onAbort = () => {
          clearTimeout(timer)
          resolve(this.records.get(taskId) ?? record)
        }
        if (signal) signal.addEventListener('abort', onAbort, { once: true })
        promise.finally(() => {
          clearTimeout(timer)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve(this.records.get(taskId) ?? record)
        })
      })
    }
    // Queued before start, or continued after its first settlement: there is no
    // activation promise to join, so poll the record until terminal or bound.
    return new Promise((resolve) => {
      const started = Date.now()
      let timer
      const done = () => {
        const current = this.records.get(taskId) ?? record
        return ['completed', 'failed', 'cancelled', 'unknown'].includes(current.status) || (timeoutMs > 0 && Date.now() - started >= timeoutMs)
      }
      const finish = () => {
        clearInterval(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        resolve(this.records.get(taskId) ?? record)
      }
      const onAbort = () => finish()
      timer = setInterval(() => {
        if (done()) finish()
      }, 100)
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      if (done()) finish()
    })
  }

  async cancel(taskId, reason = 'cancelled by parent') {
    const record = this.records.get(taskId)
    if (!record) return null
    if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') return record
    const activation = this.activations.get(taskId)
    if (activation && typeof activation.dispose === 'function') {
      try {
        await activation.dispose()
      } catch {
        // cancellation is best effort
      }
    }
    record.status = 'cancelled'
    record.error = reason
    record.finished_at = new Date().toISOString()
    this.activations.delete(taskId)
    await this.persist(record)
    return record
  }

  async persist(record) {
    if (!record?.workspace) return
    await writeJsonAtomic(omdPath(record.workspace, 'background', `${record.task_id}.json`), record)
  }

  async persistResult(record) {
    if (!record?.workspace) return
    const parentStem = safeStem(record.parent_session_id)
    await writeJsonAtomic(
      omdPath(record.workspace, 'runtime', parentStem, 'results', `${record.task_id}.json`),
      {
        task_id: record.task_id,
        target: record.target,
        category: record.category,
        status: record.status,
        output: record.output,
        structured: record.structured,
        stop_reason: record.stop_reason,
        error: record.error,
        child_session_id: record.child_session_id,
        finished_at: record.finished_at,
        truncated: record.truncated,
      },
    )
  }
}

const sharedRegistry = new BackgroundRegistry()

export function backgroundRegistry() {
  return sharedRegistry
}

export { textFromBlocks, clip }

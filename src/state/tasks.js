import crypto from 'node:crypto'
import { createMutex, listFiles, readJsonSafe, removeFile, writeJsonAtomic } from '../core/atomic.js'
import { omdPath } from '../core/paths.js'
import { TASK_STATUSES } from '../core/constants.js'

function newTaskId() {
  return `T-${crypto.randomBytes(4).toString('hex')}`
}

/** Durable task system stored as one JSON document per task. */
export class TaskStore {
  constructor(workspace) {
    this.workspace = workspace
    this.dir = omdPath(workspace, 'tasks')
    this.withLock = createMutex()
  }

  pathFor(id) {
    return omdPath(this.workspace, 'tasks', `${id}.json`)
  }

  async create({ subject, description = '', blockedBy = [], owner, metadata, sessionId } = {}) {
    if (!subject || typeof subject !== 'string') throw new Error('task subject is required')
    const id = newTaskId()
    return this.withLock('tasks', async () => {
      const existing = await this.list()
      for (const blocker of blockedBy) {
        if (!existing.some((task) => task.id === blocker)) throw new Error(`unknown blocker: ${blocker}`)
      }
      const now = new Date().toISOString()
      const task = {
        id,
        subject,
        description,
        status: 'pending',
        activeForm: null,
        blocks: [],
        blockedBy: [...new Set(blockedBy)],
        owner: owner ?? null,
        metadata: metadata ?? null,
        sessionId: sessionId ?? null,
        createdAt: now,
        updatedAt: now,
      }
      for (const other of existing) {
        if (task.blockedBy.includes(other.id) && !other.blocks.includes(id)) {
          other.blocks.push(id)
          other.updatedAt = now
          await writeJsonAtomic(this.pathFor(other.id), other)
        }
      }
      await writeJsonAtomic(this.pathFor(id), task)
      return task
    })
  }

  async get(id) {
    const read = await readJsonSafe(this.pathFor(id))
    return read.ok ? read.value : null
  }

  async list({ status } = {}) {
    const files = await listFiles(this.dir, (name) => /^T-[a-z0-9]+\.json$/i.test(name))
    const tasks = []
    for (const file of files) {
      const read = await readJsonSafe(file)
      if (read.ok) tasks.push(read.value)
    }
    tasks.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    return status ? tasks.filter((task) => task.status === status) : tasks
  }

  async update({ id, status, owner, subject, description, blockedBy } = {}) {
    if (!id) throw new Error('task id is required')
    return this.withLock('tasks', async () => {
      const task = await this.get(id)
      if (!task) throw new Error(`unknown task: ${id}`)
      if (status !== undefined && !TASK_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`)
      if (blockedBy !== undefined) {
        const all = await this.list()
        for (const blocker of blockedBy) {
          if (!all.some((candidate) => candidate.id === blocker)) throw new Error(`unknown blocker: ${blocker}`)
          if (this.wouldCycle(all, id, blocker)) throw new Error(`dependency cycle: ${id} <- ${blocker}`)
        }
        for (const other of all) {
          if (other.id === id) continue
          const shouldBlock = blockedBy.includes(other.id)
          const has = other.blocks.includes(id)
          if (shouldBlock && !has) other.blocks.push(id)
          if (!shouldBlock && has) other.blocks = other.blocks.filter((value) => value !== id)
          if (shouldBlock !== has) {
            other.updatedAt = new Date().toISOString()
            await writeJsonAtomic(this.pathFor(other.id), other)
          }
        }
        task.blockedBy = [...new Set(blockedBy)]
      }
      if (status !== undefined) task.status = status
      if (owner !== undefined) task.owner = owner
      if (subject !== undefined) task.subject = subject
      if (description !== undefined) task.description = description
      task.updatedAt = new Date().toISOString()
      await writeJsonAtomic(this.pathFor(id), task)
      return task
    })
  }

  wouldCycle(all, taskId, blockerId) {
    const byId = new Map(all.map((task) => [task.id, task]))
    const seen = new Set()
    const stack = [blockerId]
    while (stack.length) {
      const current = stack.pop()
      if (current === taskId) return true
      if (seen.has(current)) continue
      seen.add(current)
      const task = byId.get(current)
      for (const next of task?.blockedBy ?? []) stack.push(next)
    }
    return false
  }

  async remove(id) {
    await removeFile(this.pathFor(id))
  }

  async summary() {
    const tasks = await this.list()
    return {
      total: tasks.length,
      pending: tasks.filter((task) => task.status === 'pending').length,
      in_progress: tasks.filter((task) => task.status === 'in_progress').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
      blocked: tasks.filter((task) => task.blockedBy.length > 0 && task.status !== 'completed').length,
    }
  }
}

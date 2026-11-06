/**
 * Per-key FIFO concurrency limiter. OmO's background task manager limits
 * concurrency by provider/model; OMD keeps that shape without a dependency.
 */
export class Scheduler {
  constructor(limit = 5) {
    this.limit = Math.max(1, Number(limit) || 5)
    this.groups = new Map()
  }

  setLimit(limit) {
    this.limit = Math.max(1, Number(limit) || this.limit)
    for (const key of this.groups.keys()) this.pump(key)
  }

  group(key) {
    if (!this.groups.has(key)) this.groups.set(key, { active: 0, queue: [] })
    return this.groups.get(key)
  }

  /** Resolve when a slot is acquired; the returned release is idempotent. */
  acquire(key = 'default') {
    const group = this.group(key)
    if (group.active < this.limit) {
      group.active += 1
      return Promise.resolve(this.releaseFn(key, group))
    }
    return new Promise((resolve) => {
      group.queue.push(() => {
        group.active += 1
        resolve(this.releaseFn(key, group))
      })
    })
  }

  releaseFn(key, group) {
    let released = false
    return () => {
      if (released) return
      released = true
      group.active = Math.max(0, group.active - 1)
      this.pump(key)
    }
  }

  pump(key) {
    const group = this.group(key)
    while (group.active < this.limit && group.queue.length) {
      const next = group.queue.shift()
      next()
    }
  }

  snapshot() {
    return [...this.groups.entries()].map(([key, group]) => ({
      key,
      active: group.active,
      queued: group.queue.length,
      limit: this.limit,
    }))
  }
}

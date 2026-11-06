import path from 'node:path'

/** Resolve the .omd root for a workspace. */
export function omdRoot(workspace) {
  return path.resolve(workspace, '.omd')
}

/** Resolve a path inside .omd, rejecting escapes. */
export function omdPath(workspace, ...parts) {
  const root = omdRoot(workspace)
  const target = path.resolve(root, ...parts)
  assertInside(root, target)
  return target
}

/** Throw when target is not inside root. */
export function assertInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    if (rel === '') return
    throw new Error(`path escapes ${root}: ${target}`)
  }
}

/** True when target is inside root. */
export function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Windows-safe directory stem. */
export function safeStem(value, max = 96) {
  const source = String(value ?? '').trim()
  const cleaned = source.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return (cleaned || 'session').slice(0, max)
}

/** Normalize a filesystem path into a repository-style relative path. */
export function toPosix(value) {
  return String(value).replace(/\\/g, '/')
}

/** Relative POSIX path from root, or null when outside root. */
export function relativePosix(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return toPosix(rel)
}

/**
 * Derive a stable per-session stem. A live session id is authoritative; a
 * timestamp + git head is the documented fallback for session-less contexts.
 */
export function sessionStem({ sessionId, createdAt, gitHead } = {}) {
  if (sessionId) return { stem: safeStem(sessionId), id_source: 'session-id' }
  const stamp = new Date(createdAt ?? Date.now()).toISOString().replace(/[:.]/g, '-')
  const head = gitHead ? safeStem(gitHead, 12) : 'nogit'
  return { stem: safeStem(`${stamp}-${head}`), id_source: 'timestamp-githead' }
}

/** Resolve a path for a plan slug inside .omd/plans. */
export function planPath(workspace, slug) {
  return omdPath(workspace, 'plans', `${safeStem(slug)}.md`)
}

/** Resolve a draft path. */
export function draftPath(workspace, slug) {
  return omdPath(workspace, 'drafts', `${safeStem(slug)}.md`)
}

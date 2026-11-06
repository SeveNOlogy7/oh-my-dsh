import { readJsonSafe, writeJsonAtomic, removeFile } from '../core/atomic.js'
import { omdPath, safeStem } from '../core/paths.js'
import { MODE_NAMES } from '../core/constants.js'

export function modePath(workspace, stem) {
  return omdPath(workspace, 'runtime', safeStem(stem), 'mode.json')
}

export async function readMode(workspace, stem) {
  const read = await readJsonSafe(modePath(workspace, stem))
  if (!read.ok) return null
  const value = read.value
  if (!value || !MODE_NAMES.includes(value.mode)) return null
  return value
}

export async function writeMode({ workspace, stem, mode, runId, continuationRounds = 0 }) {
  if (!MODE_NAMES.includes(mode)) throw new Error(`unknown mode: ${mode}`)
  const state = {
    mode,
    run_id: runId ?? null,
    since: new Date().toISOString(),
    continuation_rounds: continuationRounds,
  }
  await writeJsonAtomic(modePath(workspace, stem), state)
  return state
}

export async function clearMode(workspace, stem) {
  await removeFile(modePath(workspace, stem))
}

export async function bumpContinuation(workspace, stem, mode) {
  const current = (await readMode(workspace, stem)) ?? {
    mode: mode ?? 'ultrawork',
    run_id: null,
    since: new Date().toISOString(),
    continuation_rounds: 0,
  }
  current.continuation_rounds = Number(current.continuation_rounds ?? 0) + 1
  await writeJsonAtomic(modePath(workspace, stem), current)
  return current
}

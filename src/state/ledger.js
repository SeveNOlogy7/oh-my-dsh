import { appendJsonl, readTextSafe } from '../core/atomic.js'
import { omdPath } from '../core/paths.js'

export function ledgerPath(workspace) {
  return omdPath(workspace, 'ledger.jsonl')
}

export async function appendLedger(workspace, event) {
  const record = {
    ts: new Date().toISOString(),
    event: event.event ?? 'event',
    ...event,
  }
  await appendJsonl(ledgerPath(workspace), record)
  return record
}

export async function readLedger(workspace, { limit = 20 } = {}) {
  const read = await readTextSafe(ledgerPath(workspace))
  if (!read.ok) return []
  const lines = read.value.split('\n').filter(Boolean)
  const out = []
  for (const line of lines.slice(-limit)) {
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip corrupt line
    }
  }
  return out
}

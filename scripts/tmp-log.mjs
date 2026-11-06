import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const dir = process.argv[2]
const files = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const file = path.join(dir, entry.name, 'session.v4.jsonl.zstd')
    try {
      const stat = fs.statSync(file)
      return { name: entry.name, file, mtime: stat.mtimeMs, size: stat.size }
    } catch {
      return null
    }
  })
  .filter(Boolean)
  .sort((a, b) => b.mtime - a.mtime)

for (const session of files.slice(0, Number(process.argv[3] ?? 3))) {
  console.log(`\n===== ${session.name} (${new Date(session.mtime).toISOString()}, ${session.size}B) =====`)
  try {
    const raw = zlib.zstdDecompressSync(fs.readFileSync(session.file))
    const lines = raw.toString('utf8').split('\n').filter(Boolean)
    console.log(`events: ${lines.length}`)
    for (const [index, line] of lines.entries()) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        console.log(index, 'UNPARSEABLE')
        continue
      }
      const type = event.type ?? '?'
      if (type === 'system/message' || type === 'request/header' || type === 'tool/result') {
        console.log(`${index} ${type} …`)
        continue
      }
      const summary = JSON.stringify(event.data ?? event)
      console.log(`${index} ${type} ${summary.length > 420 ? `${summary.slice(0, 420)}…` : summary}`)
    }
  } catch (error) {
    console.log('read failed:', error.message)
  }
}

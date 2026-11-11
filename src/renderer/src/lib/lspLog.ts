// Buffer of the "Output" panel: memory limit, merge of main's history with the lines that arrived live, and time.
import type { LspLogEntry } from '@shared/types'

export const LOG_LIMIT = 2000

function capped<T extends LspLogEntry>(entries: T[], limit: number): T[] {
  return entries.length > limit ? entries.slice(entries.length - limit) : entries
}

export function appendLog<T extends LspLogEntry>(entries: T[], entry: T, limit = LOG_LIMIT): T[] {
  return capped([...entries, entry], limit)
}

/** Several at once (Output groups the lines of a frame). */
export function appendLogs<T extends LspLogEntry>(entries: T[], batch: T[], limit = LOG_LIMIT): T[] {
  return batch.length === 0 ? entries : capped([...entries, ...batch], limit)
}

const keyOf = (e: LspLogEntry): string => `${e.time}\u0000${e.server}\u0000${e.level}\u0000${e.message}`

/**
 * History (`lsp.log()`) + lines received by `onLog` while it loaded. A line may be in both (main emitted it before
 * replying): the repeated ones from the history are dropped, one per occurrence.
 */
export function mergeLog<T extends LspLogEntry>(history: T[], live: T[], limit = LOG_LIMIT): T[] {
  const seen = new Map<string, number>()
  for (const e of history) seen.set(keyOf(e), (seen.get(keyOf(e)) ?? 0) + 1)
  const fresh = live.filter((e) => {
    const key = keyOf(e)
    const count = seen.get(key) ?? 0
    if (count === 0) return true
    seen.set(key, count - 1)
    return false
  })
  return capped([...history, ...fresh], limit)
}

const two = (n: number): string => String(n).padStart(2, '0')

/** Local time `HH:MM:SS`. */
export function formatLogTime(time: number): string {
  const d = new Date(time)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

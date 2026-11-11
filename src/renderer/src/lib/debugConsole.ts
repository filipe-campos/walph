// Debug Console lines: program output (which arrives in chunks), evaluated expressions and results.
import type { DebugOutputCategory, DebugOutputEntry } from '@shared/types'

const CONSOLE_LIMIT = 5000

type ConsoleEntryKind = 'output' | 'input' | 'result' | 'error'

export interface ConsoleEntry {
  id: number
  kind: ConsoleEntryKind
  /** Only in `output`. */
  category?: DebugOutputCategory
  sessionId?: string
  text: string
  /** Result with children (expandable while the program is paused). */
  variablesReference?: number
}

/**
 * Appends the new output to the end of the list. A chunk that continues a line without `\n` (same session and category)
 * goes into the previous entry, as in a terminal. The list never exceeds `limit` (drops the oldest).
 */
export function appendOutput(
  entries: readonly ConsoleEntry[],
  incoming: readonly DebugOutputEntry[],
  nextId: () => number,
  limit = CONSOLE_LIMIT
): ConsoleEntry[] {
  const out = [...entries]
  for (const chunk of incoming) {
    if (chunk.text === '') continue
    const last = out.at(-1)
    if (
      last?.kind === 'output' &&
      last.category === chunk.category &&
      last.sessionId === chunk.sessionId &&
      !last.text.endsWith('\n')
    ) {
      out[out.length - 1] = { ...last, text: last.text + chunk.text }
    } else {
      out.push({ id: nextId(), kind: 'output', category: chunk.category, sessionId: chunk.sessionId, text: chunk.text })
    }
  }
  return capEntries(out, limit)
}

export function appendEntry(
  entries: readonly ConsoleEntry[],
  entry: Omit<ConsoleEntry, 'id'>,
  nextId: () => number,
  limit = CONSOLE_LIMIT
): ConsoleEntry[] {
  return capEntries([...entries, { ...entry, id: nextId() }], limit)
}

function capEntries(entries: ConsoleEntry[], limit: number): ConsoleEntry[] {
  return entries.length > limit ? entries.slice(entries.length - limit) : entries
}

/** Displayed text: the final break of the chunk does not become an empty line. */
export function displayText(entry: ConsoleEntry): string {
  return entry.text.endsWith('\n') ? entry.text.slice(0, -1) : entry.text
}

/**
 * History of the evaluation field (↑/↓): `index` -1 = typing something new. Returns the new index and the text to show,
 * or `null` when there is nowhere to go.
 */
export function stepHistory(
  history: readonly string[],
  index: number,
  direction: 'up' | 'down'
): { index: number; text: string } | null {
  if (history.length === 0) return null
  if (direction === 'up') {
    const next = index === -1 ? history.length - 1 : index - 1
    const text = history[next]
    return text === undefined ? null : { index: next, text }
  }
  if (index === -1) return null
  const next = index + 1
  const text = history[next]
  return text === undefined ? { index: -1, text: '' } : { index: next, text }
}

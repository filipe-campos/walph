// Interpretation of the text typed in the quick input (mode by prefix, `file:line:column`, `line:column`).
// Line and column are 1-based for the user; `toReveal` converts to the 0-based column of the store's `Reveal`.

export type QuickInputMode = 'files' | 'commands' | 'line' | 'symbols' | 'workspaceSymbols'

/**
 * As in VS Code: `>` commands, `:` go to line, `@` file symbols, `#` workspace symbols, anything else
 * searches files.
 */
export function quickInputMode(query: string): QuickInputMode {
  if (query.startsWith('>')) return 'commands'
  if (query.startsWith(':')) return 'line'
  if (query.startsWith('@')) return 'symbols'
  if (query.startsWith('#')) return 'workspaceSymbols'
  return 'files'
}

export interface FileQuery {
  text: string
  line?: number
  column?: number
}

// Clamps to a safe integer: absurd typed numbers must not become NaN/Infinity in the editor.
const toPosition = (digits: string): number | undefined => {
  if (!digits) return undefined
  return Math.min(Math.max(Number(digits), 1), 2 ** 31 - 1)
}

/** `store.ts:30`, `store.ts:30:5`; tolerates `src/App.tsx:42:` and `App.tsx:` (an incomplete suffix is ignored). */
export function parseFileQuery(input: string): FileQuery {
  const trimmed = input.trim()
  const m = /^(.*?):(\d*)(?::(\d*))?$/.exec(trimmed)
  if (!m) return { text: trimmed }
  const line = toPosition(m[2] ?? '')
  const text = (m[1] ?? '').trim()
  if (line === undefined) return { text }
  const column = toPosition(m[3] ?? '')
  return column === undefined ? { text, line } : { text, line, column }
}

export type LineQuery = { status: 'empty' } | { status: 'invalid' } | { status: 'ok'; line: number; column?: number }

/** Input of the "Go to Line" mode: `:30`, `:30:5` or `30` (the leading `:` is optional). */
export function parseLineQuery(input: string): LineQuery {
  const text = input.trim().replace(/^:/, '').trim()
  if (!text) return { status: 'empty' }
  const m = /^(\d+)(?::(\d*))?$/.exec(text)
  if (!m) return { status: 'invalid' }
  const line = toPosition(m[1] ?? '')
  if (line === undefined) return { status: 'invalid' }
  const column = toPosition(m[2] ?? '')
  return column === undefined ? { status: 'ok', line } : { status: 'ok', line, column }
}

/** User 1-based position -> editor reveal (0-based column, no selection). Without a column, cursor at column 1. */
export function toReveal(line: number, column?: number): { line: number; column: number; length: number } {
  return { line, column: Math.max((column ?? 1) - 1, 0), length: 0 }
}

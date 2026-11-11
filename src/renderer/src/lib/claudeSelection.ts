// Editor selection in Claude's format (lines from 1, inclusive), the same as `@file#L10-20`.
import type { Text } from '@codemirror/state'
import type { ClaudeSelection } from '@shared/types'

/** Selection text sent to Claude: more than this is cut (the whole file can be cited with `@`). */
export const MAX_SELECTION_CHARS = 20_000

/** Non-empty selection of `doc`, or `null`. A selection that ends at the start of a line does not count that line. */
export function selectionOf(doc: Text, from: number, to: number, path: string): ClaudeSelection | null {
  if (from === to) return null
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  const first = doc.lineAt(start)
  let last = doc.lineAt(end)
  if (end === last.from && last.number > first.number) last = doc.line(last.number - 1)
  return {
    path,
    startLine: first.number,
    endLine: last.number,
    text: doc.sliceString(start, Math.min(end, start + MAX_SELECTION_CHARS))
  }
}

import type { LspPosition, LspTextChange } from '@shared/types'

/**
 * Offset (UTF-16) of an LSP position in the text. Lines separated by `\n`; a line past the end → end of the text and
 * a character past the line → end of the line (LSP tells the client/server to clamp like this).
 */
export function offsetAt(text: string, pos: LspPosition): number {
  let lineStart = 0
  for (let line = 0; line < pos.line; line++) {
    const nl = text.indexOf('\n', lineStart)
    if (nl === -1) return text.length
    lineStart = nl + 1
  }
  const nl = text.indexOf('\n', lineStart)
  const lineEnd = nl === -1 ? text.length : nl
  return Math.min(lineStart + Math.max(0, pos.character), lineEnd)
}

/** Applies the changes in sequence (each one over the result of the previous), as LSP defines. */
export function applyChanges(text: string, changes: readonly LspTextChange[]): string {
  let result = text
  for (const { range, text: inserted } of changes) {
    const start = offsetAt(result, range.start)
    const end = Math.max(start, offsetAt(result, range.end))
    result = result.slice(0, start) + inserted + result.slice(end)
  }
  return result
}

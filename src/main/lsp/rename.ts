import { isRecord } from '@shared/guards'
import type { LspPosition, LspRange } from '@shared/types'
import { asRange } from './shape'

/** Text of `range` in a text with `\n` (UTF-16 positions per line). Outside the text → empty. */
export function textInRange(text: string, range: LspRange): string {
  const lines = text.split('\n')
  const { start, end } = range
  if (start.line >= lines.length) return ''
  const first = lines[start.line] ?? ''
  if (start.line === end.line) return first.slice(start.character, end.character)
  const parts = [first.slice(start.character)]
  for (let line = start.line + 1; line < end.line && line < lines.length; line++) parts.push(lines[line] ?? '')
  const last = lines[end.line]
  if (last !== undefined) parts.push(last.slice(0, end.character))
  return parts.join('\n')
}

const WORD = /[\p{L}\p{N}_$]/u

/** Word (identifier) under the position: what the renderer would use without `prepareRename`. `null` outside a word. */
export function wordAt(text: string, position: LspPosition): LspRange | null {
  const line = text.split('\n')[position.line]
  if (line === undefined || position.character > line.length) return null
  // By UTF-16 units (same as LSP); letters outside the basic plane are excluded, acceptable for the fallback.
  let start = position.character
  let end = position.character
  while (start > 0 && WORD.test(line.slice(start - 1, start))) start--
  while (end < line.length && WORD.test(line.slice(end, end + 1))) end++
  if (start === end) return null
  return { start: { line: position.line, character: start }, end: { line: position.line, character: end } }
}

export interface PrepareRenameResult {
  range: LspRange
  placeholder: string
}

/**
 * Answer of `textDocument/prepareRename` (`Range | { range, placeholder } | { defaultBehavior } | null`). Without a
 * placeholder it uses the range's text in the mirror. `defaultBehavior` = "use the word under the cursor".
 */
export function normalizePrepareRename(raw: unknown, text: string, position: LspPosition): PrepareRenameResult | null {
  if (!raw) return null
  let range: LspRange | null
  let placeholder: string | undefined
  if (isRecord(raw) && raw.defaultBehavior === true) {
    range = wordAt(text, position)
  } else if (isRecord(raw) && 'range' in raw) {
    range = asRange(raw.range)
    if (typeof raw.placeholder === 'string') placeholder = raw.placeholder
  } else {
    range = asRange(raw)
  }
  if (!range) return null
  return { range, placeholder: placeholder ?? textInRange(text, range) }
}

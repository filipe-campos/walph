import { isRecord } from '@shared/guards'
import type { LspPosition, LspRange, LspTextEdit } from '@shared/types'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/** Server output is untrusted: these guards validate each piece before it becomes contract. */

export const isNonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

export function asPosition(v: unknown): LspPosition | null {
  if (!isRecord(v) || !isNonNegInt(v.line) || !isNonNegInt(v.character)) return null
  return { line: v.line, character: v.character }
}

export const comparePositions = (a: LspPosition, b: LspPosition): number => a.line - b.line || a.character - b.character

export function asRange(v: unknown): LspRange | null {
  if (!isRecord(v)) return null
  const start = asPosition(v.start)
  const end = asPosition(v.end)
  return start && end ? { start, end } : null
}

/** Valid `TextEdit` (includes `AnnotatedTextEdit`, which only adds `annotationId`); `null` if malformed. */
export function asTextEdit(v: unknown): LspTextEdit | null {
  if (!isRecord(v) || typeof v.newText !== 'string') return null
  const range = asRange(v.range)
  return range ? { range, newText: v.newText } : null
}

/** List of `TextEdit`: malformed items are dropped (the order of the rest is kept). */
export function asTextEdits(v: unknown): LspTextEdit[] {
  if (!Array.isArray(v)) return []
  const edits: LspTextEdit[] = []
  for (const item of v) {
    const edit = asTextEdit(item)
    if (edit) edits.push(edit)
  }
  return edits
}

export const malformedEdit = (): string => t().lsp.edit.malformed

/** Like `asTextEdits`, but throws on the first malformed edit (a partial edit would leave the project inconsistent). */
export function asTextEditsStrict(v: unknown): LspTextEdit[] {
  if (!Array.isArray(v)) throw new UserError(malformedEdit())
  return v.map((item) => {
    const edit = asTextEdit(item)
    if (!edit) throw new UserError(malformedEdit())
    return edit
  })
}

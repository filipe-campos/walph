import { isNonEmptyString, isRecord } from '@shared/guards'
import type { LspCompletionItem } from '@shared/types'
import { normalizeMarkup } from './markup'
import { asRange, asTextEdits } from './shape'

/** Lists of thousands of items (TS globals) still fit in IPC; above this the server's filter should kick in. */
export const COMPLETION_LIMIT = 5000

export function normalizeCompletionItem(raw: unknown, resolvable: boolean): LspCompletionItem | null {
  if (!isRecord(raw) || typeof raw.label !== 'string' || raw.label === '') return null
  const item: LspCompletionItem = {
    label: raw.label,
    insertText: raw.label,
    insertTextFormat: raw.insertTextFormat === 2 ? 'snippet' : 'plain',
    resolvable
  }
  if (typeof raw.kind === 'number' && Number.isInteger(raw.kind) && raw.kind >= 1 && raw.kind <= 25) {
    item.kind = raw.kind
  }
  if (isNonEmptyString(raw.detail)) item.detail = raw.detail
  const documentation = normalizeMarkup(raw.documentation, true)
  if (documentation) item.documentation = documentation
  if (typeof raw.sortText === 'string') item.sortText = raw.sortText
  if (typeof raw.filterText === 'string') item.filterText = raw.filterText

  const edit = raw.textEdit
  if (isRecord(edit) && typeof edit.newText === 'string') {
    // `InsertReplaceEdit` carries `insert` and `replace`: we use the insert range (keeps the rest of the word).
    const range = asRange(edit.range) ?? asRange(edit.insert)
    if (range) {
      item.textEdit = { range, newText: edit.newText }
      item.insertText = edit.newText
    }
  }
  if (!item.textEdit && typeof raw.insertText === 'string') item.insertText = raw.insertText
  const extra = asTextEdits(raw.additionalTextEdits)
  if (extra.length > 0) item.additionalTextEdits = extra
  if (Array.isArray(raw.commitCharacters)) {
    const chars = raw.commitCharacters.filter((c): c is string => isNonEmptyString(c))
    if (chars.length > 0) item.commitCharacters = chars
  }
  return item
}

export interface NormalizedCompletion {
  isIncomplete: boolean
  items: LspCompletionItem[]
  /** Raw server items, aligned by index with `items` (they go to `completionItem/resolve`). */
  raws: Record<string, unknown>[]
}

/** `CompletionList | CompletionItem[] | null`. `resolvable` = the server has `completionItem/resolve`. */
export function normalizeCompletion(raw: unknown, resolvable: boolean): NormalizedCompletion {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.items) ? raw.items : []
  const isIncomplete = isRecord(raw) && raw.isIncomplete === true
  const items: LspCompletionItem[] = []
  const raws: Record<string, unknown>[] = []
  for (const entry of list) {
    if (items.length >= COMPLETION_LIMIT) break
    const item = normalizeCompletionItem(entry, resolvable)
    if (!item) continue
    items.push(item)
    raws.push(entry as Record<string, unknown>)
  }
  return { isIncomplete: isIncomplete || list.length > COMPLETION_LIMIT, items, raws }
}

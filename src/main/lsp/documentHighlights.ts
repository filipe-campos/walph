import { isRecord } from '@shared/guards'
import type { LspDocumentHighlight } from '@shared/types'
import { asRange, comparePositions } from './shape'

const DOCUMENT_HIGHLIGHT_LIMIT = 2000

/** `DocumentHighlight[] | null`: without `kind` it is `Text` (the specification's default). */
export function normalizeDocumentHighlights(raw: unknown): LspDocumentHighlight[] {
  if (!Array.isArray(raw)) return []
  const result: LspDocumentHighlight[] = []
  for (const item of raw) {
    if (result.length >= DOCUMENT_HIGHLIGHT_LIMIT) break
    const range = isRecord(item) ? asRange(item.range) : null
    if (!range || comparePositions(range.start, range.end) > 0) continue
    const kind = isRecord(item) && item.kind === 2 ? 'read' : isRecord(item) && item.kind === 3 ? 'write' : 'text'
    result.push({ range, kind })
  }
  return result.sort((a, b) => comparePositions(a.range.start, b.range.start))
}

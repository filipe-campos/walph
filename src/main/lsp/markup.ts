import { isRecord } from '@shared/guards'
import type { LspHover, LspMarkup } from '@shared/types'
import { asRange } from './shape'

/** Huge documentation does not help and costs IPC/rendering: truncate it. */
export const MARKUP_LIMIT = 100_000

/** Markdown code block; the fence is longer than any backtick run in the content. */
function fenced(language: string, value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${value}\n${fence}`
}

function markedString(v: unknown): string | null {
  // A `MarkedString` as a string is markdown; `{ language, value }` is code.
  if (typeof v === 'string') return v
  if (isRecord(v) && typeof v.value === 'string') {
    return typeof v.language === 'string' ? fenced(v.language.replace(/[^\w+#.-]/g, ''), v.value) : v.value
  }
  return null
}

/**
 * `string | MarkedString | MarkedString[] | MarkupContent` → `LspMarkup`. `null` if no text is left.
 * `plainOnly`: a bare `string` (item documentation, `documentation`) is plain text, not markdown.
 */
export function normalizeMarkup(v: unknown, plainOnly = false): LspMarkup | null {
  let result: LspMarkup | null = null
  if (typeof v === 'string') {
    result = { kind: plainOnly ? 'plaintext' : 'markdown', value: v }
  } else if (Array.isArray(v)) {
    const parts = v.map(markedString).filter((p): p is string => p !== null && p.trim() !== '')
    result = { kind: 'markdown', value: parts.join('\n\n') }
  } else if (isRecord(v) && typeof v.value === 'string') {
    if (v.kind === 'markdown' || v.kind === 'plaintext') result = { kind: v.kind, value: v.value }
    else result = { kind: 'markdown', value: markedString(v) ?? '' }
  }
  if (!result || result.value.trim() === '') return null
  return result.value.length > MARKUP_LIMIT ? { ...result, value: result.value.slice(0, MARKUP_LIMIT) } : result
}

export function normalizeHover(raw: unknown): LspHover | null {
  if (!isRecord(raw)) return null
  const contents = normalizeMarkup(raw.contents)
  if (!contents) return null
  const range = asRange(raw.range)
  return range ? { contents, range } : { contents }
}

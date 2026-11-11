// Slice of the file shown in the preview (peek): only the lines around the target become DOM.
import type { CodeSpan } from './codeHighlight'

const CONTEXT_LINES = 200
/** Above this the file shows without highlighting: parsing everything on every location change would hang typing. */
export const HIGHLIGHT_MAX_CHARS = 1_000_000

/** Lines `[from, to)` (0-based) around `[startLine, endLine]`, inside the file. */
export function previewWindow(
  lineCount: number,
  startLine: number,
  endLine: number,
  radius: number = CONTEXT_LINES
): { from: number; to: number } {
  const last = Math.max(lineCount - 1, 0)
  const start = Math.min(Math.max(startLine, 0), last)
  const end = Math.min(Math.max(endLine, start), last)
  return { from: Math.max(start - radius, 0), to: Math.min(end + radius + 1, lineCount) }
}

/** Splits highlighted spans into lines (`\n`), keeping the class of each piece. */
export function splitSpanLines(spans: readonly CodeSpan[]): CodeSpan[][] {
  const lines: CodeSpan[][] = [[]]
  for (const span of spans) {
    const parts = span.text.split('\n')
    parts.forEach((text, i) => {
      if (i > 0) lines.push([])
      if (text) lines.at(-1)?.push({ text, cls: span.cls })
    })
  }
  return lines
}

export interface MarkedSpan extends CodeSpan {
  /** Inside the highlighted span (the target symbol). */
  mark: boolean
}

/** Cuts the spans of a line at `[from, to)` (UTF-16 columns) to highlight the target. */
export function markColumns(spans: readonly CodeSpan[], from: number, to: number): MarkedSpan[] {
  const result: MarkedSpan[] = []
  let pos = 0
  for (const span of spans) {
    const start = pos
    const end = pos + span.text.length
    pos = end
    const cuts = [start, Math.min(Math.max(from, start), end), Math.min(Math.max(to, start), end), end]
    for (let i = 0; i < 3; i++) {
      const a = cuts[i] ?? start
      const b = cuts[i + 1] ?? end
      if (b > a) result.push({ text: span.text.slice(a - start, b - start), cls: span.cls, mark: i === 1 })
    }
  }
  return result
}

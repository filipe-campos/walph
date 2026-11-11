// Pure detection of file links in a terminal text line (without xterm or DOM): the caller validates their
// existence (`terminal.resolveLink`) and converts the indexes into cells.

export interface FileLinkCandidate {
  /** Indexes in the line text (`end` exclusive), covering the path and the `:line:column` / `(line,column)` suffix. */
  start: number
  end: number
  /** Only the path, as written (relative, `~/…`, absolute, `C:\…`). */
  path: string
  /** From 1, as the tools print it. */
  line?: number
  column?: number
}

// The path starts after a space, quotes, brackets or `=` (`--file=src/a.ts`), never in the middle of a word.
// The body has no `:` (except the `C:\` drive), nor parentheses: `src/a.ts(12,5)` is the tsc format.
const FILE_RE =
  /(?<=^|[\s'"`<>()[\]{},;=|])((?:[A-Za-z]:[\\/])?[^\s:'"`<>()[\]{}|,;=*?]+)(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))?/g

// URLs stay with the web-links addon: a path inside a URL is not a file link.
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s'"`<>]+/gi

const HAS_EXTENSION = /\.[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*$/

/** Bare text only becomes a candidate with a separator or an extension (`error`, `TS2739`, `1.5` are not paths). */
function looksLikePath(text: string): boolean {
  if (!/[A-Za-z0-9]/.test(text)) return false
  return /[\\/]/.test(text) || HAS_EXTENSION.test(text)
}

export function findFileLinks(text: string): FileLinkCandidate[] {
  const urls: [number, number][] = []
  for (const m of text.matchAll(URL_RE)) urls.push([m.index, m.index + m[0].length])

  const result: FileLinkCandidate[] = []
  for (const m of text.matchAll(FILE_RE)) {
    let body = m[1] ?? ''
    const hasSuffix = m[2] !== undefined || m[4] !== undefined
    // Sentence-ending punctuation ("see src/a.ts.") is not part of the path.
    if (!hasSuffix) body = body.replace(/[.!]+$/, '')
    if (!looksLikePath(body)) continue
    const start = m.index
    const end = hasSuffix ? m.index + m[0].length : start + body.length
    if (urls.some(([from, to]) => start < to && end > from)) continue
    const lineText = m[2] ?? m[4]
    const columnText = m[3] ?? m[5]
    const link: FileLinkCandidate = { start, end, path: body }
    if (lineText !== undefined) {
      link.line = Math.max(1, Number(lineText))
      if (columnText !== undefined) link.column = Math.max(1, Number(columnText))
    }
    result.push(link)
  }
  return result
}

/** A cell of the xterm buffer: text (empty = blank cell) and width (0 = half of a wide character). */
export interface CellInfo {
  chars: string
  width: number
}

export interface JoinedRows {
  text: string
  /** For each UTF-16 unit of `text`: the cell (x from 0, row from 0 in the group) where it starts. */
  cells: { x: number; y: number }[]
  /** Width in cells of the character that starts at each UTF-16 unit of `text`. */
  widths: number[]
}

/**
 * Joins the visual lines of a logical line (wrapped by the terminal) into a single text, keeping which cell each
 * character comes from: wide characters (CJK, emoji) take two cells, so the index in the text is not the column.
 */
export function joinRows(rows: CellInfo[][]): JoinedRows {
  let text = ''
  const cells: { x: number; y: number }[] = []
  const widths: number[] = []
  rows.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.width === 0) return
      const chars = cell.chars === '' ? ' ' : cell.chars
      text += chars
      for (let i = 0; i < chars.length; i++) {
        cells.push({ x, y })
        widths.push(cell.width)
      }
    })
  })
  return { text, cells, widths }
}

export interface BufferRange {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/**
 * Text range `[start, end)` → xterm buffer range (x and y from 1, inclusive end), with `firstY`
 * being the row (from 1) of the first visual line of the group.
 */
export function rangeOf(joined: JoinedRows, start: number, end: number, firstY: number): BufferRange | null {
  const from = joined.cells[start]
  const last = joined.cells[end - 1]
  if (!from || !last) return null
  return {
    start: { x: from.x + 1, y: firstY + from.y },
    end: { x: last.x + (joined.widths[end - 1] ?? 1), y: firstY + last.y }
  }
}

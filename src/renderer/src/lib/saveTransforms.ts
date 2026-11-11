// Whitespace adjustments made on save (`files.trimTrailingWhitespace`, `files.insertFinalNewline`,
// `files.trimFinalNewlines` and the EditorConfig equivalents). Pure: returns edits over the text (already with `\n`).
import type { TextEdit } from '@shared/searchReplace'

export interface SaveTransformOptions {
  trimTrailingWhitespace: boolean
  insertFinalNewline: boolean
  trimFinalNewlines: boolean
}

const TRAILING = /[ \t]+$/

/**
 * Edits (offsets of `text`, sorted and non-overlapping) that apply the options. `protectedLines` (1-based) are the
 * lines with a cursor on an auto save: they neither lose the trailing whitespace nor get trimmed from the end, as in
 * VS Code (the user is still typing there). Applying the result again changes nothing.
 */
export function saveTransformEdits(
  text: string,
  options: SaveTransformOptions,
  protectedLines: ReadonlySet<number> = new Set()
): TextEdit[] {
  const lines = text.split('\n')
  const starts: number[] = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }
  const lineStart = (n: number): number => starts[n - 1] ?? 0
  const lineEnd = (n: number): number => lineStart(n) + (lines[n - 1]?.length ?? 0)
  const lastLine = lines.length

  let lastContent = 0
  for (let n = lastLine; n >= 1; n--) {
    if ((lines[n - 1] ?? '').trim() !== '') {
      lastContent = n
      break
    }
  }
  const lastProtected = Math.max(0, ...protectedLines)

  // Trimming the empty lines at the end: from the last one with content (or with a cursor), a single newline remains.
  let cutFrom = 0
  if (options.trimFinalNewlines && lastContent > 0) {
    const keep = Math.max(lastContent, lastProtected)
    if (keep < lastLine && text.slice(lineEnd(keep)) !== '\n') cutFrom = keep
  }

  const edits: TextEdit[] = []
  if (options.trimTrailingWhitespace) {
    const last = cutFrom > 0 ? cutFrom : lastLine
    for (let n = 1; n <= last; n++) {
      if (protectedLines.has(n)) continue
      const match = TRAILING.exec(lines[n - 1] ?? '')
      if (match) edits.push({ from: lineStart(n) + match.index, to: lineEnd(n), insert: '' })
    }
  }
  if (cutFrom > 0) {
    edits.push({ from: lineEnd(cutFrom), to: text.length, insert: '\n' })
    return edits
  }
  if (options.insertFinalNewline && !text.endsWith('\n')) {
    const tail = lines[lastLine - 1] ?? ''
    const trimmed = options.trimTrailingWhitespace && !protectedLines.has(lastLine) ? tail.replace(TRAILING, '') : tail
    if (trimmed !== '') edits.push({ from: text.length, to: text.length, insert: '\n' })
  }
  return edits
}

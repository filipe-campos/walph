// Application of LSP `TextEdit`s (rename, code actions, formatting, auto-import). Pure: converts the edits to
// offsets of a `Text` and applies them without one shifting the other.
import { Text } from '@codemirror/state'
import { t } from '@shared/i18n'
import type { TextEdit } from '@shared/searchReplace'
import type { LspTextEdit } from '@shared/types'
import { lspRangeToOffsets } from '@shared/lspPosition'
import { splitLines } from './textFormat'

/**
 * LSP edits → offset edits over `doc`, sorted and non-overlapping. All the positions apply to the document BEFORE
 * any edit of the list (LSP rule). Insertions at the same position keep the array order (the server relies on it,
 * e.g. several imports at the same point); an insertion comes before a replacement that starts at the same point.
 * Overlapping edits throw: applying them that way would corrupt the file.
 */
export function lspEditsToOffsetEdits(doc: Text, edits: LspTextEdit[]): TextEdit[] {
  const converted = edits.map((edit, index) => {
    const { from, to } = lspRangeToOffsets(doc, edit.range)
    return { from, to, insert: edit.newText, index }
  })
  converted.sort((a, b) => a.from - b.from || a.to - a.from - (b.to - b.from) || a.index - b.index)
  for (let i = 1; i < converted.length; i++) {
    const previous = converted[i - 1]
    const current = converted[i]
    if (previous && current && current.from < previous.to) throw new Error(t().lsp.edit.overlapping)
  }
  return converted.map(({ from, to, insert }) => ({ from, to, insert }))
}

/**
 * Applies edits (offsets of the original text, non-overlapping) in REVERSE order: each one only touches what is after
 * the ones still to apply, so the original offsets stay valid until the end.
 */
export function applyOffsetEdits(text: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => a.from - b.from || a.to - b.to)
  let result = text
  for (let i = ordered.length - 1; i >= 0; i--) {
    const edit = ordered[i]
    if (!edit) continue
    const { from, to, insert } = edit
    result = result.slice(0, from) + insert + result.slice(to)
  }
  return result
}

/**
 * Applies LSP edits to a text read from disk; the result comes out with `\n` (whoever writes reapplies the file EOL).
 */
export function applyLspEditsToText(text: string, edits: LspTextEdit[]): string {
  const normalized = splitLines(text).join('\n')
  const doc = Text.of(splitLines(text))
  return applyOffsetEdits(normalized, lspEditsToOffsetEdits(doc, edits))
}

// Conversion between LSP positions (line and `character` from 0, in UTF-16 units) and CodeMirror offsets (also in
// UTF-16). The units match; the care is with lines/columns outside the document (the server may be talking about an
// older version) and with surrogate pairs, which can never be cut in half.
import type { ChangeSet, Text } from '@codemirror/state'
import type { LspPosition, LspRange, LspTextChange } from './types'

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/** If `offset` falls in the middle of a surrogate pair, returns the nearest valid boundary in the `bias` direction. */
function snapToBoundary(doc: Text, offset: number, bias: -1 | 1): number {
  if (offset <= 0 || offset >= doc.length) return offset
  const pair = doc.sliceString(offset - 1, offset + 1)
  if (isHighSurrogate(pair.charCodeAt(0)) && isLowSurrogate(pair.charCodeAt(1)))
    return bias < 0 ? offset - 1 : offset + 1
  return offset
}

/** Offset → LSP position. An offset outside the document is clamped to it. */
export function offsetToLspPosition(doc: Text, offset: number): LspPosition {
  const clamped = Math.min(Math.max(Math.trunc(offset) || 0, 0), doc.length)
  const line = doc.lineAt(clamped)
  return { line: line.number - 1, character: clamped - line.from }
}

/**
 * LSP position → offset. A line past the end means the end of the document; a `character` past the end of the line
 * means the end of the line (LSP rule). `bias` decides where to go when the position falls in the middle of a
 * surrogate pair: `-1` moves back (start of a span), `1` moves forward (end of a span).
 */
export function lspPositionToOffset(doc: Text, position: LspPosition, bias: -1 | 1 = -1): number {
  const line = Math.trunc(position.line)
  if (!(line >= 0)) return 0
  if (line >= doc.lines) return doc.length
  const info = doc.line(line + 1)
  const character = Math.trunc(position.character)
  const offset = info.from + Math.min(Math.max(character >= 0 ? character : 0, 0), info.length)
  return snapToBoundary(doc, offset, bias)
}

/** LSP range → offsets (`from` moves back and `to` forward in a surrogate pair, so the span never shrinks in it). */
export function lspRangeToOffsets(doc: Text, range: LspRange): { from: number; to: number } {
  const from = lspPositionToOffset(doc, range.start, -1)
  const to = lspPositionToOffset(doc, range.end, 1)
  return { from, to: Math.max(from, to) }
}

/**
 * CodeMirror changes → LSP `contentChanges`. The `ChangeSet` describes everything in coordinates of the initial
 * document (`startDoc`), non-overlapping and in ascending order. LSP applies the changes in sequence, each on the
 * result of the previous one; emitting them in DESCENDING position order, a change never shifts what comes before, so
 * the positions computed on `startDoc` stay valid to the end.
 */
export function changesToLsp(startDoc: Text, changes: ChangeSet): LspTextChange[] {
  const result: LspTextChange[] = []
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    result.push({
      range: { start: offsetToLspPosition(startDoc, fromA), end: offsetToLspPosition(startDoc, toA) },
      text: inserted.toString()
    })
  })
  return result.reverse()
}

/** LSP span → what the editor selects on reveal: 1-based line, 0-based column and length (0 if it spans lines). */
export function rangeToReveal(range: LspRange): { line: number; column: number; length: number } {
  const { start, end } = range
  return {
    line: start.line + 1,
    column: start.character,
    length: end.line === start.line ? Math.max(end.character - start.character, 0) : 0
  }
}

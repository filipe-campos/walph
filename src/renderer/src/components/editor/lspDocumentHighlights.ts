// Occurrences of the symbol under the cursor (`textDocument/documentHighlight`), with distinct read/write/text, and the
// navigation between them. Without a server, the navigation uses the whole word occurrences.
import { SearchCursor } from '@codemirror/search'
import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text
} from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { LspDocumentHighlight, LspDocumentHighlightKind } from '@shared/types'
import { lspRangeToOffsets, offsetToLspPosition } from '@shared/lspPosition'
import { lspFetch } from './lspFetch'

const DELAY_MS = 250
/** A word with more occurrences than this is not worth navigating through the text (huge file). */
const WORD_OCCURRENCE_LIMIT = 5000

const marks: Record<LspDocumentHighlightKind, Decoration> = {
  text: Decoration.mark({ class: 'cm-lsp-highlight cm-lsp-highlight-text' }),
  read: Decoration.mark({ class: 'cm-lsp-highlight cm-lsp-highlight-read' }),
  write: Decoration.mark({ class: 'cm-lsp-highlight cm-lsp-highlight-write' })
}

function highlightDecorations(doc: Text, highlights: readonly LspDocumentHighlight[]): DecorationSet {
  const ranges = []
  for (const h of highlights) {
    const { from, to } = lspRangeToOffsets(doc, h.range)
    if (to > from) ranges.push(marks[h.kind].range(from, to))
  }
  return Decoration.set(ranges, true)
}

const setHighlights = StateEffect.define<DecorationSet>()

const touches = (set: DecorationSet, pos: number): boolean => {
  let hit = false
  set.between(pos, pos, () => {
    hit = true
    return false
  })
  return hit
}

const highlightsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setHighlights)) return effect.value
    if (tr.docChanged) return Decoration.none
    // A cursor moving inside an occurrence keeps the highlight; outside it, it goes away until the next request.
    if (tr.selection && value.size > 0 && !touches(value, tr.state.selection.main.head)) return Decoration.none
    return value
  },
  provide: (field) => EditorView.decorations.from(field)
})

/** Occurrences of the symbol (the server ones) or, without them, of the whole word under the cursor. */
function occurrenceRanges(state: EditorState): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  state.field(highlightsField, false)?.between(0, state.doc.length, (from, to) => void ranges.push({ from, to }))
  if (ranges.length > 0) return ranges
  const word = state.wordAt(state.selection.main.head)
  if (!word) return []
  const cursor = new SearchCursor(state.doc, state.sliceDoc(word.from, word.to))
  while (!cursor.next().done && ranges.length < WORD_OCCURRENCE_LIMIT) {
    const { from, to } = cursor.value
    const whole = state.wordAt(from)
    if (whole?.from === from && whole.to === to) ranges.push({ from, to })
  }
  return ranges
}

/** Selects the next (`1`) or previous (`-1`) occurrence, wrapping around the file. `false` if there is none. */
export function jumpToOccurrence(view: EditorView, dir: 1 | -1): boolean {
  const ranges = occurrenceRanges(view.state)
  if (ranges.length === 0) return false
  const at = view.state.selection.main.from
  const target =
    dir === 1 ? (ranges.find((r) => r.from > at) ?? ranges[0]) : (ranges.findLast((r) => r.from < at) ?? ranges.at(-1))
  if (!target) return false
  view.dispatch({ selection: EditorSelection.single(target.from, target.to), scrollIntoView: true })
  return true
}

export function lspDocumentHighlights(tabId: string): Extension {
  return [
    highlightsField,
    lspFetch<LspDocumentHighlight[]>(tabId, {
      feature: 'documentHighlights',
      delay: DELAY_MS,
      // With a visible highlight the cursor is on an occurrence: the result stays the same.
      shouldFetch: (u) => u.docChanged || (u.selectionSet && u.state.field(highlightsField).size === 0),
      request: (view, path) =>
        window.api.lsp.documentHighlights(path, offsetToLspPosition(view.state.doc, view.state.selection.main.head)),
      apply: (view, highlights, doc) => {
        if (!highlights?.length && view.state.field(highlightsField).size === 0) return
        const set = highlights ? highlightDecorations(doc, highlights) : Decoration.none
        // The response is for where the cursor was when asking: if it already left, it does not hold.
        if (set.size > 0 && !touches(set, view.state.selection.main.head)) return
        view.dispatch({ effects: setHighlights.of(set) })
      }
    })
  ]
}

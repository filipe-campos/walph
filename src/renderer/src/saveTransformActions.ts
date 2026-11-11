// Whitespace adjustments on save (settings + EditorConfig), composed with the "format on save" edits in a single
// transaction: one undo for everything the save changed in the text.
import { ChangeSet } from '@codemirror/state'
import type { TextEdit } from '@shared/searchReplace'
import { applyTabEdits } from './components/editor/documentStore'
import { currentState } from './components/editor/groupViews'
import { saveTransformEdits, type SaveTransformOptions } from './lib/saveTransforms'
import { tabEditorConfig } from './editorConfigActions'
import { get } from './store'

function optionsFor(tabId: string): SaveTransformOptions {
  const { settings } = get()
  const props = tabEditorConfig(tabId)
  return {
    trimTrailingWhitespace: props.trimTrailingWhitespace ?? settings['files.trimTrailingWhitespace'],
    insertFinalNewline: props.insertFinalNewline ?? settings['files.insertFinalNewline'],
    trimFinalNewlines: settings['files.trimFinalNewlines']
  }
}

/**
 * Applies `baseEdits` (offsets of the current document, e.g. the formatter's) and the save adjustments on top of them,
 * in one transaction. `auto`: auto save, which does not touch the lines with a cursor. `true` if the text changed.
 */
export function applySaveTransforms(
  tabId: string,
  baseEdits: readonly TextEdit[] = [],
  { auto = false }: { auto?: boolean } = {}
): boolean {
  const state = currentState(tabId)
  if (!state) return false
  const base = ChangeSet.of(
    baseEdits.map(({ from, to, insert }) => ({ from, to, insert })),
    state.doc.length
  )
  const doc = base.apply(state.doc)
  const protectedLines = auto
    ? new Set(state.selection.ranges.map((r) => doc.lineAt(base.mapPos(r.head)).number))
    : undefined
  const edits = saveTransformEdits(doc.toString(), optionsFor(tabId), protectedLines)
  const combined = edits.length > 0 ? base.compose(ChangeSet.of(edits, doc.length)) : base
  if (combined.empty) return false
  const changes: TextEdit[] = []
  combined.iterChanges((fromA, toA, _fromB, _toB, inserted) =>
    changes.push({ from: fromA, to: toA, insert: inserted.toString() })
  )
  return applyTabEdits(tabId, changes)
}

// LSP diagnostics in CodeMirror via `@codemirror/lint`. There is no `linter()`: the store pushes the diagnostics
// (the server publishDiagnostics), through `setDiagnostics` on each EditorState (the visible tab's through the view,
// the
// hidden ones' directly on the stored state), the same "one EditorState per tab" pattern. Once applied, CodeMirror
// remaps the diagnostics through the following edits. Those of a version older than the document only enter with the
// positions clamped to it (they may be slightly off) until the server republishes, which tsserver does quickly.
import type { EditorState, TransactionSpec } from '@codemirror/state'
import { diagnosticCount, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import type { Diagnostic } from '@shared/types'
import { omitUndefined } from '@shared/omitUndefined'
import { lspRangeToOffsets } from '@shared/lspPosition'
import { formatDiagnosticSource } from '../../lib/problems'

/** LSP → CodeMirror diagnostics, with positions clamped to the document (the server may be one version behind). */
function toCmDiagnostics(state: EditorState, diagnostics: Diagnostic[]): CmDiagnostic[] {
  return diagnostics.map((d) => {
    const { from, to } = lspRangeToOffsets(state.doc, d.range)
    return {
      from,
      to,
      severity: d.severity,
      message: d.message,
      // CodeMirror shows `source` next to the message in the tooltip: "ts(2322)".
      ...omitUndefined({ source: formatDiagnosticSource(d) || undefined })
    }
  })
}

/**
 * Builds the transaction that replaces the state diagnostics and hands it to `dispatch`. An empty list on a state
 * without any does nothing.
 */
export function setDiagnosticsOn(
  state: EditorState,
  diagnostics: Diagnostic[],
  dispatch: (spec: TransactionSpec) => void
): void {
  if (diagnostics.length === 0 && diagnosticCount(state) === 0) return
  dispatch(setDiagnostics(state, toCmDiagnostics(state, diagnostics)))
}

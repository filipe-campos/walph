// Marks the overview ruler and the minimap share: lines changed in git and LSP/lint problems.
import { forEachDiagnostic } from '@codemirror/lint'
import type { EditorState } from '@codemirror/state'
import { gitMarksOf, type GitMarkLine } from './gitGutter'

interface DiagnosticLine {
  line: number
  severity: 'error' | 'warning'
}

export interface OverviewMarks {
  git: GitMarkLine[]
  diagnostics: DiagnosticLine[]
}

/** Errors and warnings per line (info/hint do not count: they would be noise on the ruler). */
function diagnosticLinesOf(state: EditorState): DiagnosticLine[] {
  const out: DiagnosticLine[] = []
  const doc = state.doc
  forEachDiagnostic(state, (d, from) => {
    if (d.severity !== 'error' && d.severity !== 'warning') return
    out.push({ line: doc.lineAt(Math.min(from, doc.length)).number, severity: d.severity })
  })
  return out
}

export function overviewMarksOf(state: EditorState): OverviewMarks {
  return { git: gitMarksOf(state), diagnostics: diagnosticLinesOf(state) }
}

/** Value of a theme CSS variable (empty if it does not exist). */
export function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}

/**
 * Notifies when the theme changes (CSS variables written on the root): allows caching colors instead of calling
 * `getComputedStyle` on every draw. Returns the cleanup function.
 */
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
  return () => observer.disconnect()
}

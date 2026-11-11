// Merge conflicts in the editor: colors on the current/incoming blocks (and the diff3 base), labels on the markers and,
// above each conflict, the "Accept current / incoming / both / Compare" actions. The blocks are reread on every text
// change (only a line scan; the full parse only runs if there is a start marker).
import { EditorSelection, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { t } from '@shared/i18n'
import { MAX_GUTTER_LINES } from '../../lib/gitGutter'
import { parseConflicts, resolveConflict, type ConflictChoice, type MergeConflict } from '../../lib/mergeConflicts'
import { lspTabId } from './lspHost'

export interface MergeHost {
  /** "Compare Changes": opens the diff between the two versions of the tab file. */
  compare(tabId: string): void
}

let host: MergeHost = { compare: () => {} }

export function bindMergeHost(next: MergeHost): void {
  host = next
}

interface ConflictState {
  conflicts: MergeConflict[]
  decorations: DecorationSet
}

function hasStartMarker(doc: Text): boolean {
  for (const iter = doc.iterLines(); !iter.next().done;) if (iter.value.startsWith('<<<<<<<')) return true
  return false
}

const lineDeco = (className: string): Decoration => Decoration.line({ class: className })

class Label extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  override eq(other: Label): boolean {
    return other.text === this.text
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-merge-label'
    span.textContent = this.text
    return span
  }
}

const CHOICES: readonly { choice: ConflictChoice | 'compare'; label: () => string }[] = [
  { choice: 'current', label: () => t().git.merge.acceptCurrent },
  { choice: 'incoming', label: () => t().git.merge.acceptIncoming },
  { choice: 'both', label: () => t().git.merge.acceptBoth },
  { choice: 'compare', label: () => t().git.merge.compare }
]

class Actions extends WidgetType {
  constructor(readonly start: number) {
    super()
  }
  override eq(other: Actions): boolean {
    return other.start === this.start
  }
  toDOM(view: EditorView): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'cm-merge-actions'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', t().git.merge.conflictActions)
    for (const { choice, label } of CHOICES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'cm-merge-action'
      button.dataset.choice = choice
      button.textContent = label()
      // Without stealing focus or moving the editor selection.
      button.addEventListener('mousedown', (e) => e.preventDefault())
      button.addEventListener('click', () => {
        if (choice === 'compare') return host.compare(view.state.facet(lspTabId))
        const conflict = conflictAt(view.state, view.posAtDOM(bar))
        if (conflict) acceptConflicts(view, [conflict], choice)
      })
      bar.append(button)
    }
    return bar
  }
  override ignoreEvent(): boolean {
    return true
  }
}

function compute(doc: Text): ConflictState {
  if (doc.lines > MAX_GUTTER_LINES || !hasStartMarker(doc)) return { conflicts: [], decorations: Decoration.none }
  const conflicts = parseConflicts(doc.toJSON())
  const ranges: Range<Decoration>[] = []
  const mark = (index: number, className: string): void => {
    ranges.push(lineDeco(className).range(doc.line(index + 1).from))
  }
  const m = t().git.merge
  for (const c of conflicts) {
    const startLine = doc.line(c.start + 1)
    ranges.push(Decoration.widget({ widget: new Actions(c.start), block: true, side: -1 }).range(startLine.from))
    mark(c.start, 'cm-merge-marker cm-merge-current-marker')
    ranges.push(Decoration.widget({ widget: new Label(m.currentChange), side: 1 }).range(startLine.to))
    const currentEnd = c.base ?? c.separator
    for (let i = c.start + 1; i < currentEnd; i++) mark(i, 'cm-merge-current')
    if (c.base !== null) for (let i = c.base; i < c.separator; i++) mark(i, 'cm-merge-base')
    mark(c.separator, 'cm-merge-marker cm-merge-separator')
    for (let i = c.separator + 1; i < c.end; i++) mark(i, 'cm-merge-incoming')
    mark(c.end, 'cm-merge-marker cm-merge-incoming-marker')
    ranges.push(Decoration.widget({ widget: new Label(m.incomingChange), side: 1 }).range(doc.line(c.end + 1).to))
  }
  return { conflicts, decorations: Decoration.set(ranges, true) }
}

const conflictField = StateField.define<ConflictState>({
  create: (state) => compute(state.doc),
  update: (value, tr) => (tr.docChanged ? compute(tr.newDoc) : value),
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
})

export function mergeConflicts(): Extension {
  return conflictField
}

export function conflictsOf(state: EditorState): MergeConflict[] {
  return state.field(conflictField, false)?.conflicts ?? []
}

function conflictAt(state: EditorState, pos: number): MergeConflict | undefined {
  const line = state.doc.lineAt(pos).number - 1
  return conflictsOf(state).find((c) => line >= c.start && line <= c.end)
}

/** Replaces each conflict with the chosen side, in a single transaction (one undo). */
function acceptConflicts(view: EditorView, conflicts: readonly MergeConflict[], choice: ConflictChoice): void {
  const doc = view.state.doc
  const lines = doc.toJSON()
  const changes = conflicts.map((c) => {
    const kept = resolveConflict(lines, c, choice)
    const from = doc.line(c.start + 1).from
    const last = doc.line(c.end + 1)
    // Takes the `>>>>>>>` line break along; with nothing to keep, the whole block goes away.
    const to = last.to < doc.length ? last.to + 1 : last.to
    const insert = kept.length === 0 ? '' : kept.join('\n') + (to > last.to ? '\n' : '')
    return { from, to, insert }
  })
  if (changes.length) view.dispatch({ changes, userEvent: 'input.merge' })
}

/** Accepts the same side in every conflict of the document. `false` if there is no conflict. */
export function acceptAllConflicts(view: EditorView, choice: ConflictChoice): boolean {
  const conflicts = conflictsOf(view.state)
  if (conflicts.length === 0) return false
  acceptConflicts(view, conflicts, choice)
  return true
}

/**
 * Takes the cursor to the next (1) or previous (-1) conflict, wrapping around the document. `false` if there is no
 * conflict.
 */
export function stepConflict(view: EditorView, direction: 1 | -1): boolean {
  const conflicts = conflictsOf(view.state)
  if (conflicts.length === 0) return false
  const line = view.state.doc.lineAt(view.state.selection.main.head).number - 1
  const target =
    direction === 1
      ? (conflicts.find((c) => c.start > line) ?? conflicts[0])
      : (conflicts.findLast((c) => c.start < line) ?? conflicts.at(-1))
  if (!target) return false
  const from = view.state.doc.line(target.start + 1).from
  view.dispatch({ selection: EditorSelection.cursor(from), effects: EditorView.scrollIntoView(from, { y: 'center' }) })
  view.focus()
  return true
}

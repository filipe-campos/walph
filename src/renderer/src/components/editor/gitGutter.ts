// Gutter indicators (line added / modified / removed relative to the index). The base line comes in through an
// effect (`setBaseline`, from the store); the marks are recomputed while typing, debounced. Between a keystroke and the
// recomputation the marks only follow the changes (`map`), so they do not "jump" lines. Clicking a mark opens the hunk
// actions (stage, revert), which the rest of the app injects through `bindHunkHost`.
import {
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text
} from '@codemirror/state'
import { GutterMarker, ViewPlugin, gutter, showTooltip, type EditorView, type Tooltip } from '@codemirror/view'
import { t } from '@shared/i18n'
import { gutterMarks, type GutterKind } from '../../lib/gitGutter'
import { lspTabId } from './lspHost'

export interface HunkHost {
  /** Stages the hunk containing the line (1-based) of the tab. */
  stage(tabId: string, line: number): void
  /** Reverts, in the buffer, the hunk containing the line. */
  revert(tabId: string, line: number): void
}

let hunkHost: HunkHost = { stage: () => {}, revert: () => {} }

export function bindHunkHost(next: HunkHost): void {
  hunkHost = next
}

/** Base lines (`null`: file outside the index, no marks). */
export const setBaseline = StateEffect.define<string[] | null>()
const recompute = StateEffect.define<null>()

const DEBOUNCE_MS = 200

class Mark extends GutterMarker {
  override elementClass: string
  constructor(readonly kind: GutterKind) {
    super()
    this.elementClass = `cm-git-${kind}`
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof Mark && other.kind === this.kind
  }
}

const MARKS: Record<GutterKind, Mark> = {
  added: new Mark('added'),
  modified: new Mark('modified'),
  deleted: new Mark('deleted')
}

interface GutterState {
  baseline: string[] | null
  marks: RangeSet<GutterMarker>
  /** The marks reflect the current document (otherwise they were only shifted by the edits). */
  fresh: boolean
}

function build(baseline: string[] | null, doc: Text): RangeSet<GutterMarker> {
  if (!baseline) return RangeSet.of<GutterMarker>([])
  const builder = new RangeSetBuilder<GutterMarker>()
  for (const { line, kind } of gutterMarks(baseline, doc.toJSON())) {
    const from = doc.line(line).from
    builder.add(from, from, MARKS[kind])
  }
  return builder.finish()
}

const field = StateField.define<GutterState>({
  create: () => ({ baseline: null, marks: RangeSet.of<GutterMarker>([]), fresh: true }),
  update(value, tr) {
    let baseline = value.baseline
    let recalc = false
    for (const effect of tr.effects) {
      if (effect.is(setBaseline)) {
        baseline = effect.value
        recalc = true
      } else if (effect.is(recompute)) recalc = true
    }
    if (recalc) return { baseline, marks: build(baseline, tr.newDoc), fresh: true }
    if (tr.docChanged) return { baseline, marks: value.marks.map(tr.changes), fresh: false }
    return value
  }
})

const scheduler = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null
    constructor(readonly view: EditorView) {
      this.check()
    }
    update(): void {
      this.check()
    }
    check(): void {
      const { baseline, fresh } = this.view.state.field(field)
      if (!baseline || fresh) return
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        this.view.dispatch({ effects: recompute.of(null) })
      }, DEBOUNCE_MS)
    }
    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  }
)

const toggleMenu = StateEffect.define<number | null>()

function menuDom(view: EditorView, line: number): HTMLElement {
  const m = t().git.hunks
  const dom = document.createElement('div')
  dom.className = 'lsp-menu hunk-menu'
  dom.setAttribute('role', 'menu')
  dom.setAttribute('aria-label', m.actions)
  const actions: [string, string, (tabId: string, line: number) => void][] = [
    [m.stage, 'codicon-add', (id, n) => hunkHost.stage(id, n)],
    [m.revert, 'codicon-discard', (id, n) => hunkHost.revert(id, n)]
  ]
  for (const [label, icon, run] of actions) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'lsp-menu-item'
    item.setAttribute('role', 'menuitem')
    const glyph = document.createElement('i')
    glyph.className = `codicon ${icon}`
    const text = document.createElement('span')
    text.className = 'lsp-menu-label'
    text.textContent = label
    item.append(glyph, text)
    item.addEventListener('mousedown', (e) => e.preventDefault())
    item.addEventListener('click', () => {
      view.dispatch({ effects: toggleMenu.of(null) })
      run(view.state.facet(lspTabId), line)
    })
    dom.append(item)
  }
  dom.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    view.dispatch({ effects: toggleMenu.of(null) })
    view.focus()
  })
  return dom
}

/** Menu of the open hunk (1-based line), as a tooltip anchored at the start of the line. */
const menuField = StateField.define<{ line: number; tooltip: Tooltip } | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(toggleMenu)) continue
      const line = effect.value
      if (line === null || value?.line === line) return null
      const pos = tr.state.doc.line(line).from
      return { line, tooltip: { pos, above: false, arrow: false, create: (view) => ({ dom: menuDom(view, line) }) } }
    }
    return value && (tr.docChanged || tr.selection) ? null : value
  },
  provide: (f) => showTooltip.from(f, (value) => value?.tooltip ?? null)
})

export function gitGutter(): Extension {
  return [
    field,
    scheduler,
    menuField,
    gutter({
      class: 'cm-git-gutter',
      markers: (view) => view.state.field(field).marks,
      domEventHandlers: {
        click(view, block) {
          const iter = view.state.field(field).marks.iter(block.from)
          if (!iter.value || iter.from !== block.from) return false
          view.dispatch({ effects: toggleMenu.of(view.state.doc.lineAt(block.from).number) })
          return true
        }
      }
    })
  ]
}

/** Gutter base line of the state (`null` = no marks); the mirror copy of a tab is born with the canonical one's. */
export function baselineOf(state: EditorState): string[] | null {
  return state.field(field, false)?.baseline ?? null
}

export interface GitMarkLine {
  /** Document line (1-based). */
  line: number
  kind: GutterKind
}

/** Current gutter marks (line + type), for the overview ruler and the minimap. */
export function gitMarksOf(state: EditorState): GitMarkLine[] {
  const value = state.field(field, false)
  if (!value) return []
  const out: GitMarkLine[] = []
  const doc = state.doc
  for (const iter = value.marks.iter(); iter.value; iter.next()) {
    if (iter.from > doc.length) continue
    out.push({ line: doc.lineAt(iter.from).number, kind: (iter.value as Mark).kind })
  }
  return out
}

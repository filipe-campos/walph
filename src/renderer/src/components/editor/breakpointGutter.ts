// Breakpoint gutter (left of the line numbers), stopped line highlight and the inline condition field. The
// marks come from the store through `debugHost` (a new state is born with them; changes arrive via
// `setBreakpointMarks`);
// between an edit and the store response they only follow the text (`map`), and the owner copy reports the shifted
// lines.
import { RangeSet, StateEffect, StateField, type EditorState, type Extension, type Text } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { t } from '@shared/i18n'
import type { BreakpointFields, BreakpointMark } from '../../lib/debugBreakpoints'
import { debugHost } from './debugHost'
import { lspTabId } from './lspHost'

/** Marks of the tab (replaces all of them). */
export const setBreakpointMarks = StateEffect.define<BreakpointMark[]>()
/** Line (1-based) where execution is stopped in this tab, or `null`. */
export const setStoppedLine = StateEffect.define<number | null>()
/** Opens (line) or closes (`null`) the condition field. */
const toggleBreakpointInput = StateEffect.define<number | null>()

class BreakpointMarker extends GutterMarker {
  override elementClass = 'cm-bp-line'
  constructor(readonly mark: BreakpointMark) {
    super()
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof BreakpointMarker &&
      other.mark.line === this.mark.line &&
      other.mark.kind === this.mark.kind &&
      other.mark.title === this.mark.title
    )
  }
  override toDOM(): Node {
    const dot = document.createElement('span')
    dot.className = `cm-bp-dot cm-bp-${this.mark.kind}`
    if (this.mark.title) dot.title = this.mark.title
    return dot
  }
}

class StoppedMarker extends GutterMarker {
  override toDOM(): Node {
    const arrow = document.createElement('span')
    arrow.className = 'cm-debug-arrow codicon codicon-debug-stackframe'
    arrow.title = t().debugUi.gutter.stoppedHere
    return arrow
  }
}
const STOPPED = new StoppedMarker()

interface DebugGutterState {
  marks: RangeSet<BreakpointMarker>
  stopped: number | null
  /** Line with the condition field open. */
  input: number | null
}

function buildMarks(marks: readonly BreakpointMark[], doc: Text): RangeSet<BreakpointMarker> {
  const ranges = [...marks]
    .filter((m) => m.line >= 1 && m.line <= doc.lines)
    .sort((a, b) => a.line - b.line)
    .map((m) => {
      const from = doc.line(m.line).from
      return new BreakpointMarker(m).range(from)
    })
  return RangeSet.of(ranges)
}

const clampLine = (line: number | null, doc: Text): number | null =>
  line === null ? null : Math.min(Math.max(1, line), doc.lines)

const field = StateField.define<DebugGutterState>({
  create: (state) => {
    const tabId = state.facet(lspTabId)
    const host = debugHost()
    return {
      marks: tabId ? buildMarks(host.marksFor(tabId), state.doc) : RangeSet.of<BreakpointMarker>([]),
      stopped: tabId ? clampLine(host.stoppedLineFor(tabId), state.doc) : null,
      input: null
    }
  },
  update(value, tr) {
    let { marks, stopped, input } = value
    if (tr.docChanged) {
      marks = marks.map(tr.changes)
      stopped = clampLine(stopped, tr.newDoc)
      input = clampLine(input, tr.newDoc)
    }
    for (const effect of tr.effects) {
      if (effect.is(setBreakpointMarks)) marks = buildMarks(effect.value, tr.newDoc)
      else if (effect.is(setStoppedLine)) stopped = clampLine(effect.value, tr.newDoc)
      else if (effect.is(toggleBreakpointInput)) input = clampLine(effect.value, tr.newDoc)
    }
    return marks === value.marks && stopped === value.stopped && input === value.input
      ? value
      : { marks, stopped, input }
  }
})

type Mode = 'condition' | 'hitCondition' | 'logMessage'
const MODES: readonly Mode[] = ['condition', 'hitCondition', 'logMessage']

function modeLabel(mode: Mode): string {
  const m = t().debugUi.gutter
  return mode === 'condition' ? m.modeExpression : mode === 'hitCondition' ? m.modeHitCount : m.modeLog
}

function modePlaceholder(mode: Mode): string {
  const m = t().debugUi.gutter
  return mode === 'condition'
    ? m.placeholderExpression
    : mode === 'hitCondition'
      ? m.placeholderHitCount
      : m.placeholderLog
}

/** Inline field below the line (like VS Code's): Enter saves the field of the chosen mode, Esc/leaving closes. */
class ConditionWidget extends WidgetType {
  constructor(
    readonly tabId: string,
    readonly line: number
  ) {
    super()
  }
  override eq(other: WidgetType): boolean {
    return other instanceof ConditionWidget && other.line === this.line && other.tabId === this.tabId
  }
  override ignoreEvent(): boolean {
    return true
  }
  override toDOM(view: EditorView): HTMLElement {
    const fields: BreakpointFields = { ...debugHost().fieldsAt(this.tabId, this.line) }
    let mode: Mode = fields.logMessage
      ? 'logMessage'
      : fields.hitCondition && !fields.condition
        ? 'hitCondition'
        : 'condition'
    const wrap = document.createElement('div')
    wrap.className = 'cm-breakpoint-widget'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-breakpoint-mode'
    button.title = t().debugUi.gutter.modeLabel
    const input = document.createElement('input')
    input.className = 'cm-breakpoint-input'
    input.spellcheck = false
    input.setAttribute('aria-label', t().debugUi.gutter.inputLabel)
    const show = (): void => {
      button.textContent = modeLabel(mode)
      input.placeholder = modePlaceholder(mode)
      input.value = fields[mode] ?? ''
    }
    show()
    const close = (refocus: boolean): void => {
      view.dispatch({ effects: toggleBreakpointInput.of(null) })
      if (refocus) view.focus()
    }
    button.addEventListener('click', () => {
      fields[mode] = input.value
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? 'condition'
      show()
      input.focus()
    })
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return
      if (e.key === 'Enter') {
        e.preventDefault()
        fields[mode] = input.value
        debugHost().setFields(this.tabId, this.line, fields)
        close(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      }
    })
    // Clicking outside closes without saving; switching the mode (the button) keeps the field.
    wrap.addEventListener('focusout', (e) => {
      if (e.relatedTarget instanceof Node && wrap.contains(e.relatedTarget)) return
      requestAnimationFrame(() => {
        if (wrap.isConnected && view.state.field(field).input === this.line) close(false)
      })
    })
    wrap.append(button, input)
    requestAnimationFrame(() => input.focus())
    return wrap
  }
}

const stoppedLine = Decoration.line({ class: 'cm-debug-stopped-line' })

const decorations = EditorView.decorations.compute([field], (state): DecorationSet => {
  const { stopped, input } = state.field(field)
  const ranges = []
  if (stopped !== null) ranges.push(stoppedLine.range(state.doc.line(stopped).from))
  if (input !== null) {
    const widget = new ConditionWidget(state.facet(lspTabId), input)
    ranges.push(Decoration.widget({ widget, block: true, side: 1 }).range(state.doc.line(input).to))
  }
  return Decoration.set(ranges, true)
})

const lineOf = (view: EditorView, from: number): number => view.state.doc.lineAt(from).number

const breakpointColumn = gutter({
  class: 'cm-breakpoint-gutter',
  markers: (view) => view.state.field(field).marks,
  lineMarker: (view, line) => {
    const { stopped } = view.state.field(field)
    return stopped !== null && lineOf(view, line.from) === stopped ? STOPPED : null
  },
  lineMarkerChange: (update) =>
    update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(setStoppedLine))),
  initialSpacer: () => STOPPED,
  domEventHandlers: {
    mousedown: (view, line, event) => {
      if (!(event instanceof MouseEvent) || event.button !== 0) return false
      const tabId = view.state.facet(lspTabId)
      if (!tabId) return false
      event.preventDefault()
      debugHost().toggle(tabId, lineOf(view, line.from))
      return true
    },
    contextmenu: (view, line, event) => {
      event.preventDefault()
      view.dispatch({ effects: toggleBreakpointInput.of(lineOf(view, line.from)) })
      return true
    }
  }
})

/** `store line → current line` shifts of the marks after the edits. */
function movesOf(state: EditorState): { from: number; to: number }[] {
  const moves: { from: number; to: number }[] = []
  for (const iter = state.field(field).marks.iter(); iter.value; iter.next()) {
    const to = state.doc.lineAt(iter.from).number
    if (to !== iter.value.mark.line) moves.push({ from: iter.value.mark.line, to })
  }
  return moves
}

// Only the document owner copy (the one with the history) reports: the mirror gets the same edits and would repeat
// them.
const reporter = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null
    constructor(readonly view: EditorView) {}
    update(update: ViewUpdate): void {
      if (!update.docChanged || this.timer) return
      // Outside the update cycle: the store responds with `setBreakpointMarks`, which is a new dispatch.
      this.timer = setTimeout(() => {
        this.timer = null
        const tabId = this.view.state.facet(lspTabId)
        const moves = movesOf(this.view.state)
        if (tabId && moves.length > 0) debugHost().moved(tabId, moves)
      }, 0)
    }
    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  }
)

/** `owner`: the canonical state of the tab (with history); the mirror only shows. */
export function breakpointGutter(owner: boolean): Extension {
  return owner ? [field, decorations, breakpointColumn, reporter] : [field, decorations, breakpointColumn]
}

/** Opens the condition field on the line ("Add Conditional Breakpoint" command). */
export function openBreakpointInput(view: EditorView, line: number): void {
  view.dispatch({ effects: toggleBreakpointInput.of(line) })
}

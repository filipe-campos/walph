// Sticky scroll: the header lines of the scopes enclosing the top of the screen (classes, functions, blocks) stay
// pinned
// at the top of the editor, with the theme highlighting; clicking one goes to it. The scopes come from the syntax tree
// (nodes with `foldNodeProp`) or, in languages that fold by service (Markdown headings), from that service.
import { foldNodeProp, foldService, highlightingFor, syntaxTree } from '@codemirror/language'
import type { EditorState, Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { highlightTree } from '@lezer/highlight'
import { mergeScopes, stickyLines, type Scope } from '../../lib/stickyScroll'

/** Lezer tree node (without depending on `@lezer/common` directly). */
type SyntaxNode = ReturnType<typeof syntaxTree>['topNode']

/** Lines above the probed one that the service folds examine (each one is a tree query). */
const FOLD_SERVICE_SCAN = 1000
/** Above this the pinned line is cut: the rest never fits the editor width. */
const MAX_LINE_CHARS = 400

export function scopesAt(state: EditorState, line: number): Scope[] {
  const doc = state.doc
  if (line < 1 || line > doc.lines) return []
  const pos = doc.line(line).from
  const scopes: Scope[] = []
  const add = (from: number, to: number): void => {
    const header = doc.lineAt(from).number
    const end = doc.lineAt(to).number
    if (header < line && end >= line) scopes.push({ header, end })
  }
  const services = state.facet(foldService)
  if (services.length > 0) {
    // The language folds by service (Markdown sections): only it counts, the node folds (paragraphs, lists) are not
    // scopes. Looks, bottom up, for the lines whose fold covers the probed one.
    const stop = Math.max(1, line - FOLD_SERVICE_SCAN)
    for (let n = line - 1; n >= stop; n--) {
      const info = doc.line(n)
      for (const service of services) {
        const range = service(state, info.from, info.to)
        if (range) add(range.from, range.to)
      }
    }
    return mergeScopes(scopes)
  }
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    const range = node.type.prop(foldNodeProp)?.(node, state)
    if (range && range.to > range.from) add(range.from, range.to)
  }
  return mergeScopes(scopes)
}

interface Measure {
  lines: number[]
  top: number
  right: number
  lineHeight: number
  gutterWidth: number
  /** Right edge of the line numbers inside the gutter (0 = numbers hidden). */
  numbersRight: number
  textLeft: number
}

function sameMeasure(a: Measure | null, b: Measure): boolean {
  return (
    !!a &&
    a.top === b.top &&
    a.right === b.right &&
    a.lineHeight === b.lineHeight &&
    a.gutterWidth === b.gutterWidth &&
    a.numbersRight === b.numbersRight &&
    a.textLeft === b.textLeft &&
    a.lines.length === b.lines.length &&
    a.lines.every((line, i) => line === b.lines[i])
  )
}

/** Writes the line text with the theme highlight classes (text nodes only, never HTML). */
function renderLineText(target: HTMLElement, state: EditorState, lineNumber: number): void {
  const line = state.doc.line(lineNumber)
  const to = Math.min(line.to, line.from + MAX_LINE_CHARS)
  const text = state.doc.sliceString(line.from, to)
  let at = line.from
  const put = (from: number, end: number, cls: string | null): void => {
    if (end <= from) return
    const piece = state.doc.sliceString(from, end)
    if (cls) {
      const span = document.createElement('span')
      span.className = cls
      span.textContent = piece
      target.append(span)
    } else target.append(piece)
  }
  highlightTree(
    syntaxTree(state),
    { style: (tags) => highlightingFor(state, tags) },
    (from, end, cls) => {
      put(at, from, null)
      put(from, end, cls)
      at = end
    },
    line.from,
    to
  )
  put(at, to, null)
  // An empty line still takes the height of a line.
  if (!text) target.append(String.fromCharCode(0x200b))
}

const stickyPlugin = (max: number) =>
  ViewPlugin.fromClass(
    class {
      readonly dom = document.createElement('div')
      private measured: Measure | null = null
      private renderedState: EditorState | null = null
      /** Height of the pinned strip: scroll margin so the cursor is never hidden under it. */
      height = 0

      constructor(readonly view: EditorView) {
        this.dom.className = 'cm-sticky-scroll'
        this.dom.hidden = true
        // The content repeats lines of the document itself: screen readers already read them in the editor.
        this.dom.setAttribute('aria-hidden', 'true')
        this.dom.addEventListener('mousedown', this.onMouseDown)
        view.dom.appendChild(this.dom)
        view.scrollDOM.addEventListener('scroll', this.schedule, { passive: true })
        this.schedule()
      }

      update(u: ViewUpdate): void {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.geometryChanged ||
          u.transactions.some((tr) => tr.reconfigured) ||
          syntaxTree(u.state) !== syntaxTree(u.startState)
        )
          this.schedule()
      }

      schedule = (): void => {
        this.view.requestMeasure({ key: this, read: (view) => this.read(view), write: (m) => this.write(m) })
      }

      private read(view: EditorView): Measure {
        const scroller = view.scrollDOM
        const rect = scroller.getBoundingClientRect()
        const lineHeight = view.defaultLineHeight
        const top = rect.top - view.documentTop
        const empty: Measure = {
          lines: [],
          top: 0,
          right: 0,
          lineHeight,
          gutterWidth: 0,
          numbersRight: 0,
          textLeft: 0
        }
        // Hidden host (tab in another group) or top of the document in view: nothing to pin.
        if (!scroller.clientHeight || top <= 0) return empty
        const state = view.state
        const topLine = state.doc.lineAt(view.lineBlockAtHeight(top).from).number
        // Never more than half the height: the pinned strip must not hide what is being edited.
        const fit = Math.max(0, Math.floor(scroller.clientHeight / lineHeight / 2))
        const lines = stickyLines((line) => scopesAt(state, line), topLine, Math.min(max, fit))
        if (lines.length === 0) return empty
        const gutters = scroller.querySelector<HTMLElement>('.cm-gutters')
        const numbers = gutters?.querySelector<HTMLElement>('.cm-lineNumbers')
        const firstLine = view.contentDOM.querySelector<HTMLElement>('.cm-line')
        const padding = firstLine ? parseFloat(getComputedStyle(firstLine).paddingLeft) || 0 : 0
        const minimap = view.dom.querySelector<HTMLElement>('.cm-minimap')
        return {
          lines,
          top: scroller.offsetTop,
          right: scroller.offsetWidth - scroller.clientWidth + (minimap?.offsetWidth ?? 0),
          lineHeight,
          gutterWidth: gutters?.offsetWidth ?? 0,
          numbersRight: numbers?.offsetWidth ? numbers.offsetLeft + numbers.offsetWidth : 0,
          textLeft: view.contentDOM.getBoundingClientRect().left - rect.left + padding
        }
      }

      private write(m: Measure): void {
        const state = this.view.state
        if (sameMeasure(this.measured, m) && this.renderedState === state) return
        this.measured = m
        this.renderedState = state
        this.height = m.lines.length * m.lineHeight
        this.dom.hidden = m.lines.length === 0
        this.dom.replaceChildren()
        if (m.lines.length === 0) return
        this.dom.style.top = `${m.top}px`
        this.dom.style.right = `${m.right}px`
        for (const lineNumber of m.lines) {
          const row = document.createElement('div')
          row.className = 'cm-sticky-line'
          row.dataset.line = String(lineNumber)
          row.style.height = `${m.lineHeight}px`
          row.style.lineHeight = `${m.lineHeight}px`
          const text = document.createElement('div')
          text.className = 'cm-sticky-text'
          text.style.left = `${m.textLeft}px`
          text.style.tabSize = String(state.tabSize)
          renderLineText(text, state, lineNumber)
          row.append(text)
          if (m.gutterWidth > 0) {
            const gutter = document.createElement('div')
            gutter.className = 'cm-sticky-gutter'
            gutter.style.width = `${m.gutterWidth}px`
            if (m.numbersRight > 0) {
              gutter.style.paddingRight = `${m.gutterWidth - m.numbersRight + 3}px`
              gutter.textContent = String(lineNumber)
            }
            row.append(gutter)
          }
          this.dom.append(row)
        }
      }

      private onMouseDown = (event: MouseEvent): void => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('.cm-sticky-line')
        if (!row || event.button !== 0) return
        event.preventDefault()
        const lineNumber = Number(row.dataset.line)
        const doc = this.view.state.doc
        if (!(lineNumber >= 1 && lineNumber <= doc.lines)) return
        const line = doc.line(lineNumber)
        const indent = /^\s*/.exec(line.text)?.[0].length ?? 0
        const anchor = line.from + indent
        // `scrollMargins` subtracts the pinned strip: the chosen line sits right below it.
        this.view.dispatch({
          selection: { anchor },
          effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 0 })
        })
        this.view.focus()
      }

      destroy(): void {
        this.view.scrollDOM.removeEventListener('scroll', this.schedule)
        this.dom.remove()
      }
    },
    {
      provide: (plugin) =>
        EditorView.scrollMargins.of((view) => {
          const height = view.plugin(plugin)?.height ?? 0
          return height > 0 ? { top: height } : null
        })
    }
  )

const plugins = new Map<number, Extension>()

/**
 * Sticky scroll extension with up to `max` pinned lines (the same instance per value: reconfiguring does not recreate
 * it).
 */
export function stickyScroll(max: number): Extension {
  let plugin = plugins.get(max)
  if (!plugin) plugins.set(max, (plugin = stickyPlugin(max)))
  return plugin
}

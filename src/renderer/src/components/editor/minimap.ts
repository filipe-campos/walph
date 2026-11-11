// Own minimap (no dependency): canvas to the right of the scroller, with a row of colored blocks per text line
// (colors from `--syn-*` through the `syntaxTree`), a git/problems marks strip on the left and a slider
// with the visible window. Layout as in VS Code: minimap and, at the far right, the scrollbar + ruler.
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { classHighlighter, highlightTree } from '@lezer/highlight'
import type { Text } from '@codemirror/state'
import { MAX_GUTTER_LINES } from '../../lib/gitGutter'
import { lineToY, minimapLayout, scrollTopForSlider, type MinimapInput } from '../../lib/minimapLayout'
import { CanvasOverlay } from './canvasOverlay'
import { cssVar, overviewMarksOf } from './marksOverview'

const MINIMAP_WIDTH = 90
const LINE_HEIGHT = 2
const BLOCK_HEIGHT = 1.5
const STRIP_W = 2
const TEXT_X = 6
const MAX_COLS = MINIMAP_WIDTH - TEXT_X - 2
const TAB_COLS = 2
/** Above this visible part (in characters) the highlighting is skipped. */
const MAX_HIGHLIGHT_SPAN = 200_000

/** `classHighlighter` class → theme syntax token. */
const CLASS_TOKEN: [string, string][] = [
  ['tok-comment', '--syn-comment'],
  ['tok-string', '--syn-string'],
  ['tok-url', '--syn-string'],
  ['tok-number', '--syn-number'],
  ['tok-bool', '--syn-constant'],
  ['tok-atom', '--syn-constant'],
  ['tok-literal', '--syn-constant'],
  ['tok-keyword', '--syn-keyword'],
  ['tok-typeName', '--syn-type'],
  ['tok-className', '--syn-type'],
  ['tok-namespace', '--syn-type'],
  ['tok-macroName', '--syn-function'],
  ['tok-propertyName', '--syn-property'],
  ['tok-labelName', '--syn-tag'],
  ['tok-heading', '--syn-tag'],
  ['tok-link', '--syn-tag'],
  ['tok-operator', '--syn-operator'],
  ['tok-variableName', '--syn-variable']
]
const TOKEN_VARS = [...new Set(CLASS_TOKEN.map(([, v]) => v))]

interface Palette {
  base: string
  tokens: Map<string, string>
  git: Record<string, string>
  diagnostics: Record<string, string>
}

function readPalette(el: Element): Palette {
  const tokens = new Map<string, string>()
  for (const v of TOKEN_VARS) tokens.set(v, cssVar(el, v))
  return {
    base: cssVar(el, '--ink-muted'),
    tokens,
    git: {
      added: cssVar(el, '--git-gutter-added'),
      modified: cssVar(el, '--git-gutter-modified'),
      deleted: cssVar(el, '--git-gutter-deleted')
    },
    diagnostics: { error: cssVar(el, '--diagnostic-error'), warning: cssVar(el, '--diagnostic-warning') }
  }
}

function colorForClass(classes: string, palette: Palette): string {
  for (const [cls, variable] of CLASS_TOKEN)
    if (classes.includes(cls)) return palette.tokens.get(variable) || palette.base
  return palette.base
}

class Minimap extends CanvasOverlay {
  readonly root = document.createElement('div')
  readonly canvas = document.createElement('canvas')
  readonly slider = document.createElement('div')
  private palette: Palette | null = null
  private drag: { grab: number; pointerId: number } | null = null
  private last: { input: MinimapInput } | null = null

  constructor(view: EditorView) {
    super(view)
    this.root.className = 'cm-minimap'
    this.root.setAttribute('aria-hidden', 'true')
    this.canvas.className = 'cm-minimap-canvas'
    this.slider.className = 'cm-minimap-slider'
    this.root.append(this.canvas, this.slider)
    view.dom.appendChild(this.root)
    view.scrollDOM.addEventListener('scroll', this.schedule)
    this.root.addEventListener('pointerdown', this.onDown)
    this.root.addEventListener('pointermove', this.onMove)
    this.root.addEventListener('pointerup', this.onUp)
    this.root.addEventListener('pointercancel', this.onUp)
    this.root.addEventListener('wheel', this.onWheel, { passive: true })
  }

  protected invalidate(): void {
    this.palette = null
  }

  private input(): MinimapInput | null {
    const s = this.view.scrollDOM
    if (!s.clientHeight || !this.view.dom.isConnected) return null
    return {
      lineCount: this.view.state.doc.lines,
      lineHeight: LINE_HEIGHT,
      height: s.clientHeight,
      scrollTop: s.scrollTop,
      scrollHeight: s.scrollHeight,
      clientHeight: s.clientHeight
    }
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.last) return
    const rect = this.root.getBoundingClientRect()
    const y = e.clientY - rect.top
    const layout = minimapLayout(this.last.input)
    const onSlider = y >= layout.sliderTop && y <= layout.sliderTop + layout.sliderHeight
    // Outside the slider: it jumps to be centered on the click and the drag continues from there.
    const grab = onSlider ? y - layout.sliderTop : layout.sliderHeight / 2
    this.drag = { grab, pointerId: e.pointerId }
    this.root.setPointerCapture(e.pointerId)
    this.root.classList.add('dragging')
    this.scrollTo(y - grab)
    e.preventDefault()
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.drag) return
    this.scrollTo(e.clientY - this.root.getBoundingClientRect().top - this.drag.grab)
  }

  private onUp = (e: PointerEvent): void => {
    if (!this.drag) return
    if (this.root.hasPointerCapture(e.pointerId)) this.root.releasePointerCapture(e.pointerId)
    this.drag = null
    this.root.classList.remove('dragging')
  }

  private onWheel = (e: WheelEvent): void => {
    this.view.scrollDOM.scrollTop += e.deltaY
  }

  private scrollTo(sliderTop: number): void {
    const input = this.input()
    if (input) this.view.scrollDOM.scrollTop = scrollTopForSlider(sliderTop, input)
  }

  protected draw(): void {
    const input = this.input()
    if (!input) return
    const { view, canvas } = this
    const scroller = view.scrollDOM
    this.last = { input }
    this.root.style.top = `${scroller.offsetTop}px`
    this.root.style.height = `${input.height}px`
    this.root.style.right = `${scroller.offsetWidth - scroller.clientWidth}px`
    const layout = minimapLayout(input)
    this.slider.style.top = `${layout.sliderTop}px`
    this.slider.style.height = `${layout.sliderHeight}px`

    const ctx = this.prepareCanvas(canvas, MINIMAP_WIDTH, input.height)
    if (!ctx) return
    // Giant files: only the slider (without text or marks).
    const { state } = view
    const doc = state.doc
    if (doc.lines > MAX_GUTTER_LINES) return

    // The cache is invalidated by state reconfiguration and by the theme observer (CSS variables on the root).
    const palette = (this.palette ??= readPalette(view.dom))

    this.drawText(ctx, doc, layout.firstLine, layout.endLine, layout.offset, palette)

    const marks = overviewMarksOf(state)
    const stripe = (line: number, color: string, x: number, height = LINE_HEIGHT): void => {
      if (line - 1 < layout.firstLine || line - 1 >= layout.endLine) return
      ctx.fillStyle = color
      ctx.fillRect(x, lineToY(line - 1, layout, LINE_HEIGHT), STRIP_W, height)
    }
    for (const d of marks.diagnostics) stripe(d.line, palette.diagnostics[d.severity] ?? '', STRIP_W)
    for (const g of marks.git) stripe(g.line, palette.git[g.kind] ?? '', 0, g.kind === 'deleted' ? 1 : LINE_HEIGHT)
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    doc: Text,
    firstLine: number,
    endLine: number,
    offset: number,
    palette: Palette
  ): void {
    if (endLine <= firstLine) return
    const from = doc.line(firstLine + 1).from
    const to = doc.line(endLine).to

    /** Paints the `[a, b)` range (within one or more lines) in runs of non-blank characters. */
    const paint = (a: number, b: number, color: string): void => {
      if (b <= a) return
      ctx.fillStyle = color
      let pos = a
      while (pos < b) {
        const line = doc.lineAt(pos)
        const end = Math.min(b, line.to)
        if (end > pos) paintLine(line.number - 1, line.from, pos, end)
        pos = line.to + 1
      }
    }
    const paintLine = (index: number, lineFrom: number, a: number, b: number): void => {
      // Only the first columns show: slicing the whole line would be O(n²) on a giant line (tab only increases the
      // column).
      const limit = Math.min(b, lineFrom + MAX_COLS)
      if (a >= limit) return
      const text = doc.sliceString(lineFrom, limit)
      const y = index * LINE_HEIGHT - offset
      let col = 0
      let runStart = -1
      for (let i = 0; i < text.length && col < MAX_COLS; i++) {
        const ch = text.charCodeAt(i)
        const before = col
        col += ch === 9 ? TAB_COLS : 1
        const blank = ch === 32 || ch === 9
        if (blank) {
          if (runStart >= 0) {
            ctx.fillRect(TEXT_X + runStart, y, before - runStart, BLOCK_HEIGHT)
            runStart = -1
          }
        } else if (runStart < 0 && lineFrom + i >= a) runStart = before
      }
      if (runStart >= 0) ctx.fillRect(TEXT_X + runStart, y, Math.min(col, MAX_COLS) - runStart, BLOCK_HEIGHT)
    }

    // Giant lines (minified): no highlighting, only plain blocks, so megabytes are not scanned per frame.
    if (to - from > MAX_HIGHLIGHT_SPAN) {
      paint(from, to, palette.base)
      return
    }
    let at = from
    const tree = ensureSyntaxTree(this.view.state, to, 5)
    if (tree) {
      highlightTree(
        tree,
        classHighlighter,
        (a, b, classes) => {
          paint(at, a, palette.base)
          paint(a, b, colorForClass(classes, palette))
          at = b
        },
        from,
        to
      )
    }
    paint(at, to, palette.base)
  }

  override destroy(): void {
    super.destroy()
    this.view.scrollDOM.removeEventListener('scroll', this.schedule)
    this.root.remove()
  }
}

const minimapPlugin = ViewPlugin.fromClass(Minimap)

// Reserves the minimap width to the right of the content, so the text does not sit under it.
const minimapTheme = EditorView.theme({
  '.cm-content': { paddingRight: `${MINIMAP_WIDTH + 8}px` }
})

export const minimapExtension = [minimapPlugin, minimapTheme]

// Overview ruler over the vertical scrollbar: colored ticks at the proportional positions of the lines
// changed (git) and with problems, as in VS Code. A `pointer-events: none` layer on top of the bar.
import { ViewPlugin, type EditorView } from '@codemirror/view'
import { MAX_GUTTER_LINES } from '../../lib/gitGutter'
import { rulerY } from '../../lib/minimapLayout'
import { CanvasOverlay } from './canvasOverlay'
import { cssVar, overviewMarksOf } from './marksOverview'

const WIDTH = 14
const GIT_X = 2
const GIT_W = 4
const DIAG_X = 7
const DIAG_W = 5
const TICK_H = 3

const GIT_VAR = { added: '--git-gutter-added', modified: '--git-gutter-modified', deleted: '--git-gutter-deleted' }
const DIAG_VAR = { error: '--diagnostic-error', warning: '--diagnostic-warning' }

class OverviewRuler extends CanvasOverlay {
  readonly canvas = document.createElement('canvas')
  private colors = new Map<string, string>()

  constructor(view: EditorView) {
    super(view)
    this.canvas.className = 'cm-overview-ruler'
    this.canvas.setAttribute('aria-hidden', 'true')
    view.dom.appendChild(this.canvas)
  }

  // Colors cached until the theme changes (avoids `getComputedStyle` on every draw).
  protected invalidate(): void {
    this.colors.clear()
  }

  protected draw(): void {
    const { view, canvas } = this
    const scroller = view.scrollDOM
    const height = scroller.clientHeight
    if (!height || !view.dom.isConnected) return
    const scrollbar = scroller.offsetWidth - scroller.clientWidth
    canvas.style.top = `${scroller.offsetTop}px`
    canvas.style.height = `${height}px`
    canvas.style.width = `${WIDTH}px`
    // The ruler follows the bar: if there is no vertical bar (short document), it goes away.
    canvas.style.display = scrollbar > 0 ? 'block' : 'none'
    if (!scrollbar) return
    const ctx = this.prepareCanvas(canvas, WIDTH, height)
    if (!ctx) return
    const state = view.state
    const lines = state.doc.lines
    if (lines > MAX_GUTTER_LINES) return
    const marks = overviewMarksOf(state)
    const tick = (line: number, x: number, w: number, color: string, tall = TICK_H): void => {
      ctx.fillStyle = color
      ctx.fillRect(x, Math.min(rulerY(line, lines, height), height - tall), w, tall)
    }
    // Problems first: git sits on top only on its own strip (the two do not overlap).
    const colors = this.colors
    const color = (name: string): string => {
      let c = colors.get(name)
      if (c === undefined) colors.set(name, (c = cssVar(view.dom, name)))
      return c
    }
    for (const d of marks.diagnostics) tick(d.line, DIAG_X, DIAG_W, color(DIAG_VAR[d.severity]))
    for (const g of marks.git) tick(g.line, GIT_X, GIT_W, color(GIT_VAR[g.kind]), g.kind === 'deleted' ? 2 : TICK_H)
  }

  override destroy(): void {
    super.destroy()
    this.canvas.remove()
  }
}

export const overviewRuler = ViewPlugin.fromClass(OverviewRuler)

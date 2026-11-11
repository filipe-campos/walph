// Common lifecycle of the canvas layers over the editor (minimap, ruler): drawing scheduled on rAF, redone when
// the scroller resizes, the devicePixelRatio or the theme change, and full cleanup on `destroy`.
import { syntaxTree } from '@codemirror/language'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import { watchTheme } from './marksOverview'

/** Only redraws when something the layers show changed (selection/focus do not affect the drawing). */
function needsRedraw(u: ViewUpdate): boolean {
  return (
    u.docChanged ||
    u.viewportChanged ||
    u.geometryChanged ||
    u.transactions.some((t) => t.reconfigured || t.effects.length > 0) ||
    syntaxTree(u.state) !== syntaxTree(u.startState)
  )
}

export abstract class CanvasOverlay {
  private frame = 0
  private observer: ResizeObserver
  private dprQuery: MediaQueryList | null = null
  private stopTheme: () => void

  constructor(readonly view: EditorView) {
    this.observer = new ResizeObserver(this.schedule)
    this.observer.observe(view.scrollDOM)
    this.watchDpr()
    this.stopTheme = watchTheme(() => {
      this.invalidate()
      this.schedule()
    })
    this.schedule()
  }

  /** Discards caches derived from the theme (colors read from CSS). */
  protected abstract invalidate(): void

  protected abstract draw(): void

  update(u: ViewUpdate): void {
    if (u.transactions.some((t) => t.reconfigured)) this.invalidate()
    if (needsRedraw(u)) this.schedule()
  }

  protected schedule = (): void => {
    if (!this.frame) this.frame = requestAnimationFrame(() => ((this.frame = 0), this.draw()))
  }

  /** Fits the canvas to the CSS size and DPR, clears it and returns the context already in CSS coordinates. */
  protected prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(width * dpr)
    const h = Math.round(height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    return ctx
  }

  // Zoom/monitor change alters the devicePixelRatio without a scroller resize: the canvas must be redone.
  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    this.dprQuery.addEventListener('change', this.onDprChange)
  }

  private onDprChange = (): void => {
    this.watchDpr()
    this.schedule()
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.stopTheme()
  }
}

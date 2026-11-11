import { yaml } from '@codemirror/lang-yaml'
import { setDiagnostics } from '@codemirror/lint'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { minimapLayout, scrollTopForSlider } from '../../lib/minimapLayout'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { installFakeApi } from '../../test/fakeApi'
import { minimapExtension } from './minimap'

interface Fill {
  style: string
  x: number
  y: number
  w: number
  h: number
}

let fills: Fill[] = []
let fillStyle = ''

const canvasContext = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: (x: number, y: number, w: number, h: number): void => void fills.push({ style: fillStyle, x, y, w, h }),
  get fillStyle(): string {
    return fillStyle
  },
  set fillStyle(value: string) {
    fillStyle = value
  }
}

const HEIGHT = 100
const SCROLL_HEIGHT = 2000

beforeEach(() => {
  vi.useFakeTimers()
  fills = []
  fillStyle = ''
  installFakeApi()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList)
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => canvasContext as unknown as CanvasRenderingContext2D
  )
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
})

function geometry(view: EditorView, scrollHeight = SCROLL_HEIGHT): { scrollTop: number } {
  const state = { scrollTop: 0 }
  Object.defineProperties(view.scrollDOM, {
    clientHeight: { value: HEIGHT, configurable: true },
    scrollHeight: { value: scrollHeight, configurable: true },
    scrollTop: { get: () => state.scrollTop, set: (v: number) => void (state.scrollTop = v), configurable: true }
  })
  return state
}

function setup(doc: string, extra: Parameters<typeof mountEditor>[0] = {}) {
  const editor = mountEditor({
    doc,
    ...(extra.tabId !== undefined && { tabId: extra.tabId }),
    extensions: [minimapExtension, ...(extra.extensions ?? [])]
  })
  const scroll = geometry(editor.view)
  const root = editor.view.dom.querySelector<HTMLElement>('.cm-minimap')!
  const redraw = (): void => {
    editor.view.scrollDOM.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
  }
  return { ...editor, scroll, root, redraw }
}

function paintVars(view: EditorView): void {
  view.dom.style.setProperty('--ink-muted', 'rgb(1, 1, 1)')
  view.dom.style.setProperty('--syn-property', 'rgb(2, 2, 2)')
  view.dom.style.setProperty('--syn-string', 'rgb(3, 3, 3)')
}

const lines = (n: number): string => Array.from({ length: n }, (_, i) => `l${i}`).join('\n')

describe('minimap', () => {
  it('creates the canvas and the slider inside the editor, hidden from screen readers', () => {
    const { root } = setup('a')
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('canvas.cm-minimap-canvas')).not.toBeNull()
    expect(root.querySelector('.cm-minimap-slider')).not.toBeNull()
  })

  it('reserves the minimap width to the right of the content', () => {
    const { view } = setup('a')
    expect(getComputedStyle(view.contentDOM).paddingRight).toBe('98px')
  })

  it('draws the blocks of each line in runs of non-blank characters', () => {
    const { redraw } = setup('ab cd\n\tx')
    redraw()
    const blocks = fills.map(({ x, y, w, h }) => [x, y, w, h])
    expect(blocks).toEqual([
      [6, 0, 2, 1.5],
      [9, 0, 2, 1.5],
      [8, 2, 1, 1.5]
    ])
  })

  it('only the first columns show on a very long line', () => {
    const { redraw } = setup('x'.repeat(500))
    redraw()
    expect(fills).toHaveLength(1)
    expect(fills[0].x + fills[0].w).toBe(6 + 82)
  })

  it('fits the canvas to the minimap size and positions the slider by the visible window', () => {
    const { view, root, redraw } = setup(lines(100))
    redraw()
    const layout = minimapLayout({
      lineCount: 100,
      lineHeight: 2,
      height: HEIGHT,
      scrollTop: 0,
      scrollHeight: SCROLL_HEIGHT,
      clientHeight: HEIGHT
    })
    const slider = root.querySelector<HTMLElement>('.cm-minimap-slider')!
    expect(root.style.height).toBe(`${HEIGHT}px`)
    expect(slider.style.top).toBe(`${layout.sliderTop}px`)
    expect(slider.style.height).toBe(`${layout.sliderHeight}px`)
    const canvas = root.querySelector('canvas')!
    expect([canvas.width, canvas.height]).toEqual([90, HEIGHT])
    expect(view.dom.contains(root)).toBe(true)
  })

  it('scrolling the editor redraws the slider and the visible part of the document in the minimap', () => {
    const { scroll, root, redraw } = setup(lines(100))
    redraw()
    const first = fills.length
    expect(first).toBeGreaterThan(0)
    scroll.scrollTop = SCROLL_HEIGHT - HEIGHT
    fills = []
    redraw()
    const slider = root.querySelector<HTMLElement>('.cm-minimap-slider')!
    expect(parseFloat(slider.style.top) + parseFloat(slider.style.height)).toBeCloseTo(HEIGHT)
    expect(fills[0].y).toBeCloseTo(0)
    expect(fills.length).toBeLessThanOrEqual(first)
  })

  it('several redraw requests in the same frame become a single draw', () => {
    const { view } = setup('a')
    fills = []
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
    expect(fills).toHaveLength(1)
  })

  it('without a measured height (hidden editor) it draws nothing', () => {
    const editor = mountEditor({ doc: 'abc', extensions: [minimapExtension] })
    editor.view.scrollDOM.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
    expect(fills).toEqual([])
  })

  it('a giant document shows only the slider, without text or marks', () => {
    const { redraw, root } = setup(lines(50_001))
    redraw()
    expect(fills).toEqual([])
    expect(root.querySelector<HTMLElement>('.cm-minimap-slider')!.style.height).not.toBe('')
  })

  it('a huge visible part uses plain blocks without syntax highlighting', () => {
    const editor = mountEditor({ doc: 'a: "x"\n' + 'y'.repeat(200_001), extensions: [minimapExtension, yaml()] })
    geometry(editor.view)
    paintVars(editor.view)
    editor.view.scrollDOM.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
    expect(new Set(fills.map((f) => f.style))).toEqual(new Set(['rgb(1, 1, 1)']))
  })

  it('colors the blocks by the theme syntax variables', () => {
    const editor = mountEditor({ doc: 'name: "v"', extensions: [minimapExtension, yaml()] })
    geometry(editor.view)
    paintVars(editor.view)
    editor.view.scrollDOM.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
    const byX = new Map(fills.map((f) => [f.x, f.style]))
    expect(byX.get(6)).toBe('rgb(2, 2, 2)')
    expect(byX.get(6 + 6)).toBe('rgb(3, 3, 3)')
    expect(byX.get(6 + 4)).toBe('rgb(1, 1, 1)')
  })

  it('marks the document errors and warnings on the left strip, at their line', () => {
    const { view, redraw } = setup('a\nb\nc')
    view.dom.style.setProperty('--diagnostic-error', 'red')
    view.dom.style.setProperty('--diagnostic-warning', 'orange')
    view.dispatch(
      setDiagnostics(view.state, [
        { from: 2, to: 3, severity: 'error', message: 'e' },
        { from: 4, to: 5, severity: 'warning', message: 'w' },
        { from: 0, to: 1, severity: 'info', message: 'i' }
      ])
    )
    fills = []
    redraw()
    const stripes = fills.filter((f) => f.w === 2 && f.h === 2)
    expect(stripes.map((f) => [f.style, f.x, f.y])).toEqual([
      ['red', 2, 2],
      ['orange', 2, 4]
    ])
  })

  it('editing the document schedules a new draw', () => {
    const { view, redraw } = setup('a')
    redraw()
    fills = []
    view.dispatch({ changes: { from: 1, insert: '\nb' } })
    vi.advanceTimersByTime(20)
    expect(fills).toHaveLength(2)
  })
})

describe('minimap: interaction', () => {
  function pointer(root: HTMLElement, type: string, clientY: number, init: PointerEventInit = {}): Event {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, clientY, pointerId: 1, button: 0, ...init })
    root.dispatchEvent(event)
    return event
  }

  function prepared(doc = lines(100)) {
    const ctx = setup(doc)
    ctx.root.setPointerCapture = vi.fn()
    ctx.root.releasePointerCapture = vi.fn()
    ctx.root.hasPointerCapture = vi.fn(() => true)
    ctx.redraw()
    const input = {
      lineCount: 100,
      lineHeight: 2,
      height: HEIGHT,
      scrollTop: 0,
      scrollHeight: SCROLL_HEIGHT,
      clientHeight: HEIGHT
    }
    return { ...ctx, input }
  }

  it('clicking outside the slider centers the window on the click and starts a drag', () => {
    const { root, scroll, input } = prepared()
    const layout = minimapLayout(input)
    const event = pointer(root, 'pointerdown', 80)
    expect(event.defaultPrevented).toBe(true)
    expect(root.classList.contains('dragging')).toBe(true)
    expect(root.setPointerCapture).toHaveBeenCalledWith(1)
    expect(scroll.scrollTop).toBeCloseTo(scrollTopForSlider(80 - layout.sliderHeight / 2, input))
  })

  it('dragging the slider keeps the grabbed point and releasing ends the drag', () => {
    const { root, scroll, input } = prepared()
    const layout = minimapLayout(input)
    pointer(root, 'pointerdown', layout.sliderTop + 2)
    expect(scroll.scrollTop).toBeCloseTo(scrollTopForSlider(layout.sliderTop, input))
    pointer(root, 'pointermove', 50)
    expect(scroll.scrollTop).toBeCloseTo(scrollTopForSlider(48, input))
    pointer(root, 'pointerup', 50)
    expect(root.classList.contains('dragging')).toBe(false)
    expect(root.releasePointerCapture).toHaveBeenCalledWith(1)
    const before = scroll.scrollTop
    pointer(root, 'pointermove', 90)
    expect(scroll.scrollTop).toBe(before)
  })

  it('cancelling the pointer also ends the drag', () => {
    const { root } = prepared()
    pointer(root, 'pointerdown', 40)
    pointer(root, 'pointercancel', 40)
    expect(root.classList.contains('dragging')).toBe(false)
  })

  it('another mouse button and the click before the first draw are ignored', () => {
    const { root, scroll } = prepared()
    pointer(root, 'pointerdown', 40, { button: 2 })
    expect(root.classList.contains('dragging')).toBe(false)
    expect(scroll.scrollTop).toBe(0)

    const fresh = setup('abc', { tabId: 't2' })
    fresh.root.setPointerCapture = vi.fn()
    pointer(fresh.root, 'pointerdown', 40)
    expect(fresh.root.classList.contains('dragging')).toBe(false)
  })

  it('the mouse wheel over the minimap scrolls the editor', () => {
    const { root, scroll } = prepared()
    root.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))
    expect(scroll.scrollTop).toBe(120)
  })

  it('destroying the view removes the minimap and ignores later scrolls', () => {
    const { view, root } = prepared()
    const scrollDom = view.scrollDOM
    view.destroy()
    expect(root.isConnected).toBe(false)
    fills = []
    scrollDom.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
    expect(fills).toEqual([])
  })
})

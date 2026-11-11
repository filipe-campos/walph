import { act, useEffect, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, unmountAll } from '../../test/dom'
import { useReorderDrag, type ReorderDrag } from './useReorderDrag'

const TYPE = 'application/x-walph-test'
const SIZE = 100

interface Spy {
  drag: ReorderDrag
  ids: string[]
  setIds: (ids: string[]) => void
}

function List({
  initial,
  axis,
  onMove,
  onState
}: {
  initial: string[]
  axis: 'x' | 'y' | 'grid'
  onMove: (id: string, to: number) => void
  onState: (state: Spy) => void
}) {
  const [ids, setIds] = useState(initial)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useReorderDrag({ containerRef: ref, type: TYPE, axis, ids, onMove })
  useEffect(() => {
    onState({ drag, ids, setIds })
  }, [drag, ids, onState])
  return (
    <div ref={ref} id="list" style={{ columnGap: '0px' }} {...drag.dropProps}>
      {ids.map((id, i) => (
        <div key={id} id={id} draggable style={drag.itemStyle(i)} {...drag.itemProps(id, i)} />
      ))}
    </div>
  )
}

/** Rect of each measured element: list at the origin, items side by side (x), stacked (y) or in 2 columns (grid). */
function layout(axis: 'x' | 'y' | 'grid', gap = 0): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = (left: number, top: number, w: number, h: number): DOMRect => ({
      left,
      top,
      right: left + w,
      bottom: top + h,
      width: w,
      height: h,
      x: left,
      y: top,
      toJSON: () => ({})
    })
    if (this.id === 'list') return box(0, 0, 400, 400)
    const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0
    if (axis === 'x') return box(index * (SIZE + gap), 0, SIZE, 40)
    if (axis === 'y') return box(0, index * (SIZE + gap), 40, SIZE)
    return box((index % 2) * SIZE, Math.floor(index / 2) * SIZE, SIZE, SIZE)
  })
}

function setup(axis: 'x' | 'y' | 'grid' = 'x', ids = ['a', 'b', 'c'], gap = 0) {
  layout(axis, gap)
  let latest: Spy | null = null
  const onState = (state: Spy): void => {
    latest = state
  }
  const onMove = vi.fn<(id: string, to: number) => void>()
  mount(<List initial={ids} axis={axis} onMove={onMove} onState={onState} />)
  return {
    spy: {
      get current() {
        return latest
      }
    },
    onMove,
    drag: () => latest!.drag,
    el: (id: string) => document.getElementById(id)!
  }
}

interface Transfer {
  types: string[]
  setData: ReturnType<typeof vi.fn>
  effectAllowed: string
  dropEffect: string
}

function fire(
  target: Element,
  type: string,
  {
    x = 0,
    y = 0,
    types = [TYPE],
    related = null
  }: { x?: number; y?: number; types?: string[]; related?: Element | null } = {}
): { event: Event; transfer: Transfer } {
  const transfer: Transfer = { types, setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { clientX: x, clientY: y, dataTransfer: transfer, relatedTarget: related })
  act(() => {
    target.dispatchEvent(event)
  })
  return { event, transfer }
}

const startDrag = (el: Element): ReturnType<typeof fire> => {
  const result = fire(el, 'dragstart')
  act(() => {
    vi.advanceTimersByTime(0)
  })
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  unmountAll()
  vi.useRealTimers()
})

describe('starting the drag', () => {
  it('writes the id to the dataTransfer with the list type and only marks the drag on the next tick', () => {
    const { drag, el } = setup()
    const { transfer } = fire(el('a'), 'dragstart')
    expect(transfer.setData).toHaveBeenCalledWith(TYPE, 'a')
    expect(transfer.effectAllowed).toBe('move')
    expect(drag().dragging).toBe(false)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(drag().dragging).toBe(true)
    expect(drag().draggingId).toBe('a')
  })

  it('a drag that ends before the next tick marks nothing', () => {
    const { drag, el } = setup()
    fire(el('a'), 'dragstart')
    fire(el('a'), 'dragend')
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(drag().dragging).toBe(false)
  })
})

describe('sliding the items', () => {
  it('x axis: the item goes to the pointer slot and the ones in between make way', () => {
    const { drag, el } = setup('x')
    startDrag(el('a'))
    const { event, transfer } = fire(el('list'), 'dragover', { x: 260 })
    expect(event.defaultPrevented).toBe(true)
    expect(transfer.dropEffect).toBe('move')
    expect([0, 1, 2].map((i) => drag().itemStyle(i)?.transform)).toEqual([
      'translate(200px, 0px)',
      'translate(-100px, 0px)',
      'translate(-100px, 0px)'
    ])
  })

  it('y axis uses the height and shifts vertically', () => {
    const { drag, el } = setup('y')
    startDrag(el('c'))
    fire(el('list'), 'dragover', { y: 20 })
    expect([0, 1, 2].map((i) => drag().itemStyle(i)?.transform)).toEqual([
      'translate(0px, 100px)',
      'translate(0px, 100px)',
      'translate(0px, -200px)'
    ])
  })

  it('the gap between items enters the shift step', () => {
    const { drag, el } = setup('x', ['a', 'b', 'c'], 10)
    const list = el('list')
    list.style.columnGap = '10px'
    startDrag(el('a'))
    fire(list, 'dragover', { x: 400 })
    expect(drag().itemStyle(1)?.transform).toBe('translate(-110px, 0px)')
  })

  it('grid: each item goes to the center of the slot it will take, including on another row', () => {
    const { drag, el } = setup('grid', ['a', 'b', 'c', 'd'])
    startDrag(el('a'))
    fire(el('list'), 'dragover', { x: 150, y: 150 })
    expect([0, 1, 2, 3].map((i) => drag().itemStyle(i)?.transform)).toEqual([
      'translate(100px, 100px)',
      'translate(-100px, 0px)',
      'translate(100px, -100px)',
      'translate(-100px, 0px)'
    ])
  })

  it('without a drag the items get no style', () => {
    const { drag } = setup()
    expect(drag().itemStyle(0)).toBeUndefined()
  })

  it('moving the pointer back to the origin position resets the shifts', () => {
    const { drag, el } = setup('x')
    startDrag(el('a'))
    fire(el('list'), 'dragover', { x: 260 })
    fire(el('list'), 'dragover', { x: 10 })
    expect(drag().itemStyle(0)).toBeUndefined()
    expect(drag().itemStyle(1)).toBeUndefined()
  })

  it('leaving the container returns the item to its origin slot; leaving to a child does not', () => {
    const { drag, el } = setup('x')
    startDrag(el('a'))
    fire(el('list'), 'dragover', { x: 260 })
    fire(el('list'), 'dragleave', { related: el('b') })
    expect(drag().itemStyle(0)?.transform).toBe('translate(200px, 0px)')
    fire(el('list'), 'dragleave', { related: null })
    expect(drag().itemStyle(0)).toBeUndefined()
  })
})

describe('dropping', () => {
  it('calls onMove with the pointer target and keeps the shifts until the order arrives', () => {
    const { drag, el, onMove, spy } = setup('x')
    startDrag(el('a'))
    const { event } = fire(el('list'), 'drop', { x: 260 })
    expect(event.defaultPrevented).toBe(true)
    expect(onMove).toHaveBeenCalledExactlyOnceWith('a', 2)
    expect(drag().dragging).toBe(false)
    expect(drag().draggingId).toBeNull()
    expect(drag().itemStyle(0)?.transform).toBe('translate(200px, 0px)')

    act(() => spy.current!.setIds(['b', 'c', 'a']))
    expect(drag().itemStyle(0)).toBeUndefined()
    expect(drag().settling).toBe(true)
    act(() => {
      vi.advanceTimersByTime(40)
    })
    expect(drag().settling).toBe(false)
  })

  it('dropping without a dragover before uses the position of the drop itself', () => {
    const { el, onMove } = setup('x')
    startDrag(el('c'))
    fire(el('list'), 'drop', { x: 10 })
    expect(onMove).toHaveBeenCalledWith('c', 0)
  })

  it('dropping on its own slot moves nothing and ends the drag', () => {
    const { drag, el, onMove } = setup('x')
    startDrag(el('b'))
    fire(el('list'), 'drop', { x: 150 })
    expect(onMove).not.toHaveBeenCalled()
    expect(drag().dragging).toBe(false)
    expect(drag().settling).toBe(true)
  })

  it('the dragend that comes after the drop does not cancel the shifts', () => {
    const { drag, el } = setup('x')
    startDrag(el('a'))
    fire(el('list'), 'drop', { x: 260 })
    fire(el('a'), 'dragend')
    expect(drag().itemStyle(0)?.transform).toBe('translate(200px, 0px)')
  })

  it('dragend without a drop (Esc or dropping outside) cancels the drag', () => {
    const { drag, el } = setup('x')
    startDrag(el('a'))
    fire(el('list'), 'dragover', { x: 260 })
    fire(el('a'), 'dragend')
    expect(drag().dragging).toBe(false)
    expect(drag().itemStyle(0)).toBeUndefined()
    expect(drag().settling).toBe(true)
  })

  it('if the owner refuses the move and the order never changes, the shifts are released after 1 s', () => {
    const { drag, el } = setup('x')
    startDrag(el('a'))
    fire(el('list'), 'drop', { x: 260 })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(drag().itemStyle(0)).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(drag().itemStyle(0)).toBeUndefined()
    expect(drag().settling).toBe(true)
  })

  it('the order changes mid-drag: the drag ends and the stale indices are discarded', () => {
    const { drag, el, spy, onMove } = setup('x')
    startDrag(el('a'))
    fire(el('list'), 'dragover', { x: 260 })
    act(() => spy.current!.setIds(['a', 'b']))
    expect(drag().dragging).toBe(false)
    expect(drag().itemStyle(0)).toBeUndefined()
    fire(el('list'), 'drop', { x: 150 })
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('drags from outside', () => {
  it('another data type is not accepted: no preventDefault and no state', () => {
    const { drag, el, onMove } = setup('x')
    const { event } = fire(el('list'), 'dragover', { x: 100, types: ['Files'] })
    expect(event.defaultPrevented).toBe(false)
    const dropped = fire(el('list'), 'drop', { x: 100, types: ['Files'] })
    expect(dropped.event.defaultPrevented).toBe(false)
    expect(onMove).not.toHaveBeenCalled()
    expect(drag().dragging).toBe(false)
  })

  it('the list type without our dragstart (drag from another instance) is ignored', () => {
    const { el, onMove } = setup('x')
    fire(el('list'), 'drop', { x: 100 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('dragleave without a drag in progress is harmless', () => {
    const { drag, el } = setup('x')
    fire(el('list'), 'dragleave')
    expect(drag().dragging).toBe(false)
  })
})

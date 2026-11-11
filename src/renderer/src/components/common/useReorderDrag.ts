import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, RefObject } from 'react'
import { dragOffsets, dragTargetIndex, gridOffsets, gridTargetIndex, type Point } from '../../lib/reorderDrag'

/**
 * Drag in progress: the item and the index it would go to if dropped now. `key` is the item order at the start: if
 * it changes (item opened/closed, the dragged one disappears and the `dragend` never arrives), the indices go stale and
 * the drag ends. `dropped` = already dropped; the shifts stay until the new order arrives (without going back and
 * jumping).
 */
type Drag = { id: string; from: number; to: number; step: number; centers: Point[]; key: string; dropped: boolean }

type Geometry = { id: string; from: number; centers: Point[]; step: number; key: string }

export type ReorderDrag = {
  /** Spread on the element that receives the drop (the container or an ancestor). */
  dropProps: {
    onDragOver: (e: DragEvent<HTMLElement>) => void
    onDragLeave: (e: DragEvent<HTMLElement>) => void
    onDrop: (e: DragEvent<HTMLElement>) => void
  }
  /** Spread on each item (which needs `draggable`). */
  itemProps: (id: string, index: number) => { onDragStart: (e: DragEvent<HTMLElement>) => void; onDragEnd: () => void }
  /** `transform` that opens the slot of each item (nothing without a drag). */
  itemStyle: (index: number) => CSSProperties | undefined
  /** Item being dragged now (gone on drop). */
  draggingId: string | null
  /** Active drag: the container gets the class. */
  dragging: boolean
  /** One frame without a transition after dropping: the new order is already in the DOM. */
  settling: boolean
}

/**
 * Drag reordering (HTML5 DnD) in a horizontal (`x`), vertical (`y`) or line-wrapping grid (`grid`) list: measures
 * the still layout at the start, slides the
 * other items with `transform` and calls `onMove(id, to)` on drop. The shifts stay until `ids` changes (the order
 * comes from the state owner, nothing optimistic); if it never changes (move refused), a 1 s clock releases everything.
 */
export function useReorderDrag({
  containerRef,
  type,
  axis,
  ids,
  onMove
}: {
  /** Container whose first `ids.length` children are the items, in `ids` order. */
  containerRef: RefObject<HTMLElement | null>
  /** `dataTransfer` type: separates different lists (and drags from outside). */
  type: string
  axis: 'x' | 'y' | 'grid'
  ids: readonly string[]
  onMove: (id: string, to: number) => void
}): ReorderDrag {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [settling, setSettling] = useState(false)
  // Geometry measured at the drag start (still layout, without the transforms the items get later).
  const geometry = useRef<Geometry | null>(null)
  const droppedRef = useRef(false)
  const horizontal = axis !== 'y'

  const listKey = ids.join('\n')
  // The order changed during the drag (or right after dropping): the stored indices no longer hold.
  if (drag && drag.key !== listKey) {
    setDrag(null)
    setSettling(true)
  }

  useEffect(() => {
    if (!settling) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettling(false))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [settling])

  // Safety net: if the owner refuses the move, the order never changes and the shifts must not get stuck.
  const dropped = drag?.dropped ?? false
  useEffect(() => {
    if (!dropped) return
    const t = setTimeout(() => {
      setDrag(null)
      setSettling(true)
    }, 1000)
    return () => clearTimeout(t)
  }, [dropped])

  const endDrag = (): void => {
    geometry.current = null
    setDrag(null)
    setSettling(true)
  }

  const targetOf = (g: Geometry, e: DragEvent<HTMLElement>): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    const pos = { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
    if (axis === 'grid') return gridTargetIndex(g.centers, pos)
    return dragTargetIndex(
      g.centers.map((c) => (horizontal ? c.x : c.y)),
      g.from,
      horizontal ? pos.x : pos.y
    )
  }

  const itemProps: ReorderDrag['itemProps'] = (id, from) => ({
    onDragStart: (e) => {
      const container = containerRef.current
      if (!container) return
      e.dataTransfer.setData(type, id)
      e.dataTransfer.effectAllowed = 'move'
      const box = container.getBoundingClientRect()
      const rects = Array.from(container.children, (c) => c.getBoundingClientRect()).slice(0, ids.length)
      const style = getComputedStyle(container)
      const gap = parseFloat(horizontal ? style.columnGap : style.rowGap) || 0
      const size = (r: DOMRect | undefined): number => (r ? (horizontal ? r.width : r.height) : 0)
      geometry.current = {
        id,
        from,
        centers: rects.map((r) => ({
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height / 2
        })),
        step: size(rects[from]) + gap,
        key: listKey
      }
      droppedRef.current = false
      // After the drag image snapshot: changing the item already on dragstart would erase the image.
      setTimeout(() => {
        const g = geometry.current
        if (g?.id === id) setDrag({ id, from, to: from, step: g.step, centers: g.centers, key: g.key, dropped: false })
      }, 0)
    },
    onDragEnd: () => {
      if (!droppedRef.current) endDrag()
    }
  })

  const accepts = (e: DragEvent<HTMLElement>): Geometry | null => {
    const g = geometry.current
    return g && g.key === listKey && e.dataTransfer.types.includes(type) ? g : null
  }

  const dropProps: ReorderDrag['dropProps'] = {
    onDragOver: (e) => {
      const g = accepts(e)
      if (!g) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const to = targetOf(g, e)
      setDrag((d) => (d && !d.dropped && d.to !== to ? { ...d, to } : d))
    },
    onDragLeave: (e) => {
      if (geometry.current && !e.currentTarget.contains(e.relatedTarget as Node | null))
        setDrag((d) => (d && !d.dropped && d.to !== d.from ? { ...d, to: d.from } : d))
    },
    onDrop: (e) => {
      const g = accepts(e)
      if (!g) return
      e.preventDefault()
      // From the pointer, not from the state: the last dragover may not have been rendered yet.
      const to = targetOf(g, e)
      geometry.current = null
      if (to === g.from) {
        endDrag()
        return
      }
      // The shifts stay until the new order arrives.
      droppedRef.current = true
      setDrag((d) => (d ? { ...d, to, dropped: true } : d))
      onMove(g.id, to)
    }
  }

  const active = drag && drag.key === listKey ? drag : null
  const linear = active && axis !== 'grid' ? dragOffsets(ids.length, active.from, active.to, active.step) : null
  const cells = active && axis === 'grid' ? gridOffsets(active.centers, active.from, active.to) : null
  const dragging = drag !== null && !drag.dropped

  return {
    dropProps,
    itemProps,
    itemStyle: (i) => {
      const x = horizontal ? (linear?.[i] ?? 0) : 0
      const y = axis === 'y' ? (linear?.[i] ?? 0) : 0
      const cell = cells?.[i]
      const dx = cell?.x ?? x
      const dy = cell?.y ?? y
      return dx || dy ? { transform: `translate(${dx}px, ${dy}px)` } : undefined
    },
    draggingId: dragging ? drag.id : null,
    dragging,
    settling
  }
}

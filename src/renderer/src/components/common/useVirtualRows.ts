import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from 'react'
import { ROW_HEIGHT, visibleRange } from '../../lib/explorerTree'

interface VirtualRows {
  ref: RefObject<HTMLDivElement | null>
  onScroll: (e: UIEvent<HTMLDivElement>) => void
  /** Range [start, end) of rows to mount. */
  start: number
  end: number
  /** Scrolls the minimum for the row to become visible. */
  scrollToRow: (index: number) => void
}

/** Virtual window of fixed-height rows inside a scrollable container; `resetKey` re-measures on content change. */
export function useVirtualRows(count: number, resetKey: unknown, rowHeight = ROW_HEIGHT): VirtualRows {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ first: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setView((v) => (v.height === el.clientHeight ? v : { ...v, height: el.clientHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [resetKey])
  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const first = Math.floor(e.currentTarget.scrollTop / rowHeight)
      setView((v) => (v.first === first ? v : { ...v, first }))
    },
    [rowHeight]
  )
  // Hidden (height 0) or not measured yet: mounts a handful of rows so the list is not left empty.
  const { start, end } = visibleRange(count, view.first * rowHeight, view.height || 600, rowHeight)
  const scrollToRow = useCallback(
    (index: number) => {
      const el = ref.current
      if (!el || index < 0) return
      const top = index * rowHeight
      const h = el.clientHeight || 600
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + rowHeight > el.scrollTop + h) el.scrollTop = top + rowHeight - h
    },
    [rowHeight]
  )
  return { ref, onScroll, start, end, scrollToRow }
}

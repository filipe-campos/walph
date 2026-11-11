import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { TreeRow } from '../../lib/explorerTree'

/**
 * Row that should get focus as soon as it exists in the DOM (virtualization: it may be outside the window or remount).
 * Returns a stable `focusRow(path)`, which records the request; focus is given after the render that mounts it.
 */
export function usePendingRowFocus(
  treeRef: RefObject<HTMLElement | null>,
  rows: TreeRow[],
  scrollToRow: (index: number) => void
): (path: string) => void {
  const pending = useRef<string | null>(null)
  const seen = useRef<{ path: string; at: number } | null>(null)
  const focusRow = useCallback((path: string) => {
    pending.current = path
  }, [])

  useEffect(() => {
    const path = pending.current
    const tree = treeRef.current
    if (!path || !tree) return
    const active = document.activeElement
    // If the user took focus elsewhere on the screen, we do not steal it back.
    if (active && active !== document.body && !tree.contains(active)) {
      pending.current = null
      return
    }
    const el = [...tree.querySelectorAll<HTMLElement>('[data-path]')].find((n) => n.dataset.path === path)
    if (!el) {
      const at = rows.findIndex((r) => r.kind === 'entry' && r.entry.path === path)
      // The row may not exist yet (rename in flight), but if it does not appear within 3 s (removed, folder collapsed)
      // it gives up instead of trying on every render.
      if (seen.current?.path !== path) seen.current = { path, at: Date.now() }
      if (at < 0 && Date.now() - seen.current.at > 3000) pending.current = null
      return scrollToRow(at)
    }
    pending.current = null
    el.focus({ preventScroll: true })
  })

  return focusRow
}

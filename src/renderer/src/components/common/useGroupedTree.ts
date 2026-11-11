import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'

export interface TreeGroup<I> {
  path: string
  items: I[]
}

export type TreeRow<G extends TreeGroup<I>, I> =
  { key: string; group: G } | { key: string; group: G; item: I; index: number }

/** `true` if the row is an item (and not the group header). */
export function isItemRow<G extends TreeGroup<I>, I>(
  row: TreeRow<G, I>
): row is { key: string; group: G; item: I; index: number } {
  return 'item' in row
}

interface Options<G extends TreeGroup<I>, I> {
  groups: G[]
  /** The view is shown: focus goes to the list (the panel views stay mounted, only hidden). */
  visible: boolean
  /** Changes when a new list arrives: focus returns to it even with the view already visible. */
  focusToken?: unknown
  /** Enter, Space or click on an item (on the group, collapses/expands). */
  onActivateItem(group: G, item: I): void
  /** Stable key of the item within the group (default: the index); keeps focus when the list shrinks. */
  itemKey?(item: I, index: number): string
  /** Collapsed groups controlled from outside (path → true): the state lives in the store. Requires `onToggleGroup`. */
  collapsed?: Record<string, boolean>
  /** Toggles a group (collapses if open, expands if collapsed). */
  onToggleGroup?(path: string): void
}

/** Attributes of a row: only primitive values, so the row can be `memo` (the handlers stay on the container). */
export function treeRowProps(key: string, tabStop: boolean) {
  return { 'data-row': key, tabIndex: tabStop ? 0 : -1 }
}

/**
 * Two-level tree list (collapsible groups with items) of the Problems, References, Search and Git panels: arrow
 * navigation with roving tabindex, Home/End, Enter/Space, ←/→ to collapse/expand, focus when the view shows and, when
 * the focused row disappears (stage, replace, remove), focus on the next remaining row.
 * `listProps` goes on the container (ref and delegated handlers); each row uses `treeRowProps(row.key, row.key ===
 * tabStop)`.
 */
export function useGroupedTree<G extends TreeGroup<I>, I>({
  groups,
  visible,
  focusToken,
  onActivateItem,
  itemKey,
  collapsed: controlledCollapsed,
  onToggleGroup
}: Options<G, I>) {
  // Groups collapsed by path (the view stays mounted, so the state survives a view switch).
  const [localCollapsed, setLocalCollapsed] = useState<Record<string, boolean>>({})
  const collapsed = controlledCollapsed ?? localCollapsed
  // Row with tabIndex 0 (arrow navigation): the others stay out of the Tab order.
  const [cursor, setCursor] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const list: TreeRow<G, I>[] = []
    for (const group of groups) {
      list.push({ key: `g:${group.path}`, group })
      if (!collapsed[group.path])
        group.items.forEach((item, i) =>
          list.push({ key: `i:${group.path}:${itemKey ? itemKey(item, i) : i}`, group, item, index: i })
        )
    }
    return list
  }, [groups, collapsed, itemKey])
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows])
  const tabStop = cursor !== null && byKey.has(cursor) ? cursor : (rows[0]?.key ?? null)
  // Row that has focus (itself or one of its controls) and the rows of the previous render, to find the neighbor when
  // it disappears.
  const focusedRef = useRef<string | null>(null)
  const prevRowsRef = useRef(rows)

  useLayoutEffect(() => {
    const prev = prevRowsRef.current
    prevRowsRef.current = rows
    const lost = focusedRef.current
    if (lost === null || byKey.has(lost)) return
    focusedRef.current = null
    // Only recovers focus that fell to the body together with the row; never takes it from elsewhere.
    const active = document.activeElement
    if (active && active !== document.body) return
    const i = prev.findIndex((r) => r.key === lost)
    if (i < 0) return
    const next = [...prev.slice(i + 1), ...prev.slice(0, i).reverse()].find((r) => byKey.has(r.key))
    if (next) listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(next.key)}"]`)?.focus()
  }, [rows, byKey])

  useEffect(() => {
    if (!visible) return
    const list = listRef.current
    ;(list?.querySelector<HTMLElement>('[data-row]') ?? list)?.focus()
  }, [visible, focusToken])

  const toggle = (path: string, open?: boolean): void => {
    if (open !== undefined && open === !collapsed[path]) return
    if (onToggleGroup) onToggleGroup(path)
    else setLocalCollapsed((c) => ({ ...c, [path]: !c[path] }))
  }

  const activate = (row: TreeRow<G, I>): void => {
    if (isItemRow(row)) onActivateItem(row.group, row.item)
    else toggle(row.group.path)
  }

  const rowAt = (target: EventTarget): { el: HTMLElement; row: TreeRow<G, I> } | null => {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-row]') : null
    const row = el && listRef.current?.contains(el) ? byKey.get(el.dataset.row ?? '') : undefined
    return el && row ? { el, row } : null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // Keys from a control inside the row (e.g. replace) neither navigate nor activate the row.
    const hit = e.target instanceof HTMLElement && e.target.matches('[data-row]') ? rowAt(e.target) : null
    if (!hit) return
    const { row } = hit
    const els = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
    const index = els.indexOf(hit.el)
    const focusAt = (i: number): void => {
      e.preventDefault()
      els[Math.min(Math.max(i, 0), els.length - 1)]?.focus()
    }
    switch (e.key) {
      case 'ArrowDown':
        return focusAt(index + 1)
      case 'ArrowUp':
        return focusAt(index - 1)
      case 'Home':
        return focusAt(0)
      case 'End':
        return focusAt(els.length - 1)
      case 'Enter':
      case ' ':
        e.preventDefault()
        return activate(row)
      case 'ArrowRight':
        if (!isItemRow(row) && collapsed[row.group.path]) {
          e.preventDefault()
          toggle(row.group.path, true)
        }
        return
      case 'ArrowLeft':
        if (!isItemRow(row)) {
          if (!collapsed[row.group.path]) {
            e.preventDefault()
            toggle(row.group.path, false)
          }
        } else focusAt(els.findIndex((el) => el.dataset.row === `g:${row.group.path}`))
    }
  }

  const listProps = {
    ref: listRef,
    onFocus: (e: FocusEvent<HTMLDivElement>) => {
      const hit = rowAt(e.target)
      focusedRef.current = hit?.row.key ?? null
      if (hit) setCursor(hit.row.key)
    },
    onBlur: (e: FocusEvent<HTMLDivElement>) => {
      if (e.relatedTarget instanceof Node && listRef.current?.contains(e.relatedTarget)) return
      // Without a target, the blur may come from the removed row (focus goes to the body): the effect above decides
      // after the commit.
      const el = e.target
      queueMicrotask(() => {
        if (el.isConnected && focusedRef.current !== null && !listRef.current?.contains(document.activeElement))
          focusedRef.current = null
      })
    },
    onKeyDown,
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      const hit = rowAt(e.target)
      if (hit) activate(hit.row)
    }
  }

  return {
    rows,
    listProps,
    tabStop,
    isOpen: (path: string) => !collapsed[path]
  }
}

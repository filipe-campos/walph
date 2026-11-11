import { memo, useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useStore } from '../../store'
import { findActiveTab } from '../../lib/findActiveTab'
import {
  activeRowKey,
  collapsibleKeys,
  sortSymbolTree,
  symbolRows,
  type SymbolRow,
  type SymbolSortOrder
} from '../../lib/symbolTree'
import { ROW_HEIGHT } from '../../lib/explorerTree'
import { revealDocumentSymbol } from '../../lspNavigationActions'
import { useT } from '../../i18n'
import { Chevron } from '../common/Chevron'
import { DropdownMenu } from '../common/DropdownMenu'
import { IconButton } from '../common/IconButton'
import { Section } from '../common/Section'
import { SymbolIcon } from '../common/SymbolIcon'
import { useVirtualRows } from '../common/useVirtualRows'
import { highlight } from '../quickInput/highlight'
import { useDocumentSymbols, useSymbolPathAtCursor } from '../editor/useDocumentSymbols'
import { Resizer } from '../Resizer'

const MIN_HEIGHT = 66
const MAX_HEIGHT = 2000
const EMPTY = new Set<string>()
const SORT_ORDERS: readonly SymbolSortOrder[] = ['position', 'name', 'kind']

const OutlineRow = memo(function OutlineRow({
  row,
  active,
  tabStop,
  onToggle,
  onReveal
}: {
  row: SymbolRow
  active: boolean
  tabStop: boolean
  onToggle: (key: string) => void
  onReveal: (row: SymbolRow) => void
}) {
  const { symbol } = row
  return (
    <div
      role="treeitem"
      className={`tree-row outline-row${active ? ' active' : ''}${row.expanded ? ' open' : ''}`}
      style={{ paddingLeft: 8 + row.depth * 12 }}
      aria-level={row.depth + 1}
      aria-expanded={row.expanded ?? undefined}
      aria-selected={active}
      tabIndex={tabStop ? 0 : -1}
      data-key={row.key}
      title={symbol.detail ? `${symbol.name} ${symbol.detail}` : symbol.name}
      onClick={() => onReveal(row)}
    >
      {row.expanded === null ? (
        <Chevron placeholder />
      ) : (
        <span
          className="outline-twisty"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(row.key)
          }}
        >
          <Chevron />
        </span>
      )}
      <SymbolIcon kind={symbol.kind} className="tree-icon" />
      <span className="tree-label">{highlight(symbol.name, new Set(row.matches), 0)}</span>
      {symbol.detail && <span className="outline-detail">{symbol.detail}</span>}
    </div>
  )
})

/** "Outline" section of the Explorer: the symbol tree of the active editor, which follows the cursor. */
export function OutlineView() {
  const t = useT()
  const root = useStore((s) => s.root)
  const [open, setOpen] = useState(true)
  const [height, setHeight] = useState(260)
  const [sort, setSort] = useState<SymbolSortOrder>('position')
  // Per-tab state (the filter and what is collapsed do not carry over to another file).
  const [collapsed, setCollapsed] = useState<{ tabId: string | null; keys: ReadonlySet<string> }>({
    tabId: null,
    keys: EMPTY
  })
  const [filter, setFilter] = useState<{ tabId: string | null; text: string }>({ tabId: null, text: '' })
  const [focusedKey, setFocusedKey] = useState<{ tabId: string | null; key: string } | null>(null)
  const shown = useStore((s) => s.sidebarVisible && s.view === 'explorer')
  const activeGroupId = useStore((s) => s.activeGroupId)
  const tabId = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' ? tab.id : null
  })
  const path = useStore((s) => {
    const tab = findActiveTab(s)
    return tab?.kind === 'file' ? tab.path : null
  })
  const watching = shown && open ? tabId : null
  const tree = useDocumentSymbols(watching)
  const chain = useSymbolPathAtCursor(watching ? activeGroupId : null, watching, tree)

  const collapsedKeys = collapsed.tabId === tabId ? collapsed.keys : EMPTY
  const query = filter.tabId === tabId ? filter.text : ''
  const sorted = useMemo(() => (tree ? sortSymbolTree(tree, sort) : null), [tree, sort])
  const rows = useMemo(() => (sorted ? symbolRows(sorted, collapsedKeys, query) : []), [sorted, collapsedKeys, query])
  const activeKey = useMemo(() => activeRowKey(rows, chain), [rows, chain])
  const focused = focusedKey?.tabId === tabId ? focusedKey.key : null
  const tabStop = rows.some((r) => r.key === focused) ? focused : (activeKey ?? rows[0]?.key ?? null)

  const { ref: treeRef, onScroll, start, end, scrollToRow } = useVirtualRows(rows.length, watching)
  const pendingFocus = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingInputFocus = useRef(false)

  // Follows the cursor: the row of the current symbol stays in view.
  const follow = useEffectEvent((key: string) => scrollToRow(rows.findIndex((r) => r.key === key)))
  useEffect(() => {
    if (activeKey) follow(activeKey)
  }, [activeKey])

  // Focus requested by keyboard on a row the virtual window may not have mounted yet.
  useEffect(() => {
    if (pendingInputFocus.current && inputRef.current) {
      pendingInputFocus.current = false
      inputRef.current.focus()
    }
    const key = pendingFocus.current
    if (!key) return
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
    if (!el) return
    pendingFocus.current = null
    el.focus()
  })

  const toggle = (key: string): void =>
    setCollapsed(({ tabId: owner, keys }) => {
      const next = new Set(owner === tabId ? keys : EMPTY)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { tabId, keys: next }
    })
  const toggleRef = useRef(toggle)
  const reveal = (row: SymbolRow): void => {
    setFocusedKey({ tabId, key: row.key })
    if (path) revealDocumentSymbol(path, row.symbol)
  }
  const revealRef = useRef(reveal)
  useEffect(() => {
    toggleRef.current = toggle
    revealRef.current = reveal
  })
  // Stable callbacks: the rows are `memo`, moving the cursor redraws only the two rows that change state.
  const [stable] = useState(() => ({
    toggle: (key: string) => toggleRef.current(key),
    reveal: (row: SymbolRow) => revealRef.current(row)
  }))

  const setQuery = (text: string): void => setFilter({ tabId, text })

  const focusRow = (index: number): void => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)]
    if (!row) return
    setFocusedKey({ tabId, key: row.key })
    pendingFocus.current = row.key
    scrollToRow(rows.indexOf(row))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key
    const at = rows.findIndex((r) => r.key === key)
    const row = rows[at]
    if (!row) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const handled = (): void => e.preventDefault()
    switch (e.key) {
      case 'ArrowDown':
        handled()
        return focusRow(at + 1)
      case 'ArrowUp':
        handled()
        return focusRow(at - 1)
      case 'Home':
        handled()
        return focusRow(0)
      case 'End':
        handled()
        return focusRow(rows.length - 1)
      case 'ArrowRight':
        handled()
        if (row.expanded === false && !query) return toggle(row.key)
        if (row.expanded) return focusRow(at + 1)
        return
      case 'ArrowLeft': {
        handled()
        if (row.expanded && !query) return toggle(row.key)
        const parent = rows.slice(0, at).findLastIndex((r) => r.depth === row.depth - 1)
        if (parent >= 0) focusRow(parent)
        return
      }
      case 'Enter':
      case ' ':
        handled()
        return reveal(row)
      case 'Escape':
        if (!query) return
        handled()
        return setQuery('')
      default:
        // Typing with the tree focused opens the filter with the letter; typing continues in the field.
        if (e.key.length === 1 && e.key.trim()) {
          handled()
          setQuery(query + e.key)
          pendingInputFocus.current = true
        }
    }
  }

  if (!root) return null

  const message = !tabId
    ? t.editor.outline.noEditor
    : tree && tree.length === 0
      ? t.editor.outline.noSymbols
      : query && rows.length === 0
        ? t.editor.outline.noMatches
        : null

  return (
    <>
      {open && (
        <Resizer axis="y" onDrag={(delta) => setHeight((h) => Math.min(Math.max(h - delta, MIN_HEIGHT), MAX_HEIGHT))} />
      )}
      <Section
        className={`outline${open ? ' open' : ''}`}
        title={t.editor.outline.title}
        open={open}
        onToggle={setOpen}
        actions={
          <>
            <IconButton
              icon="codicon-collapse-all"
              label={t.editor.outline.collapseAll}
              disabled={!sorted?.length}
              onClick={() => sorted && setCollapsed({ tabId, keys: collapsibleKeys(sorted) })}
            />
            <DropdownMenu
              label={t.editor.outline.sortBy}
              icon={<i className="codicon codicon-ellipsis" />}
              items={SORT_ORDERS.map((order) => ({
                id: `sort-${order}`,
                label:
                  order === 'position'
                    ? t.editor.outline.sortPosition
                    : order === 'name'
                      ? t.editor.outline.sortName
                      : t.editor.outline.sortKind,
                checked: sort === order,
                onSelect: () => setSort(order)
              }))}
            />
          </>
        }
      >
        <div className="outline-body" style={{ height }}>
          {query && (
            <input
              ref={inputRef}
              className="outline-filter"
              value={query}
              aria-label={t.editor.outline.filter}
              placeholder={t.editor.outline.filter}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setQuery('')
                  focusRow(0)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  focusRow(0)
                }
              }}
            />
          )}
          {message ? (
            <div className="empty-line">{message}</div>
          ) : (
            <div
              className="tree outline-tree"
              role="tree"
              aria-label={t.editor.outline.treeLabel}
              ref={treeRef}
              onScroll={onScroll}
              onKeyDown={onKeyDown}
            >
              <div style={{ height: start * ROW_HEIGHT }} />
              {rows.slice(start, end).map((row) => (
                <OutlineRow
                  key={row.key}
                  row={row}
                  active={row.key === activeKey}
                  tabStop={row.key === tabStop}
                  onToggle={stable.toggle}
                  onReveal={stable.reveal}
                />
              ))}
              <div style={{ height: (rows.length - end) * ROW_HEIGHT }} />
            </div>
          )}
        </div>
      </Section>
    </>
  )
}

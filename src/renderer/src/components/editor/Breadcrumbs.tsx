import {
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react'
import type { LspDocumentSymbol } from '@shared/types'
import { useStore } from '../../store'
import type { FileTab } from '../../types/tabs'
import { pathSegments, type PathSegment } from '../../lib/breadcrumbs'
import { toRel } from '../../lib/quickOpenFiles'
import { loadDir } from '../../explorerActions'
import { openFile } from '../../tabActions'
import { revealDocumentSymbol } from '../../lspNavigationActions'
import { useT } from '../../i18n'
import { FileIcon } from '../common/FileIcon'
import { MenuList, type MenuEntry } from '../common/MenuList'
import { SymbolIcon } from '../common/SymbolIcon'
import { useMenuPopup } from '../common/useMenuPopup'
import { useRequest } from '../common/useRequest'
import { useRovingFocus } from '../common/useRovingFocus'
import { getView } from './groupViews'
import { useDocumentSymbols, useSymbolPathAtCursor } from './useDocumentSymbols'

interface CrumbHandle {
  focusAndOpen(): void
}

/** A segment: a button that opens a menu (`useMenuPopup` + `MenuList`) with its siblings. */
function Crumb({
  label,
  icon,
  title,
  tabStop,
  handle,
  menuLabel,
  onOpen,
  renderMenu
}: {
  label: string
  icon: ReactNode
  title?: string
  tabStop: boolean
  handle?: Ref<CrumbHandle> | undefined
  menuLabel: string
  onOpen?: () => void
  renderMenu: (popup: { close: () => void; reopen: () => void }) => ReactNode
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useCallback(() => buttonRef.current?.focus({ preventScroll: true }), [])
  const { open, rootRef, menuRef, menuId, close, openAt, toggle, onMenuKeyDown } = useMenuPopup({ returnFocus })
  const show = (from: 'first' | 'last'): void => {
    onOpen?.()
    openAt(from)
  }
  useImperativeHandle(handle, () => ({
    focusAndOpen: () => {
      buttonRef.current?.focus()
      onOpen?.()
      openAt('first')
    }
  }))

  return (
    <div className="breadcrumb" ref={rootRef as React.RefObject<HTMLDivElement>}>
      <button
        ref={buttonRef}
        type="button"
        className={`breadcrumb-item${open ? ' open' : ''}`}
        title={title ?? label}
        tabIndex={tabStop ? 0 : -1}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) onOpen?.()
          toggle()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          show('first')
        }}
      >
        {icon}
        <span className="breadcrumb-label">{label}</span>
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className="dropdown-menu breadcrumb-menu"
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
        >
          {renderMenu({ close: () => close(true), reopen: () => openAt('first') })}
        </div>
      )}
    </div>
  )
}

/**
 * Items of a folder; picking a folder navigates into it in the same menu, picking a file opens it. After
 * entering a folder (`autoFocus`) focus goes to the first item as soon as the listing arrives.
 */
function FolderMenu({
  dir,
  current,
  autoFocus,
  close,
  enter
}: {
  dir: string
  current: string
  autoFocus: boolean
  close: () => void
  enter: (dir: string) => void
}) {
  const t = useT()
  const root = useStore((s) => s.root)
  const entries = useStore((s) => s.dirs[dir])
  const excludeMatcher = useStore((s) => s.excludeMatcher)
  const listRef = useRef<HTMLDivElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    void loadDir(dir)
  }, [dir])
  const items = useMemo<MenuEntry[]>(
    () =>
      (entries ?? [])
        .filter((e) => !root || excludeMatcher.empty || !excludeMatcher.matches(toRel(root, e.path)))
        .map((e) => ({
          id: e.path,
          label: e.name,
          icon: <FileIcon name={e.name} folder={e.isDirectory} className="breadcrumb-icon" />,
          checked: e.path === current,
          onSelect: () => (e.isDirectory ? enter(e.path) : openFile(e.path, undefined, { preview: true }))
        })),
    [entries, root, excludeMatcher, current, enter]
  )
  useEffect(() => {
    if (!autoFocus || focused.current || items.length === 0) return
    focused.current = true
    listRef.current?.querySelector<HTMLElement>('[data-nav]')?.focus()
  }, [autoFocus, items])
  if (entries && items.length === 0) return <div className="breadcrumb-empty">{t.editor.breadcrumbs.empty}</div>
  return (
    <div ref={listRef} className="breadcrumb-menu-list">
      <MenuList items={items} close={close} />
    </div>
  )
}

function PathCrumb({
  segment,
  file,
  tabStop,
  handle
}: {
  segment: PathSegment
  file: boolean
  tabStop: boolean
  handle?: Ref<CrumbHandle> | undefined
}) {
  const t = useT()
  // Folder the menu shows: starts at the one containing the segment and changes on entering a subfolder.
  const [view, setView] = useState({ dir: segment.parent, entered: false })
  return (
    <Crumb
      label={segment.name}
      title={segment.path}
      icon={<FileIcon name={segment.name} folder={!file} className="breadcrumb-icon" />}
      tabStop={tabStop}
      handle={handle}
      menuLabel={t.editor.breadcrumbs.folderItems(segment.name)}
      onOpen={() => setView({ dir: segment.parent, entered: false })}
      renderMenu={({ close, reopen }) => (
        <FolderMenu
          key={view.dir}
          dir={view.dir}
          current={segment.path}
          autoFocus={view.entered}
          close={close}
          enter={(dir) => {
            setView({ dir, entered: true })
            reopen()
          }}
        />
      )}
    />
  )
}

function SymbolCrumb({
  symbol,
  siblings,
  path,
  tabStop,
  handle
}: {
  symbol: LspDocumentSymbol
  siblings: LspDocumentSymbol[]
  path: string
  tabStop: boolean
  handle?: Ref<CrumbHandle> | undefined
}) {
  const t = useT()
  return (
    <Crumb
      label={symbol.name}
      icon={<SymbolIcon kind={symbol.kind} className="breadcrumb-icon" />}
      tabStop={tabStop}
      handle={handle}
      menuLabel={t.editor.breadcrumbs.symbols}
      renderMenu={({ close }) => (
        <MenuList
          close={close}
          items={siblings.map((s, i) => ({
            id: `${i}:${s.name}`,
            label: s.name,
            icon: <SymbolIcon kind={s.kind} className="breadcrumb-icon" />,
            checked: s === symbol,
            onSelect: () => revealDocumentSymbol(path, s)
          }))}
        />
      )}
    />
  )
}

const Separator = () => <i className="codicon codicon-chevron-right breadcrumb-separator" aria-hidden />

/** Bar above the group editor: folders and file (from the root) and the symbols enclosing the cursor. */
export function Breadcrumbs({ groupId, tab }: { groupId: string; tab: FileTab }) {
  const t = useT()
  const root = useStore((s) => s.root)
  const tree = useDocumentSymbols(tab.id)
  const chain = useSymbolPathAtCursor(groupId, tab.id, tree)
  const segments = useMemo(() => pathSegments(root, tab.path), [root, tab.path])
  const lastRef = useRef<CrumbHandle>(null)
  const onKeyDown = useRovingFocus({ selector: '.breadcrumb-item' })
  useRequest(
    'breadcrumbsFocus',
    () => lastRef.current?.focusAndOpen(),
    (p) => p.groupId === groupId
  )

  const count = segments.length + chain.length
  return (
    <nav
      className="breadcrumbs"
      aria-label={t.editor.breadcrumbs.label}
      onKeyDown={(e) => {
        onKeyDown(e)
        // Esc outside a menu (the menu consumes it) goes back to the text.
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault()
          getView(groupId)?.focus()
        }
      }}
    >
      {segments.map((segment, i) => (
        <Fragment key={segment.path}>
          {i > 0 && <Separator />}
          <PathCrumb
            segment={segment}
            file={i === segments.length - 1}
            tabStop={i === count - 1}
            handle={i === count - 1 ? lastRef : undefined}
          />
        </Fragment>
      ))}
      {chain.map((symbol, i) => (
        <Fragment key={`${i}:${symbol.name}`}>
          <Separator />
          <SymbolCrumb
            symbol={symbol}
            siblings={i === 0 ? (tree ?? []) : (chain[i - 1]?.children ?? [])}
            path={tab.path}
            tabStop={segments.length + i === count - 1}
            handle={segments.length + i === count - 1 ? lastRef : undefined}
          />
        </Fragment>
      ))}
    </nav>
  )
}

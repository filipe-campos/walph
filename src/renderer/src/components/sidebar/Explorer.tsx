import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, type KeyboardEvent } from 'react'
import { findActiveTab } from '../../lib/findActiveTab'
import type { DirEntry } from '@shared/types'
import { useStore } from '../../store'
import { basename, isInside } from '../../lib/path'
import { buildDecorations, decorationBadge, type Decoration } from '../../lib/gitDecorations'
import { buildIgnoredSet, isGitIgnored } from '../../lib/gitIgnored'
import { toRel } from '../../lib/quickOpenFiles'
import { flattenTree, ROW_HEIGHT, treeKeyAction, treeKeyName, type TreeRow } from '../../lib/explorerTree'
import { FileIcon } from '../common/FileIcon'
import { Chevron } from '../common/Chevron'
import { InlineEdit } from '../common/InlineEdit'
import { useFocusRegion } from '../common/useFocusRegion'
import { useRequest } from '../common/useRequest'
import { useVirtualRows } from '../common/useVirtualRows'
import { useT } from '../../i18n'
import {
  collapseAll,
  collapseExplorerSelection,
  extendExplorerSelection,
  loadDir,
  onExplorerRenamed,
  selectAllExplorer,
  selectExplorer,
  setExplorerEdit,
  setExplorerSelected,
  toggleDir
} from '../../explorerActions'
import type { ClickMode } from '../../lib/explorerSelection'
import {
  activateExplorerEntry,
  deletePaths,
  explorerTargetDir,
  showExplorerContextMenu,
  submitEdit
} from '../../explorerFsActions'
import { openFile } from '../../tabActions'
import { useExplorerDnd } from './useExplorerDnd'
import { usePendingRowFocus } from './usePendingRowFocus'
import { pickAndOpenWorkspace } from '../../workspaceLifecycle'
import { Button } from '../common/Button'
import { IconButton } from '../common/IconButton'

// ---------- Components ----------

/** Chevron (folders) or a space of the same size, and the theme icon by name. */
function RowIcons({ name, folder, open }: { name: string; folder: boolean; open?: boolean }) {
  return (
    <>
      {folder ? <Chevron /> : <Chevron placeholder />}
      <FileIcon name={name} folder={folder} open={open} size={folder ? 18 : 16} className="tree-icon" />
    </>
  )
}

export function InlineInput({ depth, initial, folder }: { depth: number; initial: string; folder: boolean }) {
  return (
    <div className="tree-row editing" style={{ paddingLeft: 8 + depth * 12 }}>
      <RowIcons name={initial} folder={folder} />
      <InlineEdit
        initial={initial}
        select="basename"
        onCommit={(value) => void submitEdit(value)}
        onCancel={() => setExplorerEdit(null)}
      />
    </div>
  )
}

/** ⌘ (macOS) / Ctrl toggles the row, Shift selects the range; without a modifier it is the usual click. */
function clickMode(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): ClickMode {
  if (window.api.platform === 'darwin' ? e.metaKey : e.ctrlKey) return 'toggle'
  return e.shiftKey ? 'range' : 'single'
}

const entryPaths = (rows: readonly TreeRow[]): string[] =>
  rows.flatMap((r) => (r.kind === 'entry' ? [r.entry.path] : []))

interface RowProps {
  entry: DirEntry
  depth: number
  expanded: boolean
  selected: boolean
  focused: boolean
  active: boolean
  renaming: boolean
  dropping: boolean
  cut: boolean
  deco: Decoration | undefined
  ignored: boolean
  tabStop: boolean
  select: (path: string, mode: ClickMode) => void
  onKey: (e: KeyboardEvent<HTMLDivElement>, entry: DirEntry) => void
}

// Memoized: each row gets only primitives/stable references, so selecting or decorating one does not redraw the others.
const TreeRow = memo(function TreeRow({
  entry,
  depth,
  expanded,
  selected,
  focused,
  active,
  renaming,
  dropping,
  cut,
  deco,
  ignored,
  tabStop,
  select,
  onKey
}: RowProps) {
  if (renaming) {
    return <InlineInput depth={depth} initial={entry.name} folder={entry.isDirectory} />
  }

  return (
    <div
      className={`tree-row ${selected ? 'selected' : ''} ${focused ? 'focused' : ''} ${active ? 'active' : ''} ${deco ? `git-${deco}` : ignored ? 'git-ignored' : ''} ${entry.isDirectory && expanded ? 'open' : ''} ${dropping ? 'drop-target' : ''} ${cut ? 'cut' : ''}`}
      draggable
      style={{ paddingLeft: 8 + depth * 12 }}
      title={entry.path}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={entry.isDirectory ? expanded : undefined}
      data-path={entry.path}
      data-folder={entry.isDirectory ? '' : undefined}
      // Roving tabindex: only one row enters the Tab order; the arrows move focus among the others.
      tabIndex={tabStop ? 0 : -1}
      onKeyDown={(e) => onKey(e, entry)}
      onClick={(e) => {
        const mode = clickMode(e)
        select(entry.path, mode)
        if (mode === 'single') activateExplorerEntry(entry)
      }}
      onDoubleClick={() => {
        if (!entry.isDirectory) openFile(entry.path)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void showExplorerContextMenu(entry)
      }}
    >
      <RowIcons name={entry.name} folder={entry.isDirectory} open={expanded} />
      <span className="tree-label">{entry.name}</span>
      {deco && !entry.isDirectory && <span className="git-badge">{decorationBadge(deco)}</span>}
      {deco && entry.isDirectory && <span className="git-dot" />}
    </div>
  )
})

export function Explorer() {
  const t = useT()
  const root = useStore((s) => s.root)
  const git = useStore((s) => s.git)
  const dirs = useStore((s) => s.dirs)
  const expanded = useStore((s) => s.expanded)
  const edit = useStore((s) => s.explorerEdit)
  const excludeMatcher = useStore((s) => s.excludeMatcher)
  // Path of the active tab: a single selector, instead of one per row.
  const activePath = useStore((s) => findActiveTab(s)?.path)
  const focused = useStore((s) => s.explorerSelected)
  const selection = useStore((s) => s.explorerSelection)
  const selectedSet = useMemo(() => new Set(selection), [selection])
  const cutPaths = useStore((s) => (s.explorerClipboard?.mode === 'cut' ? s.explorerClipboard.paths : null))
  const ignoredSet = useMemo(() => buildIgnoredSet(git?.ignored ?? [], window.api.platform), [git])
  const decorations = useMemo(() => (root ? buildDecorations(git, root) : new Map<string, Decoration>()), [git, root])

  // `files.exclude`: the filter is derived, so changing the setting applies right away, without reloading the folders.
  const rows = useMemo(
    () =>
      root
        ? flattenTree(
            root,
            dirs,
            expanded,
            (e) => excludeMatcher.empty || !excludeMatcher.matches(toRel(root, e.path)),
            edit
          )
        : [],
    [root, dirs, expanded, excludeMatcher, edit]
  )

  // Virtualization: only the rows of the visible window exist in the DOM (fixed height of 22px).
  const { ref: treeRef, onScroll, start, end, scrollToRow } = useVirtualRows(rows.length, root)
  const treeRegionRef = useFocusRegion<HTMLDivElement>('tree', { intoRef: treeRef })
  const focusRow = usePendingRowFocus(treeRef, rows, scrollToRow)
  const { dropDir, handlers: dndHandlers } = useExplorerDnd(root)
  // The row being edited (create/rename) never leaves the DOM: the input would lose the text and focus without a blur.
  const editIndex = edit
    ? rows.findIndex((r) =>
        r.kind === 'create' ? edit.mode !== 'rename' : edit.mode === 'rename' && r.entry.path === edit.path
      )
    : -1
  const editRow = editIndex >= 0 ? rows[editIndex] : null

  // Scrolls to the row being edited when it starts and to the revealed path (`revealInExplorer`).
  const editKey = edit ? (edit.mode === 'rename' ? `r:${edit.path}` : `c:${edit.dir}:${edit.mode}`) : null
  const scrollToEdit = useEffectEvent(() => scrollToRow(editIndex))
  useEffect(() => {
    if (editKey) scrollToEdit()
  }, [editKey])
  useRequest('explorerReveal', ({ path }) =>
    scrollToRow(rows.findIndex((r) => r.kind === 'entry' && r.entry.path === path))
  )

  // End of a rename (confirmed or cancelled): selection and focus return to the row, already with the new name.
  const onRenamed = useEffectEvent((from: string, to: string) => {
    if (to === from) {
      setExplorerSelected(to)
      focusRow(to)
    } else if (useStore.getState().explorerSelected === to) {
      focusRow(to)
    }
  })
  useEffect(() => onExplorerRenamed(onRenamed), [])

  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const onSelect = useCallback((path: string, mode: ClickMode): void => {
    if (mode === 'single') setExplorerSelected(path)
    else selectExplorer(path, mode, entryPaths(rowsRef.current))
  }, [])

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, entry: DirEntry): void => {
      // The rename/create input is not a child of the row, but keys coming from inside never belong to the tree.
      if (e.target !== e.currentTarget) return
      const key = treeKeyName(e, window.api.platform)
      const action = key && treeKeyAction(rowsRef.current, entry.path, key)
      if (!action) return
      // Esc only belongs to the tree when there is a multiple selection to clear.
      if (action.type === 'clear' && useStore.getState().explorerSelection.length < 2) return
      e.preventDefault()
      switch (action.type) {
        case 'delete': {
          const { explorerSelection } = useStore.getState()
          const paths = explorerSelection.includes(entry.path) ? explorerSelection : [entry.path]
          // Focus goes to the neighbor of the deleted block (the one below, otherwise the one above) so the keyboard is
          // not lost.
          const list = rowsRef.current.filter((r) => r.kind === 'entry')
          const at = list.findIndex((r) => r.entry.path === entry.path)
          const gone = (p: string): boolean => paths.some((d) => isInside(d, p))
          const next =
            list.slice(at + 1).find((r) => !gone(r.entry.path)) ??
            list
              .slice(0, at)
              .reverse()
              .find((r) => !gone(r.entry.path))
          void deletePaths(paths).then((ok) => {
            if (!ok || next?.kind !== 'entry') return
            setExplorerSelected(next.entry.path)
            focusRow(next.entry.path)
          })
          break
        }
        case 'select':
          setExplorerSelected(action.path)
          focusRow(action.path)
          scrollToRow(rowsRef.current.findIndex((r) => r.kind === 'entry' && r.entry.path === action.path))
          break
        case 'extend':
          extendExplorerSelection(action.path, entryPaths(rowsRef.current))
          focusRow(action.path)
          scrollToRow(rowsRef.current.findIndex((r) => r.kind === 'entry' && r.entry.path === action.path))
          break
        case 'selectAll':
          selectAllExplorer(entryPaths(rowsRef.current))
          break
        case 'clear':
          collapseExplorerSelection()
          break
        case 'expand':
        case 'collapse':
          void toggleDir(action.path, action.type === 'expand')
          break
        case 'rename':
          setExplorerSelected(action.path)
          setExplorerEdit({ mode: 'rename', path: action.path })
          break
        case 'activate':
          setExplorerSelected(action.path)
          activateExplorerEntry(entry)
          break
      }
    },
    [scrollToRow, focusRow]
  )

  if (!root) {
    return (
      <div className="sidebar-view">
        <div className="sidebar-title">{t.files.explorer.title}</div>
        <div className="empty-state">
          <p>{t.files.explorer.noFolder}</p>
          <Button variant="primary" onClick={() => void pickAndOpenWorkspace()}>
            {t.files.explorer.openFolder}
          </Button>
        </div>
      </div>
    )
  }

  // New file/folder goes to the selected folder (or the folder of the selected file).
  const create = async (mode: 'newFile' | 'newFolder'): Promise<void> => {
    const dir = explorerTargetDir() ?? root
    await toggleDir(dir, true)
    setExplorerEdit({ mode, dir })
  }

  // Roving tabindex: the selected row if it is mounted (the virtual window may have left it out); otherwise the first
  // mounted row, so the tree never lacks a Tab stop (without stealing focus).
  const selectedAt = focused ? rows.findIndex((r) => r.kind === 'entry' && r.entry.path === focused) : -1
  const mountedFirst = rows.slice(start, end).find((r) => r.kind === 'entry')
  const tabStopPath =
    focused && selectedAt >= start && selectedAt < end
      ? focused
      : mountedFirst?.kind === 'entry'
        ? mountedFirst.entry.path
        : null

  const renderRow = (row: (typeof rows)[number]) =>
    row.kind === 'create' ? (
      <InlineInput key={row.key} depth={row.depth} initial="" folder={row.folder} />
    ) : (
      <TreeRow
        key={row.key}
        entry={row.entry}
        depth={row.depth}
        expanded={row.expanded}
        selected={selectedSet.has(row.entry.path)}
        focused={selection.length > 1 && focused === row.entry.path}
        active={activePath === row.entry.path}
        renaming={edit?.mode === 'rename' && edit.path === row.entry.path}
        dropping={dropDir === row.entry.path}
        cut={!!cutPaths?.includes(row.entry.path)}
        deco={decorations.get(row.entry.path)}
        ignored={!!root && isGitIgnored(ignoredSet, row.entry.path, root, window.api.platform)}
        tabStop={row.entry.path === tabStopPath}
        select={onSelect}
        onKey={onKey}
      />
    )

  const rootEntry: DirEntry = { name: basename(root), path: root, isDirectory: true }

  return (
    <div className="sidebar-view">
      <div className="sidebar-title">
        <span>{basename(root)}</span>
        <div className="actions">
          <IconButton label={t.files.explorer.newFile} onClick={() => void create('newFile')} icon="codicon-new-file" />
          <IconButton
            label={t.files.explorer.newFolder}
            onClick={() => void create('newFolder')}
            icon="codicon-new-folder"
          />
          <IconButton label={t.common.refresh} onClick={() => void loadDir(root)} icon="codicon-refresh" />
          <IconButton label={t.files.explorer.collapseAll} onClick={collapseAll} icon="codicon-collapse-all" />
        </div>
      </div>
      <div
        className={`tree ${dropDir === root ? 'drop-target' : ''}`}
        role="tree"
        aria-label={t.files.explorer.treeLabel}
        ref={treeRegionRef}
        onScroll={onScroll}
        {...dndHandlers}
        onContextMenu={(e) => {
          e.preventDefault()
          void showExplorerContextMenu(rootEntry, true)
        }}
      >
        {/* The row being edited always stays in the same element (absolute, at its position): scrolling out of the
              window does not unmount it (the input would lose the text); in the window, a same-size space holds the
              place. */}
        <div style={{ position: 'relative' }}>
          {editRow && (
            <div style={{ position: 'absolute', top: editIndex * ROW_HEIGHT, left: 0, right: 0 }}>
              {renderRow(editRow)}
            </div>
          )}
          <div style={{ height: start * ROW_HEIGHT }} />
          {rows
            .slice(start, end)
            .map((row, i) =>
              start + i === editIndex ? <div key="edit-gap" style={{ height: ROW_HEIGHT }} /> : renderRow(row)
            )}
          <div style={{ height: (rows.length - end) * ROW_HEIGHT }} />
        </div>
      </div>
    </div>
  )
}

import { keepDirEntries } from './lib/staleWork'
import { isInside, replacePrefix, dirname } from './lib/path'
import { renameRecent, forgetRecent } from './lib/recentFiles'
import { renameNavigationPaths } from './navigationState'
import {
  collapseToFocused,
  extendSelection,
  hideInside,
  pruneSelection,
  rebaseSelection,
  selectAllVisible,
  selectionAfterClick,
  type ClickMode,
  type ExplorerSelection
} from './lib/explorerSelection'
import { removeTabs } from './lib/editorGroups'
import { createLatestByKey } from './lib/latest'
import { get, enterSeq, onRootChange, set, commitGroups, groupsState } from './store'
import { requestOnce } from './requests'
import type { ExplorerEdit } from './types/explorer'
import { isForeignDiff } from './lib/tabSelectors'
import type { FileTab } from './types/tabs'
import { setRecentFiles } from './recentActions'
import { beginDiskRead, markDeleted } from './diskSync'

const api = window.api

// Two reads of the same folder can come back out of order: only the latest request counts.
const dirReads = createLatestByKey<string>()

export function startExplorerReactions(): () => void {
  return onRootChange(() => dirReads.clear())
}

export async function loadDir(dir: string): Promise<void> {
  // A late readDir of the old folder must not put the entry back into the new folder's `dirs`.
  const { root } = get()
  const seq = enterSeq.current()
  const read = dirReads.next(dir)
  const current = (): boolean => get().root === root && enterSeq.isCurrent(seq) && dirReads.isCurrent(dir, read)
  try {
    const entries = await api.fs.readDir(dir)
    if (!current()) return
    // Same content: keep the array (the explorer does not redraw the folder).
    if (keepDirEntries(get().dirs[dir], entries) === get().dirs[dir]) return
    set((s) => ({ dirs: { ...s.dirs, [dir]: entries } }))
  } catch {
    if (!current()) return
    // Directory removed: forget the cached content.
    set((s) => {
      const dirs = { ...s.dirs }
      delete dirs[dir]
      return { dirs }
    })
  }
}

export async function toggleDir(dir: string, open?: boolean): Promise<void> {
  const next = open ?? !get().expanded[dir]
  if (!next) applySelection(hideInside(currentSelection(), dir))
  set((s) => ({ expanded: { ...s.expanded, [dir]: next } }))
  if (next && !get().dirs[dir]) await loadDir(dir)
}

export function collapseAll(): void {
  const { root } = get()
  // Only the direct children of the root stay visible.
  if (root) {
    for (const dir of Object.keys(get().expanded)) if (dir !== root) applySelection(hideInside(currentSelection(), dir))
  }
  set({ expanded: root ? { [root]: true } : {} })
}

type RenamedListener = (from: string, to: string) => void
const renamedListeners = new Set<RenamedListener>()

/**
 * Listeners that follow the explorer selection at the end of a rename: `to` is the new name, or `from` itself when the
 * edit ended without renaming (cancelled, empty, unchanged or failed). Also fires when a file is moved.
 */
export function onExplorerRenamed(listener: RenamedListener): () => void {
  renamedListeners.add(listener)
  return () => renamedListeners.delete(listener)
}

export function notifyExplorerRenamed(from: string, to: string): void {
  for (const listener of [...renamedListeners]) listener(from, to)
}

export function setExplorerEdit(edit: ExplorerEdit | null): void {
  const was = get().explorerEdit
  set({ explorerEdit: edit })
  if (was?.mode === 'rename' && !(edit?.mode === 'rename' && edit.path === was.path)) {
    notifyExplorerRenamed(was.path, was.path)
  }
}

export function setExplorerDrag(paths: string[]): void {
  set({ explorerDrag: paths })
}

function currentSelection(): ExplorerSelection {
  const { explorerSelection, explorerSelected, explorerAnchor } = get()
  return { selection: explorerSelection, focused: explorerSelected, anchor: explorerAnchor }
}

function applySelection(next: ExplorerSelection): void {
  const cur = currentSelection()
  if (next.focused === cur.focused && next.anchor === cur.anchor && sameList(next.selection, cur.selection)) return
  set({ explorerSelection: next.selection, explorerSelected: next.focused, explorerAnchor: next.anchor })
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((p, i) => p === b[i])

/** Single selection of one row (or none). */
export function setExplorerSelected(path: string | null): void {
  applySelection({ selection: path ? [path] : [], focused: path, anchor: path })
}

/** Selects several paths (the pasted ones, for example); the last one gets focus. */
export function selectExplorerPaths(paths: string[]): void {
  const last = paths.at(-1) ?? null
  applySelection({ selection: paths, focused: last, anchor: last })
}

/** Click on a row; `visible` are the paths of the visible rows in order (for the range). */
export function selectExplorer(path: string, mode: ClickMode, visible: readonly string[]): void {
  applySelection(selectionAfterClick(currentSelection(), path, mode, visible))
}

export function extendExplorerSelection(path: string, visible: readonly string[]): void {
  applySelection(extendSelection(currentSelection(), path, visible))
}

export function selectAllExplorer(visible: readonly string[]): void {
  applySelection(selectAllVisible(currentSelection(), visible))
}

export function collapseExplorerSelection(): void {
  applySelection(collapseToFocused(currentSelection()))
}

/** Updates open tabs after renaming a file or folder. */
export function handleRenamed(from: string, to: string): void {
  set((s) => ({
    // A commit diff is immutable: its path is the commit's, not the working file's.
    tabs: s.tabs.map((t) =>
      isInside(from, t.path) && !isForeignDiff(t) ? { ...t, path: replacePrefix(t.path, from, to) } : t
    )
  }))
  applySelection(rebaseSelection(currentSelection(), from, to))
  setRecentFiles(renameRecent(get().recentFiles, from, to))
  renameNavigationPaths(from, to)
}

/**
 * Closes the clean tabs of a path that went to the trash. Dirty ones stay open, marked as deleted (saving recreates
 * the file), so no work is lost.
 */
export function handleRemoved(path: string): void {
  const inside = get().tabs.filter((t) => isInside(path, t.path) && !isForeignDiff(t))
  const keep = inside.filter((t): t is FileTab => t.kind === 'file' && t.dirty)
  const closing = new Set(inside.filter((t) => !keep.includes(t as FileTab)).map((t) => t.id))
  commitGroups(removeTabs(groupsState(), closing))
  for (const tab of keep) {
    beginDiskRead(tab.id)
    markDeleted(tab.id)
  }
  applySelection(pruneSelection(currentSelection(), path))
  setRecentFiles(forgetRecent(get().recentFiles, path))
}

export async function revealInExplorer(path: string): Promise<void> {
  const { root } = get()
  if (!root || !isInside(root, path)) return
  const chain: string[] = []
  for (let dir = dirname(path); isInside(root, dir); dir = dirname(dir)) {
    chain.unshift(dir)
    if (dir === root) break
  }
  const seq = enterSeq.current()
  for (const dir of chain) {
    await toggleDir(dir, true)
    // The folder changed meanwhile: the path no longer exists in the tree.
    if (get().root !== root || !enterSeq.isCurrent(seq)) return
  }
  requestOnce('explorerReveal', { path })
}

// Explorer tree flattened into (fixed height) rows to render only the visible window.
import type { DirEntry } from '@shared/types'
import { isInside, samePath } from '@shared/pathCompare'
import { dirname } from './path'

export const ROW_HEIGHT = 22

export type ExplorerEditMode = { mode: 'newFile' | 'newFolder'; dir: string } | { mode: 'rename'; path: string }

export type TreeRow =
  | { kind: 'entry'; key: string; entry: DirEntry; depth: number; expanded: boolean }
  | { kind: 'create'; key: string; dir: string; depth: number; folder: boolean }

/** Visible rows: root children always; subfolders only if expanded. The creation row opens the folder's list. */
export function flattenTree(
  root: string,
  dirs: Readonly<Record<string, DirEntry[]>>,
  expanded: Readonly<Record<string, boolean>>,
  keep: (entry: DirEntry) => boolean,
  edit: ExplorerEditMode | null
): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (dir: string, depth: number): void => {
    if (edit && edit.mode !== 'rename' && edit.dir === dir) {
      rows.push({ kind: 'create', key: `create:${edit.mode}:${dir}`, dir, depth, folder: edit.mode === 'newFolder' })
    }
    for (const entry of dirs[dir] ?? []) {
      if (!keep(entry)) continue
      const open = entry.isDirectory && !!expanded[entry.path]
      rows.push({ kind: 'entry', key: entry.path, entry, depth, expanded: open })
      if (open) walk(entry.path, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

/** Range [start, end) of rows to mount for the current scroll, with overscan above and below. */
export function visibleRange(
  total: number,
  scrollTop: number,
  viewport: number,
  rowHeight = ROW_HEIGHT,
  overscan = 12
): { start: number; end: number } {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const count = Math.ceil(viewport / rowHeight)
  return { start: Math.max(0, first - overscan), end: Math.min(total, first + count + overscan) }
}

export type TreeKeyResult =
  | { type: 'select'; path: string }
  | { type: 'expand' | 'collapse'; path: string }
  | { type: 'rename'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'activate'; path: string }
  | { type: 'extend'; path: string }
  | { type: 'selectAll' }
  | { type: 'clear' }

/**
 * Tree keyboard (WAI-ARIA tree pattern) over the flattened rows: ↑/↓/Home/End move the selection, ← collapses or goes
 * to the parent, → expands or goes to the first child, Enter renames, Space acts like the click, Delete deletes
 * (confirmation is up to the caller).
 * Shift+↑/↓/Home/End extend the selection, Mod+A selects all and Esc clears the multiple selection. `null` = key
 * ignored.
 */
export function treeKeyAction(rows: readonly TreeRow[], path: string, key: string): TreeKeyResult | null {
  const entries = rows.filter((r): r is Extract<TreeRow, { kind: 'entry' }> => r.kind === 'entry')
  const index = entries.findIndex((r) => r.entry.path === path)
  const row = entries[index]
  if (!row) return null
  const pathAt = (i: number): string | undefined => entries[Math.min(Math.max(i, 0), entries.length - 1)]?.entry.path
  const at = (i: number): TreeKeyResult | null => {
    const target = pathAt(i)
    return target ? { type: 'select', path: target } : null
  }
  const extend = (i: number): TreeKeyResult | null => {
    const target = pathAt(i)
    return target ? { type: 'extend', path: target } : null
  }
  switch (key) {
    case 'Shift+ArrowDown':
      return extend(index + 1)
    case 'Shift+ArrowUp':
      return extend(index - 1)
    case 'Shift+Home':
      return extend(0)
    case 'Shift+End':
      return extend(entries.length - 1)
    case 'Mod+a':
      return { type: 'selectAll' }
    case 'Escape':
      return { type: 'clear' }
    case 'ArrowDown':
      return at(index + 1)
    case 'ArrowUp':
      return at(index - 1)
    case 'Home':
      return at(0)
    case 'End':
      return at(entries.length - 1)
    case 'ArrowRight':
      if (!row.entry.isDirectory) return null
      if (!row.expanded) return { type: 'expand', path }
      // Open and empty folder (or all filtered out): there is no child to go to.
      return (entries[index + 1]?.depth ?? -1) > row.depth ? at(index + 1) : null
    case 'ArrowLeft': {
      if (row.entry.isDirectory && row.expanded) return { type: 'collapse', path }
      for (let i = index - 1; i >= 0; i--) if ((entries[i]?.depth ?? Infinity) < row.depth) return at(i)
      return null
    }
    case 'Enter':
      return { type: 'rename', path }
    case ' ':
      return { type: 'activate', path }
    case 'Delete':
      return { type: 'delete', path }
    default:
      return null
  }
}

/**
 * Effective tree key: without modifiers it is the key itself; on macOS ⌘⌫ counts as Delete (Finder default);
 * Shift with ↑/↓/Home/End becomes `Shift+<key>` and ⌘ (macOS) / Ctrl + A becomes `Mod+a`. `null` = combination that is
 * not the tree's.
 */
export function treeKeyName(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey?: boolean },
  platform: string
): string | null {
  const mac = platform === 'darwin'
  if (e.altKey || (mac ? e.ctrlKey : e.metaKey)) return null
  if (mac ? e.metaKey : e.ctrlKey) {
    if (mac && e.key === 'Backspace') return 'Delete'
    return e.key.toLowerCase() === 'a' && !e.shiftKey ? 'Mod+a' : null
  }
  return e.shiftKey && SHIFT_MOVES.has(e.key) ? `Shift+${e.key}` : e.key
}

const SHIFT_MOVES: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End'])

/** MIME of the explorer's internal drag and drop (the OS file drop uses `Files` and does not mix). */
export const EXPLORER_DRAG_TYPE = 'application/x-walph-path'

/**
 * Folder that would receive `dragged` when dropped on `target` (folder row = itself; file row = the parent folder;
 * `null` =
 * empty area = root). `null` as the result = dropping here does nothing: on itself, on a descendant or on the folder
 * where it already is.
 */
export function moveTargetDir(
  root: string,
  target: Pick<DirEntry, 'path' | 'isDirectory'> | null,
  dragged: string,
  platform: string
): string | null {
  const dir = !target ? root : target.isDirectory ? target.path : dirname(target.path)
  if (isInside(dragged, dir, { platform })) return null
  if (samePath(dirname(dragged), dir, platform)) return null
  return dir
}

/**
 * Target for dropping several items: the folder, if some of them can move there and none is the folder itself or an
 * ancestor of it. Whoever moves skips those already in that folder.
 */
export function moveTargetDirAll(
  root: string,
  target: Pick<DirEntry, 'path' | 'isDirectory'> | null,
  dragged: readonly string[],
  platform: string
): string | null {
  const dir = dragged.map((p) => moveTargetDir(root, target, p, platform)).find((d) => d !== null) ?? null
  if (dir === null) return null
  return dragged.some((p) => isInside(p, dir, { platform })) ? null : dir
}

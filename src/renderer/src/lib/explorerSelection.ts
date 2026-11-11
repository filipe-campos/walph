// Explorer multiple selection: pure logic over the list, the focused item (paste target) and the Shift anchor.
import { isInside, replacePrefix } from './path'
import { toggleSelected } from './toggleSelected'

export interface ExplorerSelection {
  selection: string[]
  focused: string | null
  anchor: string | null
}

export type ClickMode = 'single' | 'toggle' | 'range'

export const EMPTY_SELECTION: ExplorerSelection = { selection: [], focused: null, anchor: null }

const single = (path: string): ExplorerSelection => ({ selection: [path], focused: path, anchor: path })

/** Range between the anchor and `path` in the visible rows; without a visible anchor it becomes a plain selection. */
function rangeTo(cur: ExplorerSelection, path: string, visible: readonly string[]): ExplorerSelection {
  const to = visible.indexOf(path)
  const anchor = cur.anchor ?? cur.focused
  const from = anchor === null ? -1 : visible.indexOf(anchor)
  if (to < 0 || from < 0) return single(path)
  const [lo = 0, hi = 0] = from < to ? [from, to] : [to, from]
  return { selection: visible.slice(lo, hi + 1), focused: path, anchor }
}

/** Click on a row: plain replaces the selection, ⌘/Ctrl toggles the row, Shift selects the range. */
export function selectionAfterClick(
  cur: ExplorerSelection,
  path: string,
  mode: ClickMode,
  visible: readonly string[]
): ExplorerSelection {
  if (mode === 'toggle') {
    return { selection: toggleSelected(cur.selection, path), focused: path, anchor: path }
  }
  return mode === 'range' ? rangeTo(cur, path, visible) : single(path)
}

/** Shift+arrows/Home/End: extends from the anchor to the row the focus went to. */
export function extendSelection(cur: ExplorerSelection, path: string, visible: readonly string[]): ExplorerSelection {
  return rangeTo(cur, path, visible)
}

/** ⌘/Ctrl+A: all visible rows; the focus and the anchor stay where they were. */
export function selectAllVisible(cur: ExplorerSelection, visible: readonly string[]): ExplorerSelection {
  return { selection: [...visible], focused: cur.focused, anchor: cur.anchor ?? cur.focused }
}

/** Esc: the multiple selection goes away and only the focused item stays selected. */
export function collapseToFocused(cur: ExplorerSelection): ExplorerSelection {
  return cur.focused === null ? EMPTY_SELECTION : single(cur.focused)
}

const rebase = (path: string | null, from: string, to: string): string | null =>
  path !== null && isInside(from, path) ? replacePrefix(path, from, to) : path

/** Rename/move `from` to `to`: the item (and what was inside it) follows the new path. */
export function rebaseSelection(cur: ExplorerSelection, from: string, to: string): ExplorerSelection {
  if (from === to) return cur
  return {
    selection: cur.selection.map((p) => rebase(p, from, to) ?? p),
    focused: rebase(cur.focused, from, to),
    anchor: rebase(cur.anchor, from, to)
  }
}

/** `path` went to the trash: it and what was inside leave the selection. */
export function pruneSelection(cur: ExplorerSelection, path: string): ExplorerSelection {
  const gone = (p: string | null): boolean => p !== null && isInside(path, p)
  return {
    selection: cur.selection.filter((p) => !gone(p)),
    focused: gone(cur.focused) ? null : cur.focused,
    anchor: gone(cur.anchor) ? null : cur.anchor
  }
}

/**
 * Removes what is already inside another item of the list (copying/deleting/dragging the folder already takes the
 * content).
 */
export function outermostPaths(paths: readonly string[]): string[] {
  return paths.filter((p, i) => !paths.some((q, j) => j !== i && q !== p && isInside(q, p)))
}

/**
 * Folder collapsed: what was selected inside it leaves (one does not act on what is not seen) and the focus goes to it.
 */
export function hideInside(cur: ExplorerSelection, dir: string): ExplorerSelection {
  const hidden = (p: string | null): p is string => p !== null && p !== dir && isInside(dir, p)
  return {
    selection: cur.selection.filter((p) => !hidden(p)),
    focused: hidden(cur.focused) ? dir : cur.focused,
    anchor: hidden(cur.anchor) ? dir : cur.anchor
  }
}

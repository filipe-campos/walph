// Comparison of any two files in the `DiffEditor` (outside git): "Select for Compare" + "Compare with Selected",
// "Compare with Saved" (disk ↔ buffer) and "Compare with…" (file picker).
import { currentState } from './components/editor/groupViews'
import { commitGroups, forcedEncodingFor, get, groupsState, set } from './store'
import type { CompareSide, DiffTab, FileTab } from './types/tabs'
import { showTab } from './lib/editorGroups'
import { findActiveTab } from './lib/findActiveTab'
import { showPicker } from './quickInputActions'

const sameSide = (a: CompareSide, b: CompareSide): boolean => a.path === b.path && !!a.saved === !!b.saved

/** Opens (or activates) the `left ↔ right` comparison in the active group. */
export function openCompare(left: CompareSide, right: CompareSide): void {
  const { tabs } = get()
  const tab =
    tabs.find(
      (t): t is DiffTab =>
        t.kind === 'diff' && !!t.compare && sameSide(t.compare.left, left) && sameSide(t.compare.right, right)
    ) ??
    ({
      id: crypto.randomUUID(),
      kind: 'diff',
      path: right.path,
      staged: false,
      compare: { left, right }
    } satisfies DiffTab)
  // `tabActions` imports this module (tab menu): the "show in the active group" lives here to avoid a cycle.
  commitGroups(
    showTab(groupsState(), tab.id),
    { panelMaximized: false, screen: 'workbench' },
    tabs.includes(tab) ? tabs : [...tabs, tab]
  )
}

export function selectForCompare(path: string): void {
  set({ compareSelection: path })
}

/** `true` if a file (other than `path` itself) is selected to compare with `path`. */
export function canCompareWithSelected(path: string | null | undefined): boolean {
  const selected = get().compareSelection
  return !!selected && !!path && selected !== path
}

/** The selected one on the left, `path` on the right. */
export function compareWithSelected(path: string): void {
  const selected = get().compareSelection
  if (!selected || selected === path) return
  openCompare({ path: selected }, { path })
}

function activeFileTab(): FileTab | null {
  const tab = findActiveTab(get())
  return tab?.kind === 'file' ? tab : null
}

export function activeFilePath(): string | null {
  return activeFileTab()?.path ?? null
}

/** The disk on the left, the buffer (with the unsaved changes) on the right. */
export function compareActiveWithSaved(): void {
  const tab = activeFileTab()
  if (tab) openCompare({ path: tab.path, saved: true }, { path: tab.path })
}

/** Project file picker: the chosen file goes to the right of the active file. */
export function openCompareWithPicker(): void {
  if (activeFileTab()) showPicker('compareFile')
}

export function compareActiveWith(path: string): void {
  const active = activeFilePath()
  if (active && active !== path) openCompare({ path: active }, { path })
}

/** Swaps the sides of the comparison (the active one by default); the title and language follow the new right side. */
export function swapCompareSides(tabId: string | undefined = get().activeTabId ?? undefined): void {
  set((s) => {
    const tabs = s.tabs.map((t) =>
      t.id === tabId && t.kind === 'diff' && t.compare
        ? { ...t, path: t.compare.left.path, compare: { left: t.compare.right, right: t.compare.left } }
        : t
    )
    return tabs.some((t, i) => t !== s.tabs[i]) ? { tabs } : s
  })
}

export function isActiveCompare(): boolean {
  const tab = findActiveTab(get())
  return tab?.kind === 'diff' && !!tab.compare
}

/** Open file tabs whose buffer a comparison side shows (the ones that, when changed, require reloading the diff). */
export function bufferTabIds(compare: NonNullable<DiffTab['compare']>): string[] {
  const paths = [compare.left, compare.right].filter((side) => !side.saved).map((side) => side.path)
  return get()
    .tabs.filter((t) => t.kind === 'file' && paths.includes(t.path))
    .map((t) => t.id)
}

/** Text of a side: the buffer of the file's open tab (with unsaved changes) or the disk (no tab, or `saved`). */
export async function readCompareSide(side: CompareSide): Promise<string> {
  if (!side.saved) {
    const tab = get().tabs.find((t) => t.kind === 'file' && t.path === side.path)
    const state = tab ? currentState(tab.id) : undefined
    if (state) return state.doc.toString()
  }
  return (await window.api.fs.readText(side.path, forcedEncodingFor(side.path))).text
}

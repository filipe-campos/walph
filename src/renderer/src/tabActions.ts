import {
  showTab,
  focusGroup,
  splitGroup,
  focusOtherGroup as focusOtherGroupIn,
  focusGroupAt,
  focusGroupToward,
  joinAllGroups,
  moveTabToAdjacentGroup,
  resizeGroups,
  findGroup,
  tabsOnlyIn,
  closeGroup,
  activeTabOf,
  activeGroup,
  groupOfTab,
  activateTab as activateTabIn,
  showInOtherGroup,
  moveTab as moveTabIn,
  closeTabsIn,
  removeTabs
} from './lib/editorGroups'
import type { EditorGroup, GroupsState } from './lib/editorGroups'
import type { GroupSide } from '@shared/editorLayout'
import { closedTabsFor, pushClosedTabs } from './lib/closedTabs'
import { isNonEmptyString } from '@shared/guards'
import type { GitCommitFile, SessionTab, TabAction } from '@shared/types'
import { imageMimeType, isImagePath } from '@shared/imageTypes'
import { isMarkdownPath } from './lib/markdownPreview'
import { fallbackIndent, refreshFallbackIndent } from './lib/textFormat'
import type { Indent } from './lib/textFormat'
import { setDocumentIndent, setEditorPhrases } from './components/editor/documentConfig'
import { bindDocumentHandlers, setPendingView } from './components/editor/documentState'
import { isTextEncoding } from './lib/encodings'
import { forgetDocument } from './components/editor/documentStore'
import { setActiveGroup, tabViewState } from './components/editor/groupViews'
import { findActiveTab } from './lib/findActiveTab'
import { selectTab } from './lib/tabSelectors'
import {
  set,
  type State,
  get,
  commitGroups,
  groupsState,
  patchTab,
  findFileTab,
  onRootChange,
  onTabsClosed,
  useStore
} from './store'
import type { FileTab, Tab, Reveal, DiffTab, ImageTab, MarkdownPreviewTab } from './types/tabs'
import { confirmAndSave } from './saveActions'
import { markRecentFile } from './recentActions'
import { attempt } from './attempt'
import { bindNavigationSource, resetNavigation } from './navigationState'
import { showView } from './layoutActions'
import { requestOnce } from './requests'
import { revealInExplorer } from './explorerActions'
import { formatDirtyEol, syncTabWithDisk } from './diskSync'
import { scheduleSessionSave } from './sessionActions'
import { canCompareWithSelected, compareWithSelected, selectForCompare } from './compareActions'
import { createReactionScope } from './lib/reactions'
import { shallow } from 'zustand/shallow'

const api = window.api

function newFileTab(path: string, preview: boolean): FileTab {
  return {
    id: crypto.randomUUID(),
    kind: 'file',
    path,
    dirty: false,
    preview,
    deleted: false,
    conflict: false,
    eol: null,
    indent: null,
    indentFallback: false,
    encoding: null,
    encodingChosen: false,
    language: null
  }
}

/**
 * New tab from what the session stores (restore the session, reopen a closed tab). The encoding and language chosen
 * by the user come back; cursor and scroll are applied when the file is read.
 */
export function tabFromSession(t: SessionTab, preview: boolean): Tab {
  if (t.kind === 'diff') return { id: crypto.randomUUID(), kind: 'diff', path: t.path, staged: t.staged }
  if (t.kind === 'markdownPreview') return { id: crypto.randomUUID(), kind: 'markdownPreview', path: t.path }
  if (t.kind === 'image') return { id: crypto.randomUUID(), kind: 'image', path: t.path }
  const chosen = isTextEncoding(t.encoding) ? t.encoding : null
  const tab: FileTab = {
    ...newFileTab(t.path, preview),
    encoding: chosen,
    encodingChosen: chosen !== null,
    language: isNonEmptyString(t.language) ? t.language : null
  }
  setPendingView(tab.id, { cursor: t.cursor, topLine: t.topLine })
  return tab
}

/** Asks for the group's editor to get focus (after the React commit the `EditorGroup` moves it to the DOM). */
function requestGroupFocus(groupId: string): void {
  requestOnce('groupFocus', { groupId })
}

/** Adds the tab (if new) and shows it in the active group. */
export function showTabInActiveGroup(tab: Tab, extra: Partial<State> = {}): void {
  const { tabs } = get()
  commitGroups(
    showTab(groupsState(), tab.id),
    { panelMaximized: false, screen: 'workbench', ...extra },
    tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]
  )
}

/** Focus entered a group (click, Tab): it becomes the active one. */
export function activateGroup(groupId: string): void {
  commitGroups(focusGroup(groupsState(), groupId))
}

/** Drags divider `index` of the split at `path` in the grid by `delta` (fraction of that split). */
export function resizeEditorGroups(path: readonly number[], index: number, delta: number): void {
  commitGroups(resizeGroups(groupsState(), path, index, delta))
}

/** Applies a group change that moves focus and takes keyboard focus to the group that became active. */
function commitAndFocus(change: (before: GroupsState) => GroupsState): void {
  const before = groupsState()
  const next = change(before)
  if (next === before) return
  commitGroups(next)
  requestGroupFocus(next.activeGroupId)
}

/** ⌘\: splits the active group (the active tab gets a copy in a new group on that side) and focuses the new one. */
export function splitEditor(side: GroupSide = 'right'): void {
  commitAndFocus((before) => splitGroup(before, crypto.randomUUID(), side))
}

export function focusOtherEditorGroup(): void {
  commitAndFocus(focusOtherGroupIn)
}

/** Focuses the group at position `index` (0 = the 1st); the one after the last is created to the right. */
export function focusEditorGroupAt(index: number): void {
  commitAndFocus((before) => focusGroupAt(before, index, crypto.randomUUID()))
}

export function focusEditorGroupToward(side: GroupSide): void {
  commitAndFocus((before) => focusGroupToward(before, side))
}

/** Moves the active tab to the next (`1`) or previous (`-1`) group, creating it if needed; focus goes along. */
export function moveActiveTabToAdjacentGroup(step: 1 | -1): void {
  commitAndFocus((before) => {
    const tabId = activeTabOf(before)
    return tabId ? moveTabToAdjacentGroup(before, tabId, step, crypto.randomUUID(), before.activeGroupId) : before
  })
}

export function joinAllEditorGroups(): void {
  commitAndFocus(joinAllGroups)
}

/**
 * Tab dropped on a group body: in the center it joins it; on an edge it splits the group on that side and goes to the
 * new one. The tab leaves its source group (which closes if it becomes empty).
 */
export function dropTabOnGroup(tabId: string, targetGroupId: string, zone: GroupSide | 'center', fromGroupId?: string) {
  const before = groupsState()
  const target = findGroup(before, targetGroupId)
  const from = fromGroupId ? findGroup(before, fromGroupId) : groupOfTab(before, tabId)
  if (!target || !from?.tabIds.includes(tabId)) return
  if (zone === 'center') {
    if (from.id !== target.id) moveTab(tabId, target.tabIds.length, target.id, from.id)
    return
  }
  // Splitting its own group with its only tab changes nothing (it would just move from one side to the other).
  if (from.id === target.id && from.tabIds.length < 2) return
  commitAndFocus((state) => {
    const moved = from.id === target.id ? state : moveTabIn(state, tabId, target.id, target.tabIds.length, from.id)
    const host = findGroup(moved, target.id)
    if (!host) return state
    return splitGroup(moved, crypto.randomUUID(), zone, { groupId: host.id, tabId, move: host.tabIds.length > 1 })
  })
}

/**
 * Closes a group (the active one by default): the tabs only it has are closed (with the save prompt), the ones the
 * other group also shows stay open there.
 */
export async function closeEditorGroup(groupId: string = get().activeGroupId): Promise<void> {
  const before = groupsState()
  if (before.groups.length < 2 || !findGroup(before, groupId)) return
  if (!(await confirmAndSave(tabsOnlyIn(before, groupId)))) return
  // The dialog is async: re-evaluates.
  const now = groupsState()
  if (now.groups.length < 2 || !findGroup(now, groupId)) return
  const next = closeGroup(now, groupId)
  commitGroups(next, { cursor: activeTabOf(next) ? get().cursor : null, ...rememberClosed(now, next) })
  requestGroupFocus(next.activeGroupId)
}

/**
 * Opens the file in a tab of the active group. With `preview`, reuses (in the same place, within the group) the
 * existing preview tab instead of adding another; without `preview`, the tab opens pinned, and pins the one already
 * open as preview.
 */
// Tab opened without moving focus to the editor (single click in the explorer, like VS Code: Enter still renames).
// Consumed by the editor when showing the tab; it is transient UI state, so it stays out of the store.
let preserveFocusTabId: string | null = null

/** `true` only once if the tab was opened with `preserveFocus` (the editor does not steal focus when showing it). */
export function consumePreserveFocus(tabId: string): boolean {
  // Any display consumes the request: an old request never prevents focus on a later open.
  const keep = preserveFocusTabId === tabId
  preserveFocusTabId = null
  return keep
}

export function openFile(
  path: string,
  reveal?: Omit<Reveal, 'tabId'>,
  options: { preview?: boolean; preserveFocus?: boolean; asText?: boolean } = {}
): void {
  // SVG is editable text: with a position to reveal (search result, problem) or `asText`, it opens in the editor.
  if (isImagePath(path) && !options.asText && !(reveal && isSvgPath(path))) return openImage(path)
  const preview = options.preview ?? false
  const { tabs } = get()
  const groups = groupsState()
  let tab = tabs.find((t): t is FileTab => t.kind === 'file' && t.path === path)
  let nextTabs: Tab[]
  let replaceId: string | undefined
  if (tab) {
    if (!preview && tab.preview) patchTab(tab.id, { preview: false })
    nextTabs = get().tabs
  } else {
    tab = newFileTab(path, preview)
    // New id on purpose: the editor state of the replaced tab is discarded together with the old id.
    if (preview) {
      const inGroup = new Set(activeGroup(groups).tabIds)
      replaceId = tabs.find((t) => t.kind === 'file' && t.preview && inGroup.has(t.id))?.id
    }
    nextTabs = [...tabs, tab]
  }
  preserveFocusTabId = options.preserveFocus && !reveal ? tab.id : null
  // The editor is hidden while the panel is maximized: opening a file restores the panel.
  commitGroups(
    showTab(groups, tab.id, { replaceId }),
    { reveal: reveal ? { ...reveal, tabId: tab.id } : null, panelMaximized: false, screen: 'workbench' },
    nextTabs
  )
  markRecentFile(path)
}

export const isSvgPath = (path: string): boolean => imageMimeType(path) === 'image/svg+xml'

/** Opens (or activates) the image in the viewer; a single click in the explorer leaves no preview tabs behind. */
export function openImage(path: string): void {
  const tab =
    get().tabs.find((t): t is ImageTab => t.kind === 'image' && t.path === path) ??
    ({ id: crypto.randomUUID(), kind: 'image', path } satisfies ImageTab)
  showTabInActiveGroup(tab)
  markRecentFile(path)
}

/** Pins a preview tab (double click). */
export function pinTab(id: string): void {
  patchTab(id, { preview: false })
}

export function openDiff(path: string, staged: boolean): void {
  const tab =
    get().tabs.find(
      (t) => t.kind === 'diff' && !t.commit && !t.proposal && !t.compare && t.path === path && t.staged === staged
    ) ?? ({ id: crypto.randomUUID(), kind: 'diff', path, staged } satisfies DiffTab)
  showTabInActiveGroup(tab)
}

/** Opens (or activates) the read-only diff of a file in a commit. */
export function openCommitDiff(hash: string, file: GitCommitFile): void {
  const tab =
    get().tabs.find((t) => t.kind === 'diff' && t.commit?.hash === hash && t.path === file.path) ??
    ({
      id: crypto.randomUUID(),
      kind: 'diff',
      path: file.path,
      staged: false,
      commit: { hash, file }
    } satisfies DiffTab)
  showTabInActiveGroup(tab)
}

/** Opens (or activates) the diff between the two versions of a file in a merge conflict. */
export function openConflictDiff(path: string): void {
  const tab =
    get().tabs.find((t) => t.kind === 'diff' && t.mergeCompare && t.path === path) ??
    ({ id: crypto.randomUUID(), kind: 'diff', path, staged: false, mergeCompare: true } satisfies DiffTab)
  showTabInActiveGroup(tab)
}

/** Markdown preview of an open file, or `undefined`. */
function findMarkdownPreview(path: string): MarkdownPreviewTab | undefined {
  return get().tabs.find((t): t is MarkdownPreviewTab => t.kind === 'markdownPreview' && t.path === path)
}

/**
 * ⇧⌘V: opens the preview of the active `.md` in the other group (creating the split if needed); with the preview
 * already open, only focuses it. With a preview active, goes back to the source file. Keyboard focus stays on the file
 * to keep typing.
 */
export function openMarkdownPreview(): void {
  const { tabs } = get()
  const active = activeTab()
  if (active?.kind === 'markdownPreview') {
    const source = tabs.find((t) => t.kind === 'file' && t.path === active.path)
    if (source) activateTab(source.id)
    else openFile(active.path)
    return requestGroupFocus(get().activeGroupId)
  }
  if (active?.kind !== 'file' || !isMarkdownPath(active.path)) return
  const existing = findMarkdownPreview(active.path)
  if (existing) {
    const groups = groupsState()
    const group = groupOfTab(groups, existing.id)
    if (!group) return
    commitGroups(activateTabIn(groups, existing.id, group.id))
    return requestGroupFocus(group.id)
  }
  const preview: MarkdownPreviewTab = { id: crypto.randomUUID(), kind: 'markdownPreview', path: active.path }
  commitGroups(showInOtherGroup(groupsState(), preview.id, crypto.randomUUID()), { panelMaximized: false }, [
    ...tabs,
    preview
  ])
}

/** Activates the tab in the requested group (else in the active one if it has it, else the first that has it). */
export function activateTab(id: string, groupId?: string): void {
  commitGroups(activateTabIn(groupsState(), id, groupId), { screen: 'workbench' })
  const tab = selectTab(id)(get())
  if (tab?.kind === 'file') markRecentFile(tab.path)
}

/**
 * Moves the tab to position `toIndex` (the final one, as in `dropIndex`) of the target group. Across groups, the tab
 * leaves the source (a group left empty closes) and the target becomes the active one.
 */
export function moveTab(id: string, toIndex: number, toGroupId?: string, fromGroupId?: string): void {
  const groups = groupsState()
  const to = toGroupId ?? groupOfTab(groups, id)?.id
  if (!to) return
  commitGroups(moveTabIn(groups, id, to, toIndex, fromGroupId))
}

/** Tab group for menu/command actions: the requested one, else the active one if it has it, else the first with it. */
function groupForTab(id: string, groupId?: string): EditorGroup | undefined {
  const groups = groupsState()
  const requested = groupId ? findGroup(groups, groupId) : undefined
  return requested?.tabIds.includes(id) ? requested : groupOfTab(groups, id)
}

/**
 * Closes the tabs, asking "Save / Don't Save / Cancel" only once for all the ones with changes.
 * With `groupId` closes only in that group (a tab the other group also shows stays open and asks nothing);
 * without it, in all of them. The group's active tab, if closed, moves to the neighbor on the right (or the last left).
 */
export async function closeTabs(ids: string[], groupId?: string): Promise<void> {
  const before = groupsState()
  const elsewhere = groupId ? new Set(before.groups.filter((g) => g.id !== groupId).flatMap((g) => g.tabIds)) : null
  if (!(await confirmAndSave(elsewhere ? ids.filter((id) => !elsewhere.has(id)) : ids))) return
  // The dialog is async: re-evaluates what is still open.
  const now = groupsState()
  const next = groupId ? closeTabsIn(now, groupId, ids) : removeTabs(now, ids)
  if (next.groups.length === now.groups.length && next.groups.every((g, i) => g === now.groups[i])) return
  commitGroups(next, { cursor: activeTabOf(next) ? get().cursor : null, ...rememberClosed(now, next) })
}

/** Stacks what the user closed for "Reopen Closed Tab" (read before the commit, cursor still in the editor). */
function rememberClosed(before: GroupsState, after: GroupsState): Pick<State, 'closedTabs'> {
  const { closedTabs, tabs } = get()
  return { closedTabs: pushClosedTabs(closedTabs, closedTabsFor(before, after, tabs, tabViewState)) }
}

export function closeTab(id: string, groupId?: string): Promise<void> {
  const group = groupForTab(id, groupId)
  return group ? closeTabs([id], group.id) : Promise.resolve()
}

export function closeOtherTabs(id: string, groupId?: string): Promise<void> {
  const group = groupForTab(id, groupId)
  return group
    ? closeTabs(
        group.tabIds.filter((t) => t !== id),
        group.id
      )
    : Promise.resolve()
}

export function closeTabsToRight(id: string, groupId?: string): Promise<void> {
  const group = groupForTab(id, groupId)
  return group ? closeTabs(group.tabIds.slice(group.tabIds.indexOf(id) + 1), group.id) : Promise.resolve()
}

/** Closes the tabs without pending changes (diff and preview tabs count as saved) in the active group. */
export function closeSavedTabs(groupId?: string): Promise<void> {
  const group = (groupId ? findGroup(groupsState(), groupId) : undefined) ?? activeGroup(groupsState())
  const { tabs } = get()
  const saved = new Set(tabs.filter((t) => t.kind !== 'file' || !t.dirty).map((t) => t.id))
  return closeTabs(
    group.tabIds.filter((id) => saved.has(id)),
    group.id
  )
}

/** Native context menu of a tab and the execution of the chosen action. */
export async function showTabMenu(id: string, groupId?: string): Promise<void> {
  const { tabs } = get()
  const group = groupForTab(id, groupId)
  const tab = selectTab(id)({ tabs })
  if (!tab || !group) return
  const inGroup = group.tabIds.map((tid) => tabs.find((t) => t.id === tid)).filter((t): t is Tab => !!t)
  const idx = group.tabIds.indexOf(id)
  const action = await attempt(() =>
    api.tabs.showContextMenu({
      hasOthers: inGroup.length > 1,
      hasRight: idx < inGroup.length - 1,
      hasSaved: inGroup.some((t) => t.kind !== 'file' || !t.dirty),
      isFile: tab.kind === 'file',
      canCompare: tab.kind === 'file' && canCompareWithSelected(tab.path)
    })
  )
  if (action === undefined) return
  await attempt(() => runTabAction(id, tab.path, action, group.id))
}

async function runTabAction(id: string, path: string, action: TabAction | null, groupId: string): Promise<void> {
  switch (action) {
    case 'close':
      return closeTab(id, groupId)
    case 'closeOthers':
      return closeOtherTabs(id, groupId)
    case 'closeRight':
      return closeTabsToRight(id, groupId)
    case 'closeSaved':
      return closeSavedTabs(groupId)
    case 'copyPath':
      return api.fs.copyPath(path)
    case 'reveal':
      showView('explorer')
      return revealInExplorer(path)
    case 'selectForCompare':
      return selectForCompare(path)
    case 'compareWithSelected':
      return compareWithSelected(path)
    case null:
      return
  }
}

/** Per-tab dirty is kept by the editor; only the already computed changes arrive here. Editing pins the preview. */
function setDirty(id: string, dirty: boolean): void {
  if (dirty) return patchTab(id, { dirty, preview: false })
  // Only the line ending changed: stays dirty until saved, even when undoing the edits. The conflict is not cleared
  // here: the disk reread decides (text equal to the base = no conflict; different = conflict).
  if (formatDirtyEol(id) !== undefined) return void syncTabWithDisk(id)
  const wasDirty = findFileTab(id)?.dirty
  patchTab(id, { dirty, conflict: false })
  // Back to the base by undoing: the disk may have changed meanwhile (conflict, "Keep my version"). The tab is now
  // clean, so resyncing adopts the disk content instead of hiding the change.
  if (wasDirty) void syncTabWithDisk(id)
}

export function clearReveal(): void {
  set({ reveal: null })
}

function setCursor(cursor: State['cursor']): void {
  const prev = get().cursor
  // Every editor selection arrives here: one equal to the previous does not wake the mounted selectors.
  if (
    prev === cursor ||
    (prev && cursor && prev.line === cursor.line && prev.column === cursor.column && prev.selected === cursor.selected)
  )
    return
  set({ cursor })
}

/** Active tab of the current state, or `undefined`. */
export function activeTab(): Tab | undefined {
  return findActiveTab(get())
}

/** Active file tab already loaded in the editor (the status bar and pickers only act on it); otherwise `null`. */
export function activeLoadedFileTab(): FileTab | null {
  const tab = activeTab()
  return tab?.kind === 'file' && tab.eol !== null ? tab : null
}

function bindEditorHandlers(): void {
  // The editor keeps dirty/cursor itself and notifies the store through here (without the editor importing the store).
  bindDocumentHandlers({ setDirty, setCursor, onScroll: scheduleSessionSave })
  // The "jump from" position is the active tab's (1-based line, 0-based `Reveal` column).
  bindNavigationSource(() => {
    const tab = activeTab()
    const { cursor } = get()
    return tab?.kind === 'file' && cursor ? { path: tab.path, line: cursor.line, column: cursor.column - 1 } : null
  })
}

function unbindEditorHandlers(): void {
  bindDocumentHandlers({ setDirty: () => {}, setCursor: () => {}, onScroll: () => {} })
  bindNavigationSource(() => null)
}

export function startTabReactions(): () => void {
  const scope = createReactionScope()
  scope.bindGlobal(bindEditorHandlers, unbindEditorHandlers)
  // The editor needs to know which group is active (status bar cursor, commands without an explicit group).
  setActiveGroup(get().activeGroupId)

  // Another folder: the navigation history points to files that no longer belong to this window.
  scope.add(onRootChange(() => resetNavigation()))
  // Discards the editor state of closed or replaced tabs.
  scope.add(
    onTabsClosed((ids) => {
      for (const id of ids) forgetDocument(id)
    })
  )
  scope.add(
    useStore.subscribe(
      (s) => s.activeGroupId,
      (id) => setActiveGroup(id)
    )
  )
  scope.add(
    useStore.subscribe(
      (s) => s.locale,
      () => setEditorPhrases()
    )
  )
  // Tabs whose indent came from the fallback follow `editor.tabSize`/`editor.insertSpaces`; detected ones don't change.
  scope.add(
    useStore.subscribe(
      (s) => [s.settings['editor.tabSize'], s.settings['editor.insertSpaces']] as const,
      ([tabSize, insertSpaces]) => {
        const fallback = fallbackIndent(insertSpaces, tabSize)
        // Functional form: does not overwrite tabs changed by another `set` between the read and the write.
        const reindented: Array<[string, Indent]> = []
        set((st) => {
          reindented.length = 0
          const tabs = st.tabs.map((t) => {
            if (t.kind !== 'file') return t
            const next = refreshFallbackIndent(t, fallback)
            if (next !== t && next.indent) reindented.push([t.id, next.indent])
            return next
          })
          return reindented.length > 0 ? { tabs } : st
        })
        // Size passed explicitly: does not depend on `setEditorConfig` having already run.
        for (const [id, indent] of reindented) setDocumentIndent(id, indent, tabSize)
      },
      { equalityFn: shallow }
    )
  )
  return scope.stop
}

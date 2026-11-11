import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { GitNetworkOp, TextEncoding } from '@shared/types'
import { type Indent, fallbackIndent } from './lib/textFormat'
import { chosenEncoding } from './lib/encodings'
import { activeTabOf, openTabIds, type GroupsState } from './lib/editorGroups'
import { reconcileLayout } from '@shared/editorLayout'
import { createLatest } from './lib/latest'
import { createSubscribeDiff } from './lib/reactions'
import { globalClaudeState, scopedClaudeState } from './state/claude'
import { scopedDebugState } from './state/debug'
import { globalExplorerState, scopedExplorerState } from './state/explorer'
import { globalGitState, scopedGitState } from './state/git'
import { globalLayoutState } from './state/layout'
import { scopedLspState } from './state/lsp'
import { globalPanelState, scopedPanelState } from './state/panel'
import { scopedQuickInputState } from './state/quickInput'
import { scopedRequestsState } from './state/requests'
import { globalSettingsState, scopedSettingsState } from './state/settings'
import { globalSnippetsState } from './state/snippets'
import { globalTabsState, scopedTabsState } from './state/tabs'
import { globalToastsState } from './state/toasts'
import type { ClaudePanelState } from './types/claude'
import type { DebugState } from './types/debug'
import type { ExplorerState } from './types/explorer'
import type { GitState } from './types/git'
import type { LayoutState } from './types/layout'
import type { LspState } from './types/lsp'
import type { PanelState } from './types/panel'
import type { QuickInputState } from './types/quickInput'
import type { RequestsState } from './types/requests'
import type { SettingsState } from './types/settings'
import type { SnippetsState } from './types/snippets'
import type { FileTab, Tab, TabsState } from './types/tabs'
import type { ToastsState } from './types/toasts'

/**
 * The store is a single one: each domain describes its part (`types/<domain>.ts`, initial state in
 * `state/<domain>.ts`).
 */
export type State = LayoutState &
  SettingsState &
  TabsState &
  ExplorerState &
  GitState &
  PanelState &
  LspState &
  DebugState &
  ClaudePanelState &
  QuickInputState &
  RequestsState &
  ToastsState &
  SnippetsState

export const useStore = create<State>()(
  subscribeWithSelector((): State => ({
    ...globalLayoutState(),
    ...globalSettingsState(),
    ...globalTabsState(),
    ...globalExplorerState(),
    ...globalGitState(),
    ...globalPanelState(),
    ...globalClaudeState(),
    ...globalToastsState(),
    ...globalSnippetsState(),
    ...workspaceScopedState(null)
  }))
)

type WorkspaceScoped = ReturnType<typeof scopedClaudeState> &
  ReturnType<typeof scopedPanelState> &
  ReturnType<typeof scopedTabsState> &
  ReturnType<typeof scopedExplorerState> &
  ReturnType<typeof scopedGitState> &
  ReturnType<typeof scopedLspState> &
  ReturnType<typeof scopedDebugState> &
  ReturnType<typeof scopedQuickInputState> &
  ReturnType<typeof scopedRequestsState> &
  ReturnType<typeof scopedSettingsState>

/**
 * Everything that belongs to ONE folder: the initial state of `create()` (`null`) and what `enterWorkspace` resets on
 * folder switch come from here, in a single `set`, so the two never diverge. New state that depends on the folder goes
 * into its domain's `scoped…State`; `onRootChange` is only for module state (maps, timers, processes). `prev`
 * keeps what survives the switch: the `claude.starting` queue and the panel view.
 */
export function workspaceScopedState(root: string | null, prev?: Pick<State, 'claude' | 'panelView'>): WorkspaceScoped {
  return {
    ...scopedClaudeState(prev),
    ...scopedPanelState(prev),
    ...scopedTabsState(),
    ...scopedExplorerState(root),
    ...scopedGitState(),
    ...scopedLspState(),
    ...scopedDebugState(),
    ...scopedQuickInputState(),
    ...scopedRequestsState(),
    ...scopedSettingsState()
  }
}

type RootChangeListener = (s: State) => void
const rootChangeListeners: RootChangeListener[] = []
let stopRootWatch: (() => void) | null = null

/**
 * Single list of reactions to "another folder" (each module registers its own; the state itself is
 * `workspaceScopedState`). A single store subscription calls them, in registration order; the subscription only exists
 * while there are listeners. Returns the disposer.
 */
export function onRootChange(listener: RootChangeListener): () => void {
  rootChangeListeners.push(listener)
  stopRootWatch ??= useStore.subscribe(
    (s) => s.root,
    () => {
      for (const l of [...rootChangeListeners]) l(get())
    }
  )
  return () => {
    const i = rootChangeListeners.indexOf(listener)
    if (i >= 0) rootChangeListeners.splice(i, 1)
    if (rootChangeListeners.length === 0) {
      stopRootWatch?.()
      stopRootWatch = null
    }
  }
}

/** Reaction that depends on the previous value: the only correct way to use `prev` (see `createSubscribeDiff`). */
export const subscribeDiff = createSubscribeDiff(useStore)

type TabsClosedListener = (ids: string[]) => void
const tabsClosedListeners: TabsClosedListener[] = []
let stopTabsWatch: (() => void) | null = null

/**
 * Each module that keeps per-tab state prunes it here when the tab leaves the store (closed or replaced); the
 * calls follow registration order. A single store subscription, which only exists while there are listeners. Returns
 * the disposer.
 */
export function onTabsClosed(listener: TabsClosedListener): () => void {
  tabsClosedListeners.push(listener)
  stopTabsWatch ??= subscribeDiff(
    (s) => s.tabs,
    (tabs, prev) => {
      const open = new Set(tabs.map((t) => t.id))
      const closed = prev.filter((t) => !open.has(t.id)).map((t) => t.id)
      if (closed.length === 0) return
      for (const l of [...tabsClosedListeners]) l(closed)
    }
  )
  return () => {
    const i = tabsClosedListeners.indexOf(listener)
    if (i >= 0) tabsClosedListeners.splice(i, 1)
    if (tabsClosedListeners.length === 0) {
      stopTabsWatch?.()
      stopTabsWatch = null
    }
  }
}

export const get = useStore.getState
export const set = useStore.setState

/** Name of the theme in effect: the preview, if any, otherwise the configured one. */
export const selectThemeName = (s: State): string => s.themePreview ?? s.settings['workbench.theme']

/** Indentation for files with no detectable indentation (`editor.insertSpaces` / `editor.tabSize`). */
export function defaultIndent(): Indent {
  const { settings } = get()
  return fallbackIndent(settings['editor.insertSpaces'], settings['editor.tabSize'])
}

// Each entry into a folder has a number: async responses from a previous folder (session, directories) are discarded.
export const enterSeq = createLatest()

export function findFileTab(id: string): FileTab | undefined {
  return get().tabs.find((t): t is FileTab => t.id === id && t.kind === 'file')
}

/** Changes fields of a file tab without recreating the list when nothing changes. */
export function patchTab(id: string, patch: Partial<Omit<FileTab, 'id' | 'kind'>>): void {
  const tab = findFileTab(id)
  if (!tab) return
  const entries = Object.entries(patch) as [keyof FileTab, unknown][]
  if (entries.every(([key, value]) => tab[key] === value)) return
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

export function groupsState(): GroupsState {
  const { editorGroups, activeGroupId, editorLayout } = get()
  return { groups: editorGroups, activeGroupId, layout: editorLayout }
}

/**
 * Single point that writes groups: keeps `activeTabId` mirroring the active tab of the active group, the grid
 * coherent with the groups, and drops the tabs that are no longer in any group (the entity only goes away when no
 * group shows it). Without a real change, it does not notify.
 */
export function commitGroups(next: GroupsState, extra: Partial<State> = {}, tabs: Tab[] = get().tabs): void {
  const open = openTabIds(next)
  const kept = tabs.every((t) => open.has(t.id)) ? tabs : tabs.filter((t) => open.has(t.id))
  const s = get()
  const activeTabId = activeTabOf(next)
  const layout = reconcileLayout(
    next.layout,
    next.groups.map((g) => g.id)
  )
  if (
    kept === s.tabs &&
    next.groups === s.editorGroups &&
    next.activeGroupId === s.activeGroupId &&
    layout === s.editorLayout &&
    activeTabId === s.activeTabId &&
    Object.keys(extra).length === 0
  )
    return
  set({
    ...extra,
    tabs: kept,
    editorGroups: next.groups,
    activeGroupId: next.activeGroupId,
    editorLayout: layout,
    activeTabId
  })
}

/** Encoding the user chose for the open file (diff/preview reads honor it); otherwise `undefined`. */
export function forcedEncodingFor(path: string): TextEncoding | undefined {
  const tab = get().tabs.find((t): t is FileTab => t.kind === 'file' && t.path === path)
  return chosenEncoding(tab)
}

/** Network operation in progress in the current folder (`null` if it runs in another folder, already closed). */
export const selectGitOperation = (s: State): GitNetworkOp | null =>
  s.gitOperationRoot === s.root ? s.gitOperation : null

export const selectGitBusy = (s: State): boolean => s.gitBusy || selectGitOperation(s) !== null

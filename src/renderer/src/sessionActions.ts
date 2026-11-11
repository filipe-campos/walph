import type { WorkspaceSession, SessionClaudeTab } from '@shared/types'
import { buildSession } from './lib/session'
import { breakpointsToSession } from './lib/debugBreakpoints'
import { tabViewState } from './components/editor/groupViews'
import { sameSessionFields, sessionClaudeTabs } from './lib/claudeSessionTabs'
import { draftText, setDraftListener } from './claudeDrafts'
import { get, subscribeDiff, useStore, type State } from './store'
import { samePath } from './lib/path'
import { createReactionScope } from './lib/reactions'
import { shallow } from 'zustand/shallow'

const api = window.api

// Restoring the session: the state is incomplete and saving it would overwrite the stored session.
let restoring = false
const restoredListeners = new Set<() => void>()

export function setRestoring(value: boolean): void {
  restoring = value
  if (!value) for (const listener of [...restoredListeners]) listener()
}

/**
 * `true` when the view is at `root` with its session already applied (layout, tabs); `false` if it did not get there
 * within `timeoutMs`. Whoever acts on the panel of a freshly opened folder waits for this.
 */
export function workspaceReady(root: string, timeoutMs: number): Promise<boolean> {
  const ready = (): boolean => {
    const current = get().root
    return !!current && samePath(current, root, api.platform) && !restoring
  }
  if (ready()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (ok: boolean): void => {
      clearTimeout(timer)
      unsubscribe()
      restoredListeners.delete(check)
      resolve(ok)
    }
    const check = (): void => {
      if (ready()) finish(true)
    }
    const unsubscribe = useStore.subscribe(check)
    restoredListeners.add(check)
    const timer = setTimeout(() => finish(false), timeoutMs)
  })
}

function currentSession(): WorkspaceSession {
  const s = get()
  return buildSession({
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    groups: s.editorGroups,
    activeGroupIndex: s.editorGroups.findIndex((g) => g.id === s.activeGroupId),
    layout: s.editorLayout,
    viewOf: tabViewState,
    expanded: s.expanded,
    view: s.view,
    sidebarVisible: s.sidebarVisible,
    sidebarWidth: s.sidebarWidth,
    terminalVisible: s.terminalVisible,
    panelHeight: s.panelHeight,
    panelPosition: s.panelPosition,
    panelWidth: s.panelWidth,
    claudeVisible: s.claudeVisible,
    claudeWidth: s.claudeWidth,
    ...claudeTabsForSession(s.claude),
    closedTabs: s.closedTabs.map(({ tab, groupId, index }) => {
      const group = s.editorGroups.findIndex((g) => g.id === groupId)
      return { tab, group: group >= 0 ? group : null, index }
    }),
    breakpoints: breakpointsToSession(s.breakpoints),
    watches: s.debugWatches
  })
}

function claudeTabsForSession(claude: State['claude']): { claudeTabs: SessionClaudeTab[]; claudeActive?: number } {
  const { tabs, active } = sessionClaudeTabs(claude.conversations, claude.activeId, draftText)
  return { claudeTabs: tabs, ...(active !== undefined ? { claudeActive: active } : {}) }
}

let sessionTimer: ReturnType<typeof setTimeout> | null = null

export function cancelSessionSave(): void {
  if (sessionTimer) clearTimeout(sessionTimer)
  sessionTimer = null
}

/** Writes the folder session now (folder change, window close). Without a folder, or mid-restore, it does not write. */
export function flushSession(): void {
  cancelSessionSave()
  const { root } = get()
  if (root && !restoring) api.session.save(root, currentSession())
}

/** Batches the tab, cursor, scroll and layout changes into a single write. */
export function scheduleSessionSave(): void {
  if (!get().root || restoring) return
  cancelSessionSave()
  sessionTimer = setTimeout(flushSession, 400)
}

/** State fields the session stores: if any changes, it is rewritten (the Claude tabs have their own check). */
const SESSION_KEYS = [
  'tabs',
  'activeTabId',
  'editorGroups',
  'activeGroupId',
  'editorLayout',
  'cursor',
  'expanded',
  'view',
  'sidebarVisible',
  'terminalVisible',
  'sidebarWidth',
  'panelHeight',
  'panelPosition',
  'panelWidth',
  'claudeVisible',
  'claudeWidth',
  'closedTabs',
  'breakpoints',
  'debugWatches'
] as const satisfies readonly (keyof State)[]

function bindDraftSave(): void {
  // The prompt box draft goes into the session (with the normal delay).
  setDraftListener(() => scheduleSessionSave())
  // Unloading the page (window close, reload): the send is synchronous, so it reaches main before the page goes away.
  window.addEventListener('beforeunload', flushSession)
}

function unbindDraftSave(): void {
  window.removeEventListener('beforeunload', flushSession)
  setDraftListener(() => {})
}

export function startSessionReactions(): () => void {
  const scope = createReactionScope()
  scope.bindGlobal(bindDraftSave, unbindDraftSave)

  // Chats change on every streaming delta; only what the session stores (session, title, model, mode, order, active)
  // counts.
  let claudeTabsSig = ''
  function claudeTabsChanged(claude: State['claude'], prev: State['claude']): boolean {
    if (claude.activeId === prev.activeId && sameSessionFields(claude.conversations, prev.conversations)) return false
    const sig = JSON.stringify(claudeTabsForSession(claude))
    if (sig === claudeTabsSig) return false
    claudeTabsSig = sig
    return true
  }

  // Saves the session on every change it stores. The cursor comes through `cursor` and the scroll through `onScroll`.
  scope.add(useStore.subscribe((s) => SESSION_KEYS.map((key) => s[key]), scheduleSessionSave, { equalityFn: shallow }))
  scope.add(
    subscribeDiff(
      (s) => s.claude,
      (claude, prev) => {
        if (claudeTabsChanged(claude, prev)) scheduleSessionSave()
      }
    )
  )
  return scope.stop
}

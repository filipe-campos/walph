// Workspaces bar. Each workspace is its own view with the whole renderer; this view only (a) receives the
// tab list from main, (b) reports its own branch, (c) shows the notices of inactive workspaces as toasts and
// (d) closes/opens/switches workspaces through the commands. Nothing here is indexed by workspace.
import { t } from '@shared/i18n'
import type { ClaudeConversationId, WorkspaceId, WorkspaceInfo, WorkspaceNotice } from '@shared/types'
import { playNotificationSound } from './lib/notificationSound'
import { branchToReport, isNoticeStale, NOTICE_KEY_PREFIX, truncateText } from './lib/workspaces'
import { get, onRootChange, useStore } from './store'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { createReactionScope } from './lib/reactions'
import { shallow } from 'zustand/shallow'
import { dismissToastByKey, dismissToastsWhere, notify, showToast } from './toasts'
import { setWorkspaces } from './workspaceLifecycle'
const api = window.api

/** Owner (source workspace) of each notice toast, to prune the ones that no longer apply. */
const noticeOwners = new Map<string, WorkspaceId>()

function showNotice(notice: WorkspaceNotice): void {
  const { key, workspace, sessionId, signal } = notice
  // Toasts that already went away (dismissed, timed out) no longer have a registered owner.
  const live = new Set(get().toasts.map((t) => t.key))
  for (const k of noticeOwners.keys()) if (!live.has(k)) noticeOwners.delete(k)
  noticeOwners.set(key, workspace.id)
  api.notifications.requestSound()
  showToast({
    key,
    ai: true,
    tone: signal,
    title: notice.title,
    description: truncateText(notice.sessionTitle, 120) || undefined,
    origin: { name: workspace.name, branch: workspace.branch, root: workspace.root },
    actions: [{ label: t().app.workspaceBar.openWorkspace, onClick: () => activateWorkspace(workspace.id, sessionId) }],
    // Request and failure stay until someone looks; the end of turn goes away by itself.
    duration: signal === 'done' ? 8000 : undefined
  })
}

/** Removes the notice toasts whose workspace is gone, became the active one or was already read. */
function pruneNotices(): void {
  const state = get().workspaces
  if (!state) return
  dismissToastsWhere((key) => {
    if (!key.startsWith(NOTICE_KEY_PREFIX)) return false
    const owner = noticeOwners.get(key)
    if (owner === undefined) return false
    const stale = isNoticeStale(state.workspaces, owner)
    if (stale) noticeOwners.delete(key)
    return stale
  })
}

/** Binds the bar to main and reports this view's branch. Returns the unsubscribe. */
export function startWorkspaceBarReactions(): () => void {
  const scope = createReactionScope()
  let cancelled = false
  scope.add(() => {
    cancelled = true
  })
  void attempt(async () => {
    const state = await api.workspaces.list()
    if (!cancelled) setWorkspaces(state)
  })

  scope.add(
    api.workspaces.onChange((state) => {
      setWorkspaces(state)
      pruneNotices()
    })
  )
  scope.add(api.notifications.onShow(showNotice))
  scope.add(api.notifications.onPlaySound(playNotificationSound))
  scope.add(
    api.notifications.onDismiss((key) => {
      noticeOwners.delete(key)
      dismissToastByKey(key)
    })
  )

  // Branch: only reports on change, with a 150 ms slack so `null` does not flash while the restored folder loads git.
  let reported: string | null | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const reportBranch = (): void => {
    const { root, git, gitFailedRoot } = get()
    const branch = branchToReport(root, git, gitFailedRoot)
    clearTimeout(timer)
    if (branch === undefined || branch === reported) return
    timer = setTimeout(() => {
      const st = get()
      const now = branchToReport(st.root, st.git, st.gitFailedRoot)
      if (now === undefined || now === reported) return
      reported = now
      api.workspaces.reportBranch(now)
    }, 150)
  }
  scope.add(onRootChange(reportBranch))
  scope.add(useStore.subscribe((s) => [s.git, s.gitFailedRoot] as const, reportBranch, { equalityFn: shallow }))
  scope.add(() => clearTimeout(timer))
  reportBranch()

  return scope.stop
}

// ---------- Actions (commands and bar) ----------

/** Opens a folder as a new workspace (without `root`, main shows the dialog). */
export async function addWorkspace(root?: string): Promise<void> {
  await attempt(() => api.workspaces.add(root))
}

/** Closes a workspace; with unsaved files main asks (same flow as `window:closeRequested`). */
export async function closeWorkspace(id: WorkspaceId): Promise<void> {
  await attempt(() => api.workspaces.close(id))
}

export function activateWorkspace(id: WorkspaceId, reveal?: ClaudeConversationId): void {
  api.workspaces.activate(id, reveal)
}

export function moveWorkspace(id: WorkspaceId, index: number): void {
  api.workspaces.move(id, index)
}

/** Mutes/unmutes the notices of a workspace (preference stored by main). */
function setWorkspaceMuted(id: WorkspaceId, muted: boolean): void {
  try {
    api.workspaces.setMuted(id, muted)
  } catch (err) {
    notify(errorMessage(err))
  }
}

/** Native context menu of the tab (main builds it; here it only runs the choice). */
export async function showWorkspaceMenu(ws: WorkspaceInfo): Promise<void> {
  await attempt(async () => {
    const action = await api.workspaces.showContextMenu(ws.id)
    if (action === 'mute' || action === 'unmute') setWorkspaceMuted(ws.id, action === 'mute')
    else if (action === 'copyPath' && ws.root) api.fs.copyPath(ws.root)
    else if (action === 'close') await closeWorkspace(ws.id)
  })
}

/** Opens several recents at once (no `roots` = "Open all": the window's last list). Returns how many it opened. */
export async function openManyWorkspaces(roots?: string[]): Promise<number> {
  return attempt(
    async () => {
      const opened = await api.workspaces.openMany(roots)
      if (opened === 0) notify(t().app.workspaceBar.nothingNewToOpen, 'info')
      return opened
    },
    { fallback: 0 }
  )
}

/** "Start with Claude": opens `root` (or asks for the folder) and sends the prompt. `false` = nothing was sent. */
export async function startWithClaude(root: string | null, prompt: string): Promise<boolean> {
  return attempt(() => api.workspaces.openWithPrompt(root, prompt), { fallback: false })
}

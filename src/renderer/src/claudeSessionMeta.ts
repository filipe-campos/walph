// Claude session metadata: favorite, rename, duplicate, export, the folder's session list and the metadata of the
// dormant tabs.
import type { ClaudeSessionSummary } from '@shared/types'
import { t } from '@shared/i18n'
import { get } from './store'
import { attempt } from './attempt'
import { setUserTitle, type ClaudeConversation } from './lib/claudeConversation'
import { notify, showToast } from './toasts'
import {
  bridge,
  failed,
  findConversation,
  liveConversationId,
  optimisticPatch,
  patchClaude,
  updateConversation
} from './claudeState'
import { enqueueStart } from './claudeLifecycle'

// Metadata (favorite, user title) of the dormant tabs: comes from the session list, once per tab.
const metaRequested = new Set<string>()

export function resetMetaRequests(): void {
  metaRequested.clear()
}

export function hydrateDormantMeta(conversations: readonly ClaudeConversation[]): void {
  const need = conversations.filter((c) => c.dormant && c.sessionId && !metaRequested.has(c.id))
  if (need.length === 0) return
  for (const c of need) metaRequested.add(c.id)
  void bridge
    .sessions()
    .then((list) => {
      for (const c of need) {
        const info = list.find((x) => x.sessionId === c.sessionId)
        if (info)
          updateConversation(c.id, (cur) =>
            cur.dormant ? { ...cur, favorite: info.favorite, title: info.title || cur.title } : cur
          )
      }
    })
    .catch(() => {})
}

export async function loadSessions(): Promise<ClaudeSessionSummary[]> {
  return attempt(() => bridge.sessions(), { format: failed, fallback: [] })
}

/** Bar star: favorites/unfavorites the session. Optimistic; an error reverts and notifies. */
export async function toggleFavorite(id: string): Promise<void> {
  const conv = findConversation(id)
  if (!conv) return
  if (!conv.sessionId) return notify(t().claude.actions.sessionStarting, 'info')
  const { sessionId } = conv
  const favorite = !conv.favorite
  const undo = optimisticPatch(
    id,
    (c) => ({ ...c, favorite }),
    (c) => c.favorite === favorite,
    { favorite: !favorite }
  )
  await attempt(() => bridge.setSessionMeta(sessionId, { favorite }), { format: failed, onError: undo })
}

/** Starts renaming the tab (F2, double click, ⋯ menu): activates the conversation and opens the field. */
export function startRename(id: string): void {
  const conv = findConversation(id)
  if (!conv) return
  // Without `sessionId` the title would have nowhere to be saved (the field would open and the Enter would be lost).
  if (!conv.sessionId) return notify(t().claude.actions.sessionStarting, 'info')
  patchClaude({ activeId: id, renamingId: id })
}

/** "Claude: Rename Session" (F2 with focus in the panel): the active session. */
export function renameActiveClaudeSession(): void {
  const id = get().claude.activeId
  if (id) startRename(id)
}

export function stopRename(): void {
  if (get().claude.renamingId !== null) patchClaude({ renamingId: null })
}

/**
 * Confirms the tab title. Empty = back to automatic (`title: null`). The tab changes right away; if main refuses it
 * goes back to what it was and notifies.
 */
export async function renameConversation(id: string, raw: string): Promise<void> {
  const conv = findConversation(id)
  stopRename()
  if (!conv) return
  const title = raw.trim() || null
  // Dormant tab: the shown title may be the user's (we don't know), so clearing it must be able to go back to
  // automatic.
  if (title === conv.userTitle && !(conv.dormant && title === null)) return
  if (!conv.sessionId) return notify(t().claude.actions.sessionStarting, 'info')
  const { sessionId } = conv
  const before = { userTitle: conv.userTitle, title: conv.title }
  const undo = optimisticPatch(
    id,
    (c) => setUserTitle(c, title),
    (c) => c.userTitle === title,
    before
  )
  const saved = await attempt(
    async () => {
      await bridge.setSessionMeta(sessionId, { title })
      return true
    },
    { format: failed, fallback: false, onError: undo }
  )
  if (!saved) return
  // Back to automatic but the CLI `title` has not reached this conversation yet (e.g. resumed): asks the history.
  if (title === null && (findConversation(id)?.autoTitle === null || conv.dormant)) {
    const summary = (await loadSessions()).find((s) => s.sessionId === sessionId)
    if (summary?.title)
      updateConversation(id, (c) =>
        c.userTitle === null ? { ...c, title: summary.title, autoTitle: summary.title } : c
      )
  }
}

/** "Duplicate": main forks the transcript and the copy opens like any resumed session (new tab). */
export async function duplicateConversation(id: string): Promise<void> {
  const conv = findConversation(id)
  if (!conv) return
  const live = liveConversationId(id)
  if (!live) return notify(t().claude.actions.waitResume, 'info')
  await attempt(
    async () => {
      const sessionId = await bridge.fork(live)
      const opened = await enqueueStart({
        resume: sessionId,
        permissionMode: conv.permissionMode,
        ...(conv.effort && { effort: conv.effort })
      })
      if (!opened) notify(t().claude.actions.forkNotOpened, 'info')
    },
    { format: failed }
  )
}

/** "Export conversation (.md)": main opens the save dialog; `null` = cancelled. */
export async function exportConversation(id: string): Promise<void> {
  const conv = findConversation(id)
  if (!conv) return
  const live = liveConversationId(id)
  if (!live) return notify(t().claude.actions.waitResume, 'info')
  await attempt(
    async () => {
      const path = await bridge.exportMarkdown(live)
      if (path)
        showToast({
          tone: 'done',
          title: t().claude.actions.toasts.conversationExported,
          description: path,
          duration: 6000
        })
    },
    { format: failed }
  )
}

// The Claude conversations of each view (webContents) and everything aggregated over them: editor context, allowed
// attachments, session events, badge and the lifecycle (folder changed, settings, hibernation). `ipc/claude.ts` talks
// to the renderer; there is no channel here.

import { t } from '@shared/i18n'
import { app, type WebContents } from 'electron'
import type { ClaudeAgentStatus, ClaudeConversationId, ClaudeEditorContext, ClaudeStarted } from '@shared/types'
import { createEmitter } from '../util/emitter'
import { registerEvictionGuard } from '../window/evictionGuards'
import { onViewReset } from '../window/viewLifecycle'
import { createViewRegistry } from '../window/viewResources'
import { onWindowRootChange, workspaceOf } from '../window/windows'
import { onSettingsChange } from '../settings/state'
import { createViewPathAllowlist } from '../window/viewPathAllowlist'
import type { PathCheck } from '../fs/pathAllowlist'
import type { ClaudeConversation } from './conversation/conversation'
import { closeSessionNotification } from './notify'
import type { SessionSignal } from './sessionStatus'
import { UserError } from '../errors'

/** Change in a conversation of a view, for whoever aggregates per workspace (workspace bar, notices). */
export type ClaudeSessionEvent =
  | {
      type: 'change'
      wc: WebContents
      id: ClaudeConversationId
      status: ClaudeAgentStatus
      previous: ClaudeAgentStatus
      unread: number
      notify: SessionSignal | null
      question: boolean
      sessionTitle: string
    }
  | { type: 'removed'; wc: WebContents; id: ClaudeConversationId }

const sessionEvents = createEmitter<[ClaudeSessionEvent]>('claude')

export const onClaudeSessionEvent = sessionEvents.on

export const emitSession = sessionEvents.emit

// Conversations belong to the view (webContents) that created them: only it controls them and they die with it.
// Reload, renderer crash or close end them all (without this the Claude processes would be orphaned).
const conversations = createViewRegistry<ClaudeConversation>({
  key: 'claude:conversations',
  dispose: (conversation, { wc }) => {
    retire(wc, conversation)
    return conversation.close()
  }
})
const editorContexts = new WeakMap<WebContents, ClaudeEditorContext>()
/** Files outside the folder allowed for attaching (main dialog or confirmation), per view and for a few minutes. */
const attachmentAllowlist = createViewPathAllowlist('claude:attachments', { ttlMs: 10 * 60 * 1000, pinFile: true })
const EMPTY_CONTEXT: ClaudeEditorContext = { activeFile: null, selection: null, openFiles: [] }

export function editorContextOf(wc: WebContents): ClaudeEditorContext {
  return editorContexts.get(wc) ?? EMPTY_CONTEXT
}

export function setEditorContext(wc: WebContents, context: ClaudeEditorContext): void {
  editorContexts.set(wc, context)
}

/** Allows a file outside the folder to be attached; renderer reload/crash clears the list even with no conversation. */
export function allowAttachment(wc: WebContents, path: string): Promise<void> {
  watchViewContext(wc)
  return attachmentAllowlist.allow(wc, path)
}

export function verifyAttachment(wc: WebContents, path: string): Promise<PathCheck> {
  return attachmentAllowlist.verify(wc, path)
}

/** Folder changed, reload or window closed: the editor context and attachment grants applied to the previous one. */
function clearViewContext(wc: WebContents): void {
  editorContexts.delete(wc)
  attachmentAllowlist.clear(wc)
}

// The view reset also clears what is not a conversation; the conversations leave through the registry itself.
function watchViewContext(wc: WebContents): void {
  onViewReset(wc, 'claude:context', () => {
    clearViewContext(wc)
    updateBadge()
  })
}

export function conversationsOf(wc: WebContents): ClaudeConversation[] {
  return conversations.values(wc)
}

export function findConversation(wc: WebContents, id: unknown): ClaudeConversation | undefined {
  return typeof id === 'string' ? conversations.get(wc, id) : undefined
}

/** The view's conversation `id`, or a translated error (unknown id or from another view). */
export function ownedConversation(wc: WebContents, id: unknown): ClaudeConversation {
  const conversation = findConversation(wc, id)
  if (!conversation) throw new UserError(t().claudeHost.conversation.notFound)
  return conversation
}

/** Status and unread count of each conversation of the view (input of the workspace aggregate). */
export function sessionStatesOf(wc: WebContents): Array<{ status: ClaudeAgentStatus; unread: number }> {
  return conversations.values(wc).map((c) => ({ status: c.agentStatus, unread: c.unread }))
}

/** Activating the workspace: the user sees all its sessions (resets `unread`, `done` turns `idle`, closes notices). */
export function markAllRead(wc: WebContents): void {
  for (const c of conversations.values(wc)) {
    c.markRead()
    closeSessionNotification(wc, c.id)
  }
}

/** The renderer is seeing the session. A hidden view does not "see" anything: the workspace activation reads it. */
export function markConversationRead(wc: WebContents, id: string): void {
  const ws = workspaceOf(wc)
  if (ws && ws.host.activeId !== ws.id) return
  conversations.get(wc, id)?.markRead()
  closeSessionNotification(wc, id)
}

/** App badge = total unread of the conversations of every window (macOS/Linux; Windows does not have the API). */
export function updateBadge(): void {
  if (process.platform === 'win32') return
  let total = 0
  for (const [wc, c] of conversations.entries()) {
    // A muted workspace does not count in the badge (the tab still shows the unread count).
    if (workspaceOf(wc)?.muted) continue
    total += c.unread
  }
  try {
    app.setBadgeCount(total)
  } catch {
    // Linux without Unity/a compatible launcher: the badge is just an extra.
  }
}

/** The conversation left the view: closes the OS notice, updates the badge and tells the per-workspace aggregators. */
function retire(wc: WebContents, conversation: ClaudeConversation): void {
  closeSessionNotification(wc, conversation.id)
  updateBadge()
  emitSession({ type: 'removed', wc, id: conversation.id })
}

/**
 * Removes the conversation from the view and ends it. The removal is announced only once: if the folder changed or the
 * window reloaded, the registry already removed it (and emitted `removed`), so here we only wait for it to end.
 */
export async function removeConversation(wc: WebContents, conversation: ClaudeConversation): Promise<void> {
  if (conversations.delete(wc, conversation.id, conversation)) retire(wc, conversation)
  await conversation.close()
}

/** Registers the conversation in the view and starts it; any failure (or the view changing midway) removes it again. */
export async function startConversation(wc: WebContents, conversation: ClaudeConversation): Promise<ClaudeStarted> {
  watchViewContext(wc)
  conversations.add(wc, conversation.id, conversation)
  try {
    const started = await conversation.start()
    // The folder changed or the window reloaded while starting: the conversation was already ended.
    if (conversations.get(wc, conversation.id) !== conversation) {
      throw new UserError(t().claudeHost.conversation.folderChangedCancelled)
    }
    return started
  } catch (err) {
    await removeConversation(wc, conversation)
    throw err
  }
}

/** Ends (and waits for) every conversation of a window. */
function closeAllOf(wc: WebContents): Promise<void> {
  clearViewContext(wc)
  const closing = conversations.disposeAll(wc)
  updateBadge()
  return closing
}

/** Restarts the idle conversations of the view (new credentials); returns how many restarted. */
export async function restartAllOf(wc: WebContents): Promise<number> {
  const results = await Promise.all(conversations.values(wc).map((c) => c.restartForAuth().catch(() => false)))
  return results.filter(Boolean).length
}

/** `will-quit`: ends the views' conversations; the SDK and helper CLI processes die in `killAllSpawnedGroups`. */
export function killAllClaude(): void {
  conversations.disposeAllSync()
}

export function registerClaudeLifecycle(): void {
  // Hibernating ends the view's conversations: not with a running turn, pending request (`attention`) or unread result.
  registerEvictionGuard('claude', (wc) => {
    if (sessionStatesOf(wc).some((s) => s.status === 'running' || s.status === 'attention' || s.unread > 0))
      return 'claudeBusy'
    // Pending `/loop`/cron: hibernating the view would end the CLI and the schedule with it.
    if (conversations.values(wc).some((c) => c.hasScheduledWork)) return 'claudeScheduled'
    return null
  })
  // Changing the window folder ends its conversations (their `cwd` no longer applies).
  onWindowRootChange((wc) => void closeAllOf(wc))
  // Bypass turned off in the settings with a conversation in that mode: it goes back to `default`.
  onSettingsChange((wc) => {
    for (const c of conversations.values(wc)) void c.onSettingsChanged()
  })
}

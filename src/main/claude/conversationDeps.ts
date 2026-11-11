import type { WebContents } from 'electron'
import type { ClaudeConversationId, ClaudeEvent } from '@shared/types'
import { send } from '../window/send'
import { requestNotificationSound } from '../notifications/sound'
import { getEffectiveSettings } from '../settings/state'
import { getWindowRoot, workspaceOf } from '../window/windows'
import { CommandFileReader } from './commandFiles'
import type { ConversationDeps } from './conversation/deps'
import type { FileDiagnostics } from './ideFormat'
import { closeSessionNotification, notifySession } from './notify'
import { editorContextOf, emitSession, updateBadge, verifyAttachment } from './registry'
import { claudeRuntime } from './runtime'
import { loadSdk } from './sdk'
import { sessionMeta } from './stores'

const commandReader = new CommandFileReader()

type SessionChange = Parameters<NonNullable<ConversationDeps['onSessionChange']>>[0]

/** A conversation's status/unread changed: workspace aggregate, badge and system notice (with sound, if enabled). */
function handleSessionChange(
  wc: WebContents,
  id: ClaudeConversationId,
  sessionTitle: string,
  change: SessionChange
): void {
  const { notify, previous, status, unread, question } = change
  updateBadge()
  emitSession({ type: 'change', wc, id, status, previous, unread, notify, question, sessionTitle })
  // Request answered/cancelled without a new signal: the system notice became stale.
  if (previous === 'attention' && status !== 'attention' && !notify) closeSessionNotification(wc, id)
  if (!notify || workspaceOf(wc)?.muted) return
  const settings = getEffectiveSettings(wc)
  const sound = settings['claude.notifications.sound']
  // With the app sound enabled the notification is silent (otherwise both would play).
  const shown = notifySession(wc, id, notify, sessionTitle, settings['claude.notifications.system'], question, sound)
  if (shown) requestNotificationSound(wc)
}

/**
 * Everything the conversation asks of its owning view (folder, settings, attachments, events, notices).
 * `getDiagnostics` comes from whoever knows the view's LSP: this module does not depend on it.
 */
export function createConversationDeps(
  wc: WebContents,
  id: ClaudeConversationId,
  sessionTitle: () => string,
  getDiagnostics: (path?: string) => FileDiagnostics[]
): ConversationDeps {
  const runtime = claudeRuntime()
  return {
    loadSdk,
    loginPath: runtime.loginPath,
    runCli: runtime.runCli,
    openExternal: runtime.openExternal,
    getRoot: () => getWindowRoot(wc),
    loadSessionMeta: async (sessionId) => {
      const root = getWindowRoot(wc)
      return (root ? (await sessionMeta().load(root)).get(sessionId) : undefined) ?? { favorite: false }
    },
    getSettings: () => getEffectiveSettings(wc),
    verifyAttachment: (path) => verifyAttachment(wc, path),
    readCommandFiles: (root) => commandReader.read(root),
    getEditorContext: () => editorContextOf(wc),
    getDiagnostics,
    emit: (event: ClaudeEvent) => send(wc, 'claude:event', event),
    onSessionChange: (change) => handleSessionChange(wc, id, sessionTitle(), change),
    // A failed conversation stays in the map (closed) until the renderer calls `claude:close`: that way `markRead`
    // still resets its counter and the badge stays consistent.
    onClosed: updateBadge,
    // Rewinding to the start creates another session: favorite and title follow the conversation.
    onSessionIdChange: (from, to) => {
      const root = getWindowRoot(wc)
      if (root)
        void sessionMeta()
          .copy(root, from, to)
          .catch(() => undefined)
    }
  }
}

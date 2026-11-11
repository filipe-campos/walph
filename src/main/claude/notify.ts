// OS notification when a Claude session finishes, asks for something or fails while the window is unfocused.
// Short text with no conversation content; the session title comes from Claude (untrusted) and is treated as plain
// text.

import { Notification, type WebContents } from 'electron'
import type { ClaudeConversationId } from '@shared/types'
import { windowIcon } from '../window/appIcon'
import { hiddenWindows } from '../window/hiddenMode'
import { revealSession } from '../window/windows'
import { windowOf } from '../window/workspaceViews'
import { notificationContent, type SessionSignal } from './sessionStatus'

// Electron does not hold the reference: without this the GC drops the object and the click stops working.
const live = new Map<string, Notification>()

const keyOf = (wc: WebContents, id: ClaudeConversationId): string => `${wc.id}:${id}`

/** Closes the session notice (read, closed or replaced by another). */
export function closeSessionNotification(wc: WebContents, id: ClaudeConversationId): void {
  const key = keyOf(wc, id)
  const existing = live.get(key)
  if (!existing) return
  live.delete(key)
  existing.close()
}

/** Closes the already shown notices of every session of the view (when muting the workspace). */
export function closeNotificationsOf(wc: WebContents): void {
  const prefix = `${wc.id}:`
  for (const [key, notification] of [...live]) {
    if (!key.startsWith(prefix)) continue
    live.delete(key)
    notification.close()
  }
}

/** Shows the OS notification; `true` = shown. `silent`: the app plays its own sound (`claude.notifications.sound`). */
export function notifySession(
  wc: WebContents,
  id: ClaudeConversationId,
  signal: SessionSignal,
  sessionTitle: string,
  enabled: boolean,
  question = false,
  silent = false
): boolean {
  if (!enabled || !Notification.isSupported() || wc.isDestroyed()) return false
  const win = windowOf(wc)
  // With the window focused, the renderer toast (or the workspace bar one) is enough.
  if (!win || win.isDestroyed() || win.isFocused()) return false

  closeSessionNotification(wc, id)
  const notification = new Notification({
    ...notificationContent(signal, sessionTitle, question),
    silent: silent || hiddenWindows,
    ...(windowIcon ? { icon: windowIcon } : {})
  })
  const key = keyOf(wc, id)
  const release = (): void => {
    if (live.get(key) === notification) live.delete(key)
  }
  notification.on('click', () => {
    release()
    if (win.isDestroyed() || wc.isDestroyed()) return
    // Activates the source workspace (and focuses its window) and only then asks to show the session.
    revealSession(wc, id)
  })
  notification.on('close', release)
  notification.on('failed', release)
  live.set(key, notification)
  notification.show()
  return true
}

// When a Claude session is being seen (active tab + panel + focused window + active workspace), the "read" it triggers
// and the finished, failure and model switch toasts.
import type { ClaudeEvent } from '@shared/types'
import { t } from '@shared/i18n'
import { get, set } from './store'
import { dismissToastByKey, showToast } from './toasts'
import { turnChangedFiles, turnToastDescription } from './lib/claudeTurnSummary'
import { focusPrompt } from './claudePromptBridge'
import { hasFocus } from './focusBridge'
import { bridge, findConversation, liveConversationId } from './claudeState'

const api = window.api

/** The OS focus is in this window (`focus`/`blur` events; E2E tests with a hidden window never have it). */
let windowFocused = typeof document !== 'undefined' && document.hasFocus()
/** `unread` for which we already requested `markRead` (main replies with `sessionStatus`; do not repeat until then). */
const readRequested = new Map<string, number>()

/** The session is the active tab of a visible panel (regardless of window focus). */
export function isShown(id: string): boolean {
  const s = get()
  // On the Containers screen the panel is hidden (display: none): the session is not being seen.
  return s.claudeVisible && s.screen === 'workbench' && s.claude.activeId === id
}

/** This view is the window's visible workspace; a hidden view does not show its own toasts. */
export function viewActive(): boolean {
  return get().viewActive
}

/** The session is being seen: active tab + visible panel + focused window + this workspace active. */
export function isVisible(id: string): boolean {
  return windowFocused && viewActive() && isShown(id)
}

/**
 * Visible session with unread items: tells main (resets `unread`, `done` becomes `idle`) and removes its
 * finished/failure toasts.
 */
export function syncRead(): void {
  const id = get().claude.activeId
  if (!id || !isVisible(id)) return
  const conv = findConversation(id)
  if (!conv) return
  if (conv.unread === 0) {
    readRequested.delete(id)
    return
  }
  dismissToastByKey(sessionToastKey(id, 'done'))
  dismissToastByKey(sessionToastKey(id, 'error'))
  if (readRequested.get(id) === conv.unread) return
  readRequested.set(id, conv.unread)
  const live = liveConversationId(id)
  if (live) bridge.markRead(live)
}

export const toastPrefix = (id: string): string => `claude:${id}:`
export const sessionToastKey = (id: string, kind: 'done' | 'error'): string => `${toastPrefix(id)}${kind}`
export const permissionToastKey = (id: string, requestId: string): string => `${toastPrefix(id)}permission:${requestId}`

/** `claude.notifications.toast`: `all` = everything, `attention` = only requests and failures, `off` = none. */
export function toastAllowed(tone: 'done' | 'attention' | 'error'): boolean {
  const mode = get().settings['claude.notifications.toast']
  return mode === 'all' || (mode === 'attention' && tone !== 'done')
}

/** Is the focus inside the Claude panel (typing or reading a session)? */
export function panelHasFocus(): boolean {
  return get().claudeVisible && hasFocus('claudePanel')
}

/** Shows the session: visible panel and active tab (without moving the focus from where it is). */
export function revealConversation(id: string): void {
  if (!findConversation(id)) return
  set((s) => ({ claudeVisible: true, claude: { ...s.claude, activeId: id } }))
}

/** "Open session": shows the session and focuses the prompt box. */
export function openClaudeSession(id: string): void {
  revealConversation(id)
  focusPrompt()
}

/** Finished (`done`) or failure (`error`) toast of a session the user is not seeing; one per session and kind. */
export function showSessionToast(id: string, kind: 'done' | 'error'): void {
  const conv = findConversation(id)
  // Hidden view: main notifies, in the active view (`notifications:show`).
  if (!conv || !viewActive() || !toastAllowed(kind)) return
  api.notifications.requestSound()
  const open = { label: t().claude.actions.openSession, onClick: () => openClaudeSession(id) }
  if (kind === 'done') {
    showToast({
      key: sessionToastKey(id, 'done'),
      ai: true,
      tone: 'done',
      title: t().claude.actions.toasts.done,
      description: turnToastDescription(conv.title, turnChangedFiles(conv.messages).length),
      actions: [open],
      duration: 8000
    })
  } else {
    showToast({
      key: sessionToastKey(id, 'error'),
      ai: true,
      tone: 'error',
      title: t().claude.actions.toasts.failed,
      description: conv.error?.message ?? t().claude.actions.toasts.turnFailed(conv.title),
      actions: [open]
    })
  }
}

/** The model refused and the turn was redone with another one. Model names come from the CLI: plain text. */
export function showModelFallbackToast(event: Extract<ClaudeEvent, { type: 'modelFallback' }>): void {
  // Hidden view: the notice has nobody to show to (and the active view's toast belongs to another folder).
  if (!viewActive()) return
  showToast({
    key: `${toastPrefix(event.id)}fallback`,
    tone: 'attention',
    ai: true,
    duration: 10000,
    title:
      event.scope === 'session'
        ? t().claude.actions.toasts.sessionFallback(event.from, event.to)
        : t().claude.actions.toasts.subagentFallback(event.from, event.to)
  })
}

export function forgetReadRequest(id: string): void {
  readRequested.delete(id)
}

export function resetReadRequests(): void {
  readRequested.clear()
}

/** Window with/without focus: only a foreground window "sees" the session. Returns the teardown. */
export function watchWindowFocus(): () => void {
  const onFocus = (): void => {
    windowFocused = true
    syncRead()
  }
  const onBlur = (): void => {
    windowFocused = false
  }
  windowFocused = document.hasFocus()
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  syncRead()
  return () => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
  }
}

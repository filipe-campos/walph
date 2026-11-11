// Events from main to the Claude panel: batches the `delta`s per frame and applies each event to the conversation with
// its effects (edit diffs, toasts, "read").
import type { ClaudeEvent } from '@shared/types'
import { t } from '@shared/i18n'
import { get } from './store'
import { notify, showToast, dismissToastByKey, dismissToastsWhere } from './toasts'
import { reduceEvent } from './lib/claudeReducer'
import { createAgentTimes, recordAgentTimes } from './lib/claudeAgents'
import { asLiveId } from './lib/claudeIds'
import { bridge, findConversation, updateConversation } from './claudeState'
import { earlyEvents, startQueue } from './claudeQueue'
import {
  isShown,
  isVisible,
  panelHasFocus,
  permissionToastKey,
  revealConversation,
  sessionToastKey,
  showModelFallbackToast,
  showSessionToast,
  syncRead,
  toastPrefix
} from './claudeVisibility'
import {
  cardHasFocus,
  closeProposalTabs,
  markPermissionCancelled,
  openProposalDiff,
  refocusAfterCard,
  showAttentionToast
} from './claudePermissions'

/** Times (first seen) of subagent calls and results: they feed the "Agents" strip. */
export const agentTimes = createAgentTimes()

// `delta` arrives dozens of times per second: batches per block and applies once per frame (each application re-renders
// the panel and reprocesses the markdown). Any other event flushes first, to keep the order.
const pendingDeltas = new Map<string, Extract<ClaudeEvent, { type: 'delta' }>>()
let deltaFrame = 0

function flushDeltas(): void {
  if (deltaFrame) cancelAnimationFrame(deltaFrame)
  deltaFrame = 0
  const batch = [...pendingDeltas.values()]
  pendingDeltas.clear()
  for (const delta of batch) processEvent(delta)
}

export function handleEvent(event: ClaudeEvent): void {
  if (event.type !== 'delta') {
    flushDeltas()
    return processEvent(event)
  }
  const key = `${event.id}|${event.index}|${event.kind}`
  const queued = pendingDeltas.get(key)
  pendingDeltas.set(key, queued ? { ...queued, text: queued.text + event.text } : event)
  if (!deltaFrame) deltaFrame = requestAnimationFrame(flushDeltas)
}

function processEvent(event: ClaudeEvent): void {
  if (!findConversation(event.id)) {
    if (startQueue.busy) earlyEvents.set(event.id, [...(earlyEvents.get(event.id) ?? []), event])
    return
  }
  applyEvent(event)
}

export function applyEvent(event: ClaudeEvent): void {
  const before = findConversation(event.id)
  const cardFocused = event.type === 'permissionCancelled' && cardHasFocus(event.requestId)
  if (event.type === 'permissionCancelled') markPermissionCancelled(event.requestId)
  // The time is when the renderer sees the agent call/result (the message does not carry one).
  if (event.type === 'message') recordAgentTimes(agentTimes, event.message, Date.now())
  updateConversation(event.id, (conv) => reduceEvent(conv, event))
  switch (event.type) {
    case 'permission':
      // Whoever is looking at the session gets the edit diff; the others only get a dot, counter and toast (never
      // steals focus). Toasts off: without the notice the request would have no signal; reveals the session (without
      // focusing the prompt). Focus inside the panel (typing in another session): does not switch the tab; its dot and
      // counter tell.
      if (!isVisible(event.id) && get().settings['claude.notifications.toast'] === 'off' && !panelHasFocus())
        revealConversation(event.id)
      if (isShown(event.id) && event.request.kind === 'edit') openProposalDiff(event.id, event.request)
      if (!isVisible(event.id)) showAttentionToast(event.id, event.request)
      break
    case 'permissionCancelled':
      refocusAfterCard(cardFocused)
      void closeProposalTabs((p) => p.requestId === event.requestId)
      dismissToastByKey(permissionToastKey(event.id, event.requestId))
      break
    case 'result':
      // Without the usage in the result, asks main (the panel shows the context anyway).
      if (!event.context)
        void bridge
          .contextUsage(asLiveId(event.id))
          .then((context) => context && updateConversation(event.id, (c) => ({ ...c, context })))
          .catch(() => {})
      break
    case 'error':
      // Without login the panel explains and offers the terminal; other errors become a notice (session toast, if not
      // seen).
      if (isVisible(event.id)) {
        if (event.error.code !== 'auth') notify(t().claude.actions.failed(event.error.message))
      } else showSessionToast(event.id, 'error')
      break
    case 'notice':
      // Notice from main (not a failure): `attention` tone.
      showToast({ tone: 'attention', title: t().claude.actions.failed(event.message), duration: 8000, ai: true })
      break
    case 'status':
      if (event.status === 'closed') {
        void closeProposalTabs((p) => p.conversationId === event.id)
        dismissToastsWhere((k) => k.startsWith(`${toastPrefix(event.id)}permission:`))
      }
      break
    case 'sessionStatus':
      // Read elsewhere (e.g. activating the workspace): the finished notice no longer applies.
      if (before && before.unread > 0 && event.unread === 0) dismissToastByKey(sessionToastKey(event.id, 'done'))
      if (before && before.agentStatus !== event.status) {
        if (event.status === 'done' || event.status === 'error') {
          if (!isVisible(event.id)) showSessionToast(event.id, event.status)
        }
      }
      syncRead()
      break
    case 'reveal':
      revealConversation(event.id)
      break
    case 'modelFallback':
      showModelFallbackToast(event)
      break
    default:
      break
  }
}

export function resetDeltas(): void {
  if (deltaFrame) cancelAnimationFrame(deltaFrame)
  deltaFrame = 0
  pendingDeltas.clear()
}

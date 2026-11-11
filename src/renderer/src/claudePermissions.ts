// Claude permission requests (tool, plan, question, elicitation, edit): answer, accepting and rejecting edits, the
// proposal diff tabs and the pending request toast.
import type { ClaudePermissionRequest, ClaudePermissionResponse } from '@shared/types'
import { t } from '@shared/i18n'
import { get } from './store'
import type { DiffTab, Tab } from './types/tabs'
import { attempt } from './attempt'
import { removePermission } from './lib/claudeConversation'
import { reduceEvent } from './lib/claudeReducer'
import { turnChangedFiles, turnToastDescription } from './lib/claudeTurnSummary'
import { dismissToastByKey, notify, showToast } from './toasts'
import { reloadFromDisk } from './diskSync'
import { confirmAndSave } from './saveActions'
import { closeTabs, showTabInActiveGroup } from './tabActions'
import { focusEditor } from './components/editor/editorFocus'
import { focusPrompt } from './claudePromptBridge'
import { focusRegion, hasFocus } from './focusBridge'
import { bridge, findConversation, liveConversationId, updateConversation } from './claudeState'
import {
  isShown,
  isVisible,
  openClaudeSession,
  permissionToastKey,
  revealConversation,
  toastAllowed,
  viewActive
} from './claudeVisibility'

const api = window.api

/** "Review": shows the session and the pending request (edit = its diff tab). */
function reviewPermission(id: string, requestId: string): void {
  revealConversation(id)
  const request = findRequest(id, requestId)
  if (request?.kind === 'edit') openProposalDiff(id, request)
}

function attentionTitle(request: ClaudePermissionRequest): string {
  if (request.kind === 'question') return t().claude.actions.toasts.question
  if (request.kind === 'elicitation') return t().claude.actions.toasts.mcpNeedsYou
  return t().claude.actions.toasts.needsYou
}

/** Pending request toast, tied to the `requestId`: goes away when the request is answered or cancelled. */
export function showAttentionToast(id: string, request: ClaudePermissionRequest): void {
  const conv = findConversation(id)
  if (!conv || !viewActive() || !toastAllowed('attention')) return
  api.notifications.requestSound()
  showToast({
    key: permissionToastKey(id, request.requestId),
    ai: true,
    tone: 'attention',
    title: attentionTitle(request),
    description: turnToastDescription(conv.title, turnChangedFiles(conv.messages).length),
    actions: [
      { label: t().claude.actions.openSession, onClick: () => openClaudeSession(id) },
      { label: t().claude.actions.review, onClick: () => reviewPermission(id, request.requestId) }
    ]
  })
}

function findRequest(id: string, requestId: string): ClaudePermissionRequest | undefined {
  return findConversation(id)?.permissions.find((p) => p.requestId === requestId)
}

/**
 * Is the focus on THIS request's card? (it leaves the DOM without `focusout`: `claudeFocus` would be stuck in main.)
 * Only its own: another session's request going away does not take the focus from the card in use.
 */
export const cardHasFocus = (requestId: string): boolean => hasFocus(`claudeCard:${requestId}`)

/** Returns the focus to the prompt after the card that had it left the DOM. */
export function refocusAfterCard(hadFocus: boolean): void {
  if (hadFocus) requestAnimationFrame(focusPrompt)
}

/**
 * Requests with an answer in flight: `cancelled` marks the `permissionCancelled` that arrived before the ack (the
 * request does not come back and the late ack is ignored). Also prevents sending the same request twice.
 */
const responding = new Map<string, { cancelled: boolean }>()

/**
 * Did main accept the answer? A refusal (`false`) or an IPC failure count the same: the request stays pending in main.
 */
async function sendResponse(id: string, requestId: string, response: ClaudePermissionResponse): Promise<boolean> {
  const live = liveConversationId(id)
  if (!live) return false
  return attempt(() => bridge.respond(live, requestId, response), { quiet: true, fallback: false })
}

/**
 * Answers a request. Questions only leave the panel after the ack (a refusal keeps the card and the draft); the other
 * kinds go away right away and come back if main refuses. Resolves `true` if the answer was accepted.
 */
export async function respondPermission(
  id: string,
  requestId: string,
  response: ClaudePermissionResponse
): Promise<boolean> {
  const request = findRequest(id, requestId)
  if (!request || responding.has(requestId)) return false
  const cardFocused = cardHasFocus(requestId)
  const flight = { cancelled: false }
  responding.set(requestId, flight)
  try {
    // Questions and MCP server requests have typed fields: they only leave the panel after the ack.
    if (request.kind === 'question' || request.kind === 'elicitation') {
      const ok = await sendResponse(id, requestId, response)
      // Cancelled midway (the card already left through `permissionCancelled`) or session closed (`true` means "request
      // gone").
      if (flight.cancelled || !findConversation(id)) return ok
      if (!ok) {
        notify(t().claude.actions.answerRefused)
        return false
      }
      dismissToastByKey(permissionToastKey(id, requestId))
      // The card stayed mounted until the ack: the focus NOW decides (the user may have gone to the editor meanwhile).
      const focused = cardHasFocus(requestId)
      updateConversation(id, (c) => removePermission(c, requestId))
      refocusAfterCard(focused)
      return true
    }

    dismissToastByKey(permissionToastKey(id, requestId))
    updateConversation(id, (c) => removePermission(c, requestId))
    // The diff goes away and takes the focus with it (display: none, no focusout): returns it to the editor after the
    // tab closes.
    refocusAfterCard(cardFocused)
    const hadFocus = hasFocus('diffEditor')
    const closing = closeProposalTabs((p) => p.requestId === requestId)
    if (hadFocus) void closing.then(() => requestAnimationFrame(focusEditor))

    // Approving the plan changes the execution mode: main reports it (`permissionMode`); writing it here would be wrong
    // when the request was cancelled midway (the `true` ack also means "request gone").
    const ok = await sendResponse(id, requestId, response)
    if (ok) return true
    if (flight.cancelled || !findConversation(id)) return false
    // Refused: the request is still in main, so it goes back to the panel (no orphan request).
    updateConversation(id, (c) => reduceEvent(c, { type: 'permission', id, request }))
    if (isShown(id) && request.kind === 'edit') {
      openProposalDiff(id, request)
      // The focus was on the diff: goes back to it (the `focusEditor` scheduled above would target the hidden editor).
      if (hadFocus) requestAnimationFrame(() => focusRegion('diffEditor'))
    }
    if (!isVisible(id)) showAttentionToast(id, request)
    notify(t().claude.actions.answerRefused)
    return false
  } finally {
    responding.delete(requestId)
  }
}

/** Edits being accepted right now (a double click does not answer or ask twice). */
const accepting = new Set<string>()

/** Accepting an edit: a file with a dirty tab asks first (the CLI writes to disk, never to the buffer). */
export async function acceptEdit(id: string, requestId: string): Promise<void> {
  if (accepting.has(requestId)) return
  const request = findRequest(id, requestId)
  if (request?.kind !== 'edit') return
  accepting.add(requestId)
  try {
    const dirtyTab = get().tabs.find((t) => t.kind === 'file' && t.path === request.path && t.dirty)
    if (dirtyTab) {
      if (!(await confirmAndSave([dirtyTab.id]))) return
      // Each `await` below is a window for the request to be cancelled/answered.
      if (!findRequest(id, requestId)) return
      // "Don't Save": discards the buffer (back to disk) so the clean tab reloads with the edit through the watcher.
      if (get().tabs.some((t) => t.id === dirtyTab.id && t.kind === 'file' && t.dirty)) {
        await reloadFromDisk(dirtyTab.id)
        if (!findRequest(id, requestId)) return
      }
    }
    // The diff was computed over the previous disk content: a save (including auto save) or something else may have
    // changed it.
    const matches = await diskMatches(request.path, request.original)
    if (!findRequest(id, requestId)) return
    if (!matches) {
      notify(t().claude.actions.fileChangedOnDisk, 'info')
      void respondPermission(id, requestId, {
        behavior: 'deny',
        message: 'The user saved changes to this file; read it again before proposing the edit.'
      })
      return
    }
    void respondPermission(id, requestId, { behavior: 'allow' })
  } finally {
    accepting.delete(requestId)
  }
}

/** Does the disk still have `expected` (normalized EOL; a missing file counts as empty)? A read failure = no. */
async function diskMatches(path: string, expected: string): Promise<boolean> {
  const normalize = (text: string): string => text.replace(/\r\n?/g, '\n')
  return attempt(
    async () => {
      const exists = await api.fs.exists(path)
      const text = exists ? await api.fs.readFile(path) : ''
      return normalize(text) === normalize(expected)
    },
    { quiet: true, fallback: false }
  )
}

export function rejectEdit(id: string, requestId: string, reason: string): void {
  const message = reason.trim()
  void respondPermission(id, requestId, message ? { behavior: 'deny', message } : { behavior: 'deny' })
}

// ---------- Edit diffs ----------

type Proposal = NonNullable<DiffTab['proposal']>

export function openProposalDiff(
  conversationId: string,
  request: Extract<ClaudePermissionRequest, { kind: 'edit' }>
): void {
  const tab: Tab = get().tabs.find((t) => t.kind === 'diff' && t.proposal?.requestId === request.requestId) ?? {
    id: crypto.randomUUID(),
    kind: 'diff',
    path: request.path,
    staged: false,
    proposal: { conversationId, requestId: request.requestId }
  }
  showTabInActiveGroup(tab)
}

export function closeProposalTabs(match: (proposal: Proposal) => boolean): Promise<void> {
  const ids = get()
    .tabs.filter((t) => t.kind === 'diff' && t.proposal && match(t.proposal))
    .map((t) => t.id)
  return ids.length > 0 ? closeTabs(ids) : Promise.resolve()
}

/** `permissionCancelled` arrived with this request's answer in flight: the late ack will be ignored. */
export function markPermissionCancelled(requestId: string): void {
  const flight = responding.get(requestId)
  if (flight) flight.cancelled = true
}

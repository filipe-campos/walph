// Claude session status for the user, derived from the events the conversation already emits. Pure:
// `conversation.ts` feeds the reducer and only emits `sessionStatus` when `status` or `unread` change.
//
// Priority when there is more than one signal: attention > error > running > done > idle.
// `unread` counts (unconditionally) each time the session finishes, asks for something or fails; the renderer is the
// one that knows whether it is visible, and calls `markRead` right away. Main does not know about visibility.

import { flattenControl } from '@shared/controlChars'
import { t } from '@shared/i18n'
import type { ClaudeAgentStatus } from '@shared/types'

/** What triggered a notice: the session finished, asked for something or failed. */
export type SessionSignal = 'done' | 'attention' | 'error'

export interface SessionState {
  readonly status: ClaudeAgentStatus
  readonly unread: number
  /** Signal that incremented `unread` in this transition (`null` in the others); basis of the OS notice. */
  readonly signal: SessionSignal | null
  /** The `attention` of `signal` came from a Claude question, not from a permission request. */
  readonly question: boolean
  /** Permission requests still unanswered (`requestId`). */
  readonly pending: readonly string[]
  /** A turn is in progress. */
  readonly working: boolean
  /** A background task exists (subagent, command): the session keeps running even without a turn. */
  readonly background: boolean
  /** How the last turn ended, until a new turn starts or `markRead` clears the `done`. */
  readonly last: 'none' | 'done' | 'error'
}

export type SessionInput =
  | { type: 'working' }
  | { type: 'idle' }
  | { type: 'closed' }
  | { type: 'background'; active: boolean }
  /** `question`: the request is a question (`AskUserQuestion`); only changes the notice text. */
  | { type: 'permission'; requestId: string; question?: boolean }
  | { type: 'permissionDone'; requestId: string }
  /** `interrupted`: the user interrupted the turn; it is neither a failure nor a completion to notify. */
  | { type: 'result'; isError: boolean; interrupted?: boolean }
  | { type: 'error' }
  | { type: 'markRead' }

export const INITIAL_SESSION_STATE: SessionState = {
  status: 'idle',
  unread: 0,
  signal: null,
  question: false,
  pending: [],
  working: false,
  background: false,
  last: 'none'
}

function derive(s: Pick<SessionState, 'pending' | 'working' | 'background' | 'last'>): ClaudeAgentStatus {
  if (s.pending.length > 0) return 'attention'
  if (s.last === 'error') return 'error'
  if (s.working || s.background) return 'running'
  if (s.last === 'done') return 'done'
  return 'idle'
}

export function reduceSession(state: SessionState, input: SessionInput): SessionState {
  let { pending, working, background, last, unread } = state
  let signal: SessionSignal | null = null
  let question = false
  switch (input.type) {
    case 'working':
      // A new turn erases the previous result.
      working = true
      last = 'none'
      break
    case 'idle':
      working = false
      break
    case 'closed':
      working = false
      background = false
      pending = []
      break
    case 'background':
      background = input.active
      break
    case 'permission':
      if (!pending.includes(input.requestId)) {
        pending = [...pending, input.requestId]
        unread++
        signal = 'attention'
        question = input.question === true
      }
      break
    case 'permissionDone':
      pending = pending.filter((id) => id !== input.requestId)
      break
    case 'result':
      working = false
      if (last === 'error') {
        // The API error comes BEFORE the `result` (which is also an error, or ok): it was already counted and
        // notified, and "finished" does not come after "failed".
      } else if (input.interrupted || (background && !input.isError)) {
        // With background agents the session has not finished: the notice waits for the turn the CLI opens when
        // they end (their report comes back as a new turn).
        last = 'none'
      } else {
        last = input.isError ? 'error' : 'done'
        unread++
        signal = last
      }
      break
    case 'error':
      // An error result and the `error` that comes with it (e.g. login) count as a single failure.
      if (last !== 'error') {
        last = 'error'
        unread++
        signal = 'error'
      }
      break
    case 'markRead':
      unread = 0
      if (last === 'done') last = 'none'
      break
  }
  return {
    status: derive({ pending, working, background, last }),
    unread,
    signal,
    question,
    pending,
    working,
    background,
    last
  }
}

/** `status` or `unread` changed (what the renderer sees). */
export function viewChanged(prev: SessionState, next: SessionState): boolean {
  return prev.status !== next.status || prev.unread !== next.unread
}

/**
 * Moment to notify the user: the transition incremented `unread` and the shown status is the signal's own (a `done`
 * that arrives with a pending request does not become "finished" over "needs you").
 */
export function notifyMoment(next: SessionState): SessionSignal | null {
  return next.signal !== null && next.status === next.signal ? next.signal : null
}

const NOTIFICATION_BODY_MAX = 80

/**
 * OS notification text. The session title comes from Claude (untrusted): plain text, one line, truncated.
 * Never includes conversation content.
 */
export function notificationContent(
  signal: SessionSignal,
  sessionTitle: string,
  question = false
): { title: string; body: string } {
  const clean = flattenControl(sessionTitle).trim()
  const body = clean === '' ? t().claudeHost.conversation.newTitle : clean
  const titles = t().claudeHost.notifications
  return {
    title: signal === 'attention' && question ? titles.question : titles[signal],
    body: body.length > NOTIFICATION_BODY_MAX ? `${body.slice(0, NOTIFICATION_BODY_MAX - 1)}…` : body
  }
}

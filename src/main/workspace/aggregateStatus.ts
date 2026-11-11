// Aggregate status of a workspace: the most urgent among the Claude sessions and the sum of the unread ones.
// Pure (no electron): main feeds it with the states of the view's conversations.

import type { ClaudeAgentStatus } from '@shared/types'

export interface SessionStatusLike {
  status: ClaudeAgentStatus
  unread: number
}

/** Higher = more urgent. */
const PRIORITY: Record<ClaudeAgentStatus, number> = { idle: 0, done: 1, running: 2, error: 3, attention: 4 }

export function aggregateStatus(sessions: readonly SessionStatusLike[]): SessionStatusLike {
  let status: ClaudeAgentStatus = 'idle'
  let unread = 0
  for (const s of sessions) {
    if (PRIORITY[s.status] > PRIORITY[status]) status = s.status
    unread += s.unread
  }
  return { status, unread }
}

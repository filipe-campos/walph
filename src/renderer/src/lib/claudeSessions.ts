// Ordering of the Claude session history. Pure.
import type { ClaudeSessionSummary } from '@shared/types'

/** Favorites first; within each group keeps the received order (most recent first). */
export function favoritesFirst(sessions: readonly ClaudeSessionSummary[]): ClaudeSessionSummary[] {
  return [...sessions.filter((s) => s.favorite), ...sessions.filter((s) => !s.favorite)]
}

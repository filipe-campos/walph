import { useStore } from '../../store'
import type { ClaudeConversation } from '../../lib/claudeConversation'
import { selectActiveConversation, selectConversation } from '../../lib/claudeSelectors'

/**
 * A field of a conversation by id, with `fallback` when it does not exist. `pick` must return a reference already
 * stored in the conversation (never a new object) and `fallback` a constant, so the selector stays stable.
 */
export function useConversationField<T>(id: string | null, pick: (c: ClaudeConversation) => T, fallback: T): T {
  return useStore((s) => {
    const conv = selectConversation(id)(s)
    return conv ? pick(conv) : fallback
  })
}

/** Same as `useConversationField`, for the active conversation. */
export function useActiveConversationField<T>(pick: (c: ClaudeConversation) => T, fallback: T): T {
  return useStore((s) => {
    const conv = selectActiveConversation(s)
    return conv ? pick(conv) : fallback
  })
}

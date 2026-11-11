import type { ClaudePanelState } from '../types/claude'
import type { ClaudeConversation } from './claudeConversation'

type ClaudeSlice = { claude: Pick<ClaudePanelState['claude'], 'conversations' | 'activeId'> }

/** Conversation by id (returns the list reference, stable in selectors). */
export function selectConversation(id: string | null | undefined): (s: ClaudeSlice) => ClaudeConversation | undefined {
  return (s) => (id == null ? undefined : s.claude.conversations.find((c) => c.id === id))
}

export function selectActiveConversation(s: ClaudeSlice): ClaudeConversation | undefined {
  return selectConversation(s.claude.activeId)(s)
}

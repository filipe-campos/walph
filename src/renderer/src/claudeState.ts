// Claude panel access to the conversations in the store: what every `claude*` module uses to read and change the state.
import type { ClaudeState } from './types/claude'
import { get, set } from './store'
import { selectActiveConversation, selectConversation } from './lib/claudeSelectors'
import { liveClaudeApi, liveId, type LiveConversationId } from './lib/claudeIds'
import type { ClaudeConversation } from './lib/claudeConversation'
import { t } from '@shared/i18n'

export const bridge = liveClaudeApi(() => window.api.claude)

export const failed = (message: string): string => t().claude.actions.failed(message)

export function patchClaude(patch: Partial<ClaudeState>): void {
  set((s) => ({ claude: { ...s.claude, ...patch } }))
}

/** Id for main coming from the UI: `null` if the tab is dormant or the id is `dormant:…` (never goes to IPC). */
export function liveConversationId(id: string): LiveConversationId | null {
  return findConversation(id)?.dormant ? null : liveId(id)
}

export function findConversation(id: string): ClaudeConversation | undefined {
  return selectConversation(id)(get())
}

export function updateConversation(id: string, update: (conv: ClaudeConversation) => ClaudeConversation): void {
  set((s) => {
    const conversations = s.claude.conversations.map((c) => (c.id === id ? update(c) : c))
    const changed = conversations.some((c, i) => c !== s.claude.conversations[i])
    return changed ? { claude: { ...s.claude, conversations } } : s
  })
}

/** Active conversation (or `undefined`). */
export function activeConversation(): ClaudeConversation | undefined {
  return selectActiveConversation(get())
}

export function optimisticPatch(
  id: string,
  apply: (c: ClaudeConversation) => ClaudeConversation,
  stillOurs: (c: ClaudeConversation) => boolean,
  revert: Partial<ClaudeConversation>
): () => void {
  updateConversation(id, apply)
  return () => updateConversation(id, (c) => (stillOurs(c) ? { ...c, ...revert } : c))
}

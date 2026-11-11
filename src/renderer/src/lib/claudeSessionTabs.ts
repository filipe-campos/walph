// Claude conversation tabs saved in the workspace session.
import type { SessionClaudeTab } from '@shared/types'
import { newConversationTitle, type ClaudeConversation } from './claudeConversation'

/** Conversation tabs for the session: only those with something to restore (CLI session or draft). */
export function sessionClaudeTabs(
  conversations: readonly ClaudeConversation[],
  activeId: string | null,
  draftOf: (id: string) => string
): { tabs: SessionClaudeTab[]; active: number | undefined } {
  const tabs: SessionClaudeTab[] = []
  let active: number | undefined
  for (const c of conversations) {
    const draft = draftOf(c.id)
    // Without messages the CLI has no transcript to resume: only the draft counts.
    const sessionId = c.sessionId && (c.messages.length > 0 || c.dormant) ? c.sessionId : undefined
    if (!sessionId && !draft) continue
    if (c.id === activeId) active = tabs.length
    tabs.push({
      ...(sessionId ? { sessionId } : {}),
      ...(c.title && c.title !== newConversationTitle() ? { title: c.title } : {}),
      ...(c.model ? { model: c.model } : {}),
      permissionMode: c.permissionMode === 'bypassPermissions' ? 'default' : c.permissionMode,
      ...(c.effort ? { effort: c.effort } : {}),
      ...(draft ? { draft } : {})
    })
  }
  return { tabs, active }
}

/**
 * Do the conversations have the same fields that `sessionClaudeTabs` reads? Cheap (without building the tabs): the
 * streaming only changes `streaming`, `messages` and the like, which do not go in here (of `messages` only whether
 * there is any).
 */
export function sameSessionFields(a: readonly ClaudeConversation[], b: readonly ClaudeConversation[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((x, i) => {
    const y = b[i]
    if (!y) return false
    return (
      x === y ||
      (x.id === y.id &&
        x.sessionId === y.sessionId &&
        x.dormant === y.dormant &&
        x.title === y.title &&
        x.model === y.model &&
        x.permissionMode === y.permissionMode &&
        x.effort === y.effort &&
        x.messages.length > 0 === y.messages.length > 0)
    )
  })
}

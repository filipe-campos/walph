import { useEffect } from 'react'
import { useStore } from '../../store'

/**
 * Conversation id of a per-conversation modal (`overlay.kind`), or `null` if it is closed or the conversation already
 * ended. With the modal open and the conversation ended, calls `close`.
 */
export function useConversationOverlay(kind: 'mcp' | 'usage' | 'claudeCommandArgs', close: () => void): string | null {
  const id = useStore((s) => (s.overlay?.kind === kind ? s.overlay.conversationId : null))
  const usable = useStore((s) =>
    s.claude.conversations.some(
      (c) => s.overlay?.kind === kind && c.id === s.overlay.conversationId && c.status !== 'closed'
    )
  )
  useEffect(() => {
    if (id && !usable) close()
  }, [id, usable, close])
  return id && usable ? id : null
}

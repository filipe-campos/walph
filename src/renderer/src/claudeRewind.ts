// Claude checkpoints: rolls the code and/or the conversation back to before a user message.
import { t } from '@shared/i18n'
import { attempt } from './attempt'
import { forgetAgentTimes } from './lib/claudeAgents'
import { notify } from './toasts'
import { draftText } from './claudeDrafts'
import { setPromptText } from './claudePromptBridge'
import { bridge, failed, findConversation, liveConversationId, updateConversation } from './claudeState'
import { agentTimes } from './claudeEvents'

// Conversations with a rewind in flight: a second click (or another message) before the reply is ignored.
const rewinding = new Set<string>()

/** Rolls the code and/or the conversation back to before a user message. */
export async function rewindConversation(
  id: string,
  message: string,
  what: { code: boolean; conversation: boolean },
  text: string
): Promise<void> {
  await attempt(
    async () => {
      const conv = findConversation(id)
      const live = liveConversationId(id)
      if (!conv || !live) return
      // The CLI is writing: rewinding now corrupts the current turn.
      if (conv.status === 'working') return notify(t().claude.actions.waitToRewind, 'info')
      if (rewinding.has(id)) return
      rewinding.add(id)
      let result: Awaited<ReturnType<typeof bridge.rewind>>
      try {
        result = await bridge.rewind(live, message, what)
      } finally {
        rewinding.delete(id)
      }
      if (what.conversation && result.messages) {
        const kept = new Set(result.messages.map((m) => m.uuid))
        // Agents of the messages the rewind discarded no longer need a time.
        forgetAgentTimes(agentTimes, findConversation(id)?.messages.filter((m) => !kept.has(m.uuid)) ?? [])
        updateConversation(id, (c) => ({
          ...c,
          messages: result.messages!,
          streaming: [],
          queued: [],
          notes: [],
          permissions: [],
          suggestion: null
        }))
      }
      if (what.conversation) {
        // A draft the user already typed is not overwritten: the returned message goes to its end.
        const draft = draftText(id)
        if (!draft.trim()) setPromptText(id, text)
        else if (draft.trim() !== text.trim()) {
          setPromptText(id, `${draft.replace(/\s+$/, '')}\n\n${text}`)
          notify(t().claude.actions.draftKept, 'info')
        }
      }
      const n = result.filesChanged.length
      if (what.code) notify(t().claude.actions.filesRestored(n), 'info')
    },
    { format: failed }
  )
}

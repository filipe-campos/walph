// `start` queue of the Claude conversations (main accepts one at a time) and the events that arrive before `start`
// replies.
import type { ClaudeEvent } from '@shared/types'
import { createStartQueue } from './lib/claudeStartQueue'
import type { LiveConversationId } from './lib/claudeIds'
import { patchClaude } from './claudeState'

// Events of a conversation that arrive before `start` replies (`init` is emitted as soon as the process starts).
export const earlyEvents = new Map<string, ClaudeEvent[]>()

// Every `start` goes through this queue (main accepts one at a time); `claude.starting` mirrors the busy queue.
export const startQueue = createStartQueue<LiveConversationId | null>((busy) => {
  if (!busy) earlyEvents.clear()
  patchClaude({ starting: busy })
})

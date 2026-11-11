import type { ClaudeMessage } from '@shared/types'

/** The Claude session shared by the conversation, the rewind and the message router. */
export interface ConversationData {
  sessionId: string
  /** The session already exists on disk (resumed or with some turn): only then does `resume` work on relaunch. */
  persisted: boolean
  transcript: ClaudeMessage[]
  hadResult: boolean
  /**
   * After a rewind, the relaunch must resume at THIS point until the next `result` (otherwise discarded turns come
   * back).
   */
  resumeAtOnWake: string | undefined
}

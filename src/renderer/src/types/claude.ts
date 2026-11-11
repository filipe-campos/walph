import type { ClaudeFavoriteCommand } from '@shared/favoriteCommands'
import type { ClaudeConversation } from '../lib/claudeConversation'

/** Claude panel conversations (the ones from main events); each one's UI lives in `components/claude`. */
export interface ClaudeState {
  conversations: ClaudeConversation[]
  activeId: string | null
  /** `claude.start` in flight (avoids opening two conversations when opening the panel twice in a row). */
  starting: boolean
  /** Conversation whose title is being edited in the tab (F2, double click, ⋯ menu); `null` = nobody renaming. */
  renamingId: string | null
}

export interface ClaudePanelState {
  claude: ClaudeState
  /** Secondary sidebar (Claude panel) open and its width (px): they are part of the session. */
  claudeVisible: boolean
  claudeWidth: number
  /** Favorite commands of the Claude panel for this folder (stored in main, per folder); `[]` until loaded. */
  claudeFavoriteCommands: ClaudeFavoriteCommand[]
  /** Conversation with the text search open (⌘F with focus on the panel). */
  claudeFindId: string | null
}

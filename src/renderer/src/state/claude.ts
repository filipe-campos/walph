import { CLAUDE_WIDTH } from '../lib/session'
import type { ClaudePanelState } from '../types/claude'

type GlobalKey = 'claudeWidth'

/** `prev` keeps the `claude.starting` queue: a `claude.start` in flight still applies in the new folder. */
export function scopedClaudeState(prev?: Pick<ClaudePanelState, 'claude'>): Omit<ClaudePanelState, GlobalKey> {
  return {
    claude: {
      conversations: [],
      activeId: null,
      starting: prev?.claude.starting ?? false,
      renamingId: null
    },
    // Claude conversations die in main with the folder; the panel reopens through the new one's session
    // (`claudeVisible`).
    claudeVisible: false,
    claudeFavoriteCommands: [],
    claudeFindId: null
  }
}

export function globalClaudeState(): Pick<ClaudePanelState, GlobalKey> {
  return { claudeWidth: CLAUDE_WIDTH.default }
}

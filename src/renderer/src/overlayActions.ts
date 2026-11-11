import { get, set, type State } from './store'
import { registerOverlayPolicy, type OverlayPolicy } from './commands/registry'
import { createReactionScope } from './lib/reactions'

// One modal at a time: yields the open one and any quick input, taking the theme picker preview along.
export function showOverlay(overlay: NonNullable<State['overlay']>): void {
  set({ quickInput: null, themePreview: null, overlay })
}

export function openAddWorkspace(): void {
  showOverlay({ kind: 'addWorkspace' })
}

export function closeAddWorkspace(): void {
  if (get().overlay?.kind === 'addWorkspace') set({ overlay: null })
}

/**
 * Opens the MCP server manager of conversation `id` (one modal at a time). Dormant conversation: use
 * `openClaudeMcp`.
 */
export function openMcpModal(id: string): void {
  const open = get().overlay
  if (open?.kind === 'mcp' && open.conversationId === id && !get().quickInput) return
  showOverlay({ kind: 'mcp', conversationId: id })
}

export function closeMcpModal(): void {
  if (get().overlay?.kind === 'mcp') set({ overlay: null })
}

/** Opens the `/usage` of conversation `id` (real id; one modal at a time). */
export function openUsageModal(id: string): void {
  const open = get().overlay
  if (open?.kind === 'usage' && open.conversationId === id && !get().quickInput) return
  showOverlay({ kind: 'usage', conversationId: id })
}

export function closeUsageModal(): void {
  if (get().overlay?.kind === 'usage') set({ overlay: null })
}

/** Asks for the arguments of a favorite command (`/name`) before sending it to conversation `id`. */
export function openCommandArgsModal(id: string, command: string, hint: string): void {
  showOverlay({ kind: 'claudeCommandArgs', conversationId: id, command, hint })
}

export function closeCommandArgsModal(): void {
  if (get().overlay?.kind === 'claudeCommandArgs') set({ overlay: null })
}

const policies: OverlayPolicy[] = [
  // The add workspace modal goes away before any command (except the global ones), and reopening it does not reopen it.
  {
    priority: 30,
    active: (s) => s.overlay?.kind === 'addWorkspace',
    close: closeAddWorkspace,
    consumes: (id) => id === 'workbench.closeTab' || id === 'workspace.add'
  },
  // The MCP and usage modals only yield to ⌘W and to the workbench commands.
  {
    priority: 20,
    active: (s) => s.overlay?.kind === 'mcp',
    close: closeMcpModal,
    consumes: (id) => id === 'workbench.closeTab' || id === 'claude.closeSession'
  },
  {
    priority: 21,
    active: (s) => s.overlay?.kind === 'usage',
    close: closeUsageModal,
    consumes: (id) => id === 'workbench.closeTab' || id === 'claude.closeSession'
  },
  {
    priority: 22,
    active: (s) => s.overlay?.kind === 'claudeCommandArgs',
    close: closeCommandArgsModal,
    consumes: (id) => id === 'workbench.closeTab' || id === 'claude.closeSession'
  }
]

export function startOverlayReactions(): () => void {
  const scope = createReactionScope()
  for (const policy of policies) scope.add(registerOverlayPolicy(policy))
  return scope.stop
}

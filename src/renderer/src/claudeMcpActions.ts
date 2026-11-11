// Claude's MCP server manager (`/mcp`) and usage report (`/usage`): both open a modal of a conversation that must be
// alive, so they wake the dormant tab first.
import type {
  ClaudeMcpAuthResult,
  ClaudeMcpScope,
  ClaudeMcpServer,
  ClaudeMcpServerInput,
  ClaudeUsageReport
} from '@shared/types'
import { t } from '@shared/i18n'
import { get } from './store'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { liveId, type LiveConversationId } from './lib/claudeIds'
import { notify } from './toasts'
import { openMcpModal, openUsageModal } from './overlayActions'
import { bridge, failed, findConversation, liveConversationId } from './claudeState'
import { wakeConversation } from './claudeLifecycle'

/** Opens the conversation's MCP servers modal (wakes a dormant one first: the API id must be the real one). */
export async function openClaudeMcp(id: string | null = get().claude.activeId): Promise<void> {
  if (!id || !findConversation(id)) {
    notify(t().claude.actions.openForMcp, 'info')
    return
  }
  await openOverlayAfterWake(id, openMcpModal)
}

/** Wakes the conversation (if dormant) and opens its modal, unless another modal opened during the wake. */
async function openOverlayAfterWake(id: string, open: (live: string) => void): Promise<void> {
  const before = get()
  const real = await mcpTarget(id)
  const now = get()
  const taken =
    (now.overlay?.kind === 'settings' && before.overlay?.kind !== 'settings') ||
    (now.overlay?.kind === 'addWorkspace' && before.overlay?.kind !== 'addWorkspace') ||
    (!!now.quickInput && !before.quickInput)
  if (real && !taken && findConversation(real)) open(real)
}

/**
 * Conversation usage report; `null` = the installed Claude Code does not report it. The (translated) error bubbles up
 * for the modal to show.
 */
export function loadClaudeUsage(id: string): Promise<ClaudeUsageReport | null> {
  const live = liveId(id)
  return live ? bridge.usage(live) : Promise.reject(new Error(t().claude.actions.notStarted))
}

/** Opens the conversation's `/usage` (wakes a dormant one first: the API id must be the real one). */
export async function openClaudeUsage(id: string | null = get().claude.activeId): Promise<void> {
  if (!id || !findConversation(id)) {
    notify(t().claude.actions.openForUsage, 'info')
    return
  }
  await openOverlayAfterWake(id, openUsageModal)
}

/**
 * Real id for the API: a dormant conversation is woken first (`dormant:` is never sent to main). `null` = unavailable.
 */
async function mcpTarget(id: string): Promise<LiveConversationId | null> {
  const conv = findConversation(id)
  if (!conv) return null
  if (conv.status === 'closed') {
    notify(t().claude.actions.conversationEnded, 'info')
    return null
  }
  if (!conv.dormant) return liveConversationId(id)
  return wakeConversation(id)
}

/** Runs an MCP call: an error becomes a toast and `null`; the caller discards the result if the context changed. */
async function mcpCall<T>(
  id: string,
  call: (realId: LiveConversationId) => Promise<T>,
  quiet = false
): Promise<T | null> {
  return attempt(
    async () => {
      const real = await mcpTarget(id)
      return real ? call(real) : null
    },
    { format: failed, fallback: null, quiet }
  )
}

/** `quiet` (polling): silent failure, the caller decides when to give up. */
export function loadMcpStatus(id: string, quiet = false): Promise<ClaudeMcpServer[] | null> {
  return mcpCall(id, (c) => bridge.mcpStatus(c), quiet)
}

export function toggleMcpServer(id: string, name: string, enabled: boolean): Promise<ClaudeMcpServer[] | null> {
  return mcpCall(id, (c) => bridge.mcpToggle(c, name, enabled))
}

export function reconnectMcpServer(id: string, name: string): Promise<ClaudeMcpServer[] | null> {
  return mcpCall(id, (c) => bridge.mcpReconnect(c, name))
}

/** Starts OAuth (main opens the browser). */
export function authenticateMcpServer(id: string, name: string): Promise<ClaudeMcpAuthResult | null> {
  return mcpCall(id, (c) => bridge.mcpAuthenticate(c, name))
}

export function submitMcpCallback(id: string, name: string, callbackUrl: string): Promise<ClaudeMcpServer[] | null> {
  return mcpCall(id, (c) => bridge.mcpSubmitCallback(c, name, callbackUrl))
}

/** "Log out": deletes the server's stored authentication. */
export function logoutMcpServer(id: string, name: string): Promise<ClaudeMcpServer[] | null> {
  return mcpCall(id, (c) => bridge.mcpClearAuth(c, name))
}

/**
 * Adds a server. Unlike the others, the error does NOT become a toast: the form shows it inline (main does the real
 * validation), so it returns `{ error }`.
 */
export async function addMcpServer(
  id: string,
  input: ClaudeMcpServerInput
): Promise<{ servers: ClaudeMcpServer[] } | { error: string }> {
  try {
    const real = await mcpTarget(id)
    if (!real) return { error: t().claude.actions.unavailable }
    return { servers: await bridge.mcpAdd(real, input) }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export function removeMcpServer(id: string, name: string, scope: ClaudeMcpScope): Promise<ClaudeMcpServer[] | null> {
  return mcpCall(id, (c) => bridge.mcpRemove(c, name, scope))
}

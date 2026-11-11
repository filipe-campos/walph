import { t } from '@shared/i18n'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { ClaudeAttachmentResult, ClaudeSessionSummary } from '@shared/types'
import { parseFavoriteCommands, type ClaudeFavoriteCommand } from '@shared/favoriteCommands'
import { authorizeAttachments, pickAttachments } from '../claude/attachmentPicker'
import { authStatus, logout, registerClaudeLoginSource } from '../claude/authCli'
import { ClaudeConversation } from '../claude/conversation/conversation'
import { createConversationDeps } from '../claude/conversationDeps'
import {
  findConversation,
  markConversationRead,
  ownedConversation,
  registerClaudeLifecycle,
  removeConversation,
  restartAllOf,
  setEditorContext,
  startConversation
} from '../claude/registry'
import { forkConversation, exportConversation, listSessions, updateSessionMeta } from '../claude/sessions'
import { favoriteCommands } from '../claude/stores'
import { isSessionId, parseMetaPatch } from '../claude/sessionMeta'
import {
  isPermissionMode,
  parseAttachmentPaths,
  parseEditorContext,
  parseEffortOrNull,
  parseModel,
  parsePromptInput,
  parseResponse,
  parseRewind,
  parseStartOptions,
  parseTaskId
} from '../claude/validate'
import {
  parseCallbackUrl,
  parseMcpEnabled,
  parseMcpScope,
  parseServerName,
  validateMcpServerInput
} from '../claude/mcp'
import { assertOwnRoot, requireViewRoot } from '../window/ownRoot'
import { getWindowRoot } from '../window/windows'
import { lspManagerOf } from '../lsp/registry'
import { handle, on } from './typed'
import { UserError } from '../errors'

const requireRoot = (wc: WebContents): string => requireViewRoot(wc, t().claudeHost.conversation.openFolder)

/** The view folder, as long as it is the one the renderer thinks it is (an in-flight folder change never writes to the
 * wrong folder). */
function rootMatching(wc: WebContents, expected: unknown): string {
  requireRoot(wc)
  return assertOwnRoot(wc, expected, t().claudeHost.conversation.windowFolderChanged)
}

export function registerClaudeHandlers(): void {
  registerClaudeLoginSource()
  registerClaudeLifecycle()

  handle('claude:start', async (e, options: unknown) => {
    const wc = e.sender
    const parsed = parseStartOptions(options)
    const id = randomUUID()
    const conversation: ClaudeConversation = new ClaudeConversation(
      id,
      createConversationDeps(
        wc,
        id,
        () => conversation.sessionTitle,
        (path) => lspManagerOf(wc)?.diagnosticsSnapshot(path) ?? []
      ),
      parsed
    )
    return startConversation(wc, conversation)
  })

  handle('claude:send', (e, id: unknown, input: unknown) =>
    ownedConversation(e.sender, id).send(parsePromptInput(input))
  )
  handle('claude:interrupt', (e, id: unknown) => ownedConversation(e.sender, id).interrupt())
  handle('claude:stopTask', (e, id: unknown, taskId: unknown) =>
    ownedConversation(e.sender, id).stopTask(parseTaskId(taskId))
  )
  handle('claude:close', async (e, id: unknown) => {
    const conversation = findConversation(e.sender, id)
    if (conversation) await removeConversation(e.sender, conversation)
  })
  on('claude:markRead', (e, id: unknown) => {
    if (typeof id === 'string') markConversationRead(e.sender, id)
  })
  handle('claude:respond', (e, id: unknown, requestId: unknown, response: unknown): boolean => {
    if (typeof id !== 'string' || typeof requestId !== 'string') return false
    try {
      const conversation = findConversation(e.sender, id)
      // Unknown conversation: nothing to answer (the request was already cancelled with it).
      return conversation ? conversation.respond(requestId, parseResponse(response)) : true
    } catch {
      // Malformed answer: rejected, the request stays pending.
      return false
    }
  })
  handle('claude:setPermissionMode', (e, id: unknown, mode: unknown) => {
    if (!isPermissionMode(mode)) throw new UserError(t().claudeHost.conversation.invalidPermissionMode)
    return ownedConversation(e.sender, id).setPermissionMode(mode)
  })
  handle('claude:setModel', (e, id: unknown, model: unknown) =>
    ownedConversation(e.sender, id).setModel(parseModel(model))
  )
  handle('claude:setEffort', (e, id: unknown, effort: unknown) =>
    ownedConversation(e.sender, id).setEffort(parseEffortOrNull(effort))
  )
  handle('claude:commands', (e, id: unknown) => ownedConversation(e.sender, id).slashCommands())

  handle('claude:pickAttachments', async (e): Promise<ClaudeAttachmentResult> => {
    const root = requireRoot(e.sender)
    return pickAttachments(e.sender, root)
  })
  handle('claude:authorizeAttachments', async (e, paths: unknown): Promise<ClaudeAttachmentResult> => {
    const root = requireRoot(e.sender)
    return authorizeAttachments(e.sender, root, parseAttachmentPaths(paths))
  })

  handle('claude:contextUsage', (e, id: unknown) => ownedConversation(e.sender, id).contextUsage())
  handle('claude:usage', (e, id: unknown) => ownedConversation(e.sender, id).usage())
  handle('claude:authStatus', (e) => authStatus(e.sender))
  handle('claude:logout', (e) => logout(e.sender))
  handle('claude:restartAll', (e) => restartAllOf(e.sender))

  // `/mcp`: the argument shape here; the conversation checks the name against the latest list.
  handle('claude:mcpStatus', (e, id: unknown) => ownedConversation(e.sender, id).mcp.status())
  handle('claude:mcpToggle', (e, id: unknown, name: unknown, enabled: unknown) =>
    ownedConversation(e.sender, id).mcp.toggle(parseServerName(name), parseMcpEnabled(enabled))
  )
  handle('claude:mcpReconnect', (e, id: unknown, name: unknown) =>
    ownedConversation(e.sender, id).mcp.reconnect(parseServerName(name))
  )
  handle('claude:mcpAuthenticate', (e, id: unknown, name: unknown) =>
    ownedConversation(e.sender, id).mcp.authenticate(parseServerName(name))
  )
  handle('claude:mcpSubmitCallback', (e, id: unknown, name: unknown, url: unknown) =>
    ownedConversation(e.sender, id).mcp.submitCallback(parseServerName(name), parseCallbackUrl(url))
  )
  handle('claude:mcpClearAuth', (e, id: unknown, name: unknown) =>
    ownedConversation(e.sender, id).mcp.clearAuth(parseServerName(name))
  )
  handle('claude:mcpAdd', (e, id: unknown, input: unknown) =>
    ownedConversation(e.sender, id).mcp.add(validateMcpServerInput(input))
  )
  handle('claude:mcpRemove', (e, id: unknown, name: unknown, scope: unknown) =>
    ownedConversation(e.sender, id).mcp.remove(parseServerName(name), parseMcpScope(scope))
  )

  handle('claude:rewind', (e, id: unknown, messageUuid: unknown, what: unknown) => {
    if (typeof messageUuid !== 'string') throw new UserError(t().claudeHost.conversation.invalidMessage)
    return ownedConversation(e.sender, id).rewind(messageUuid, parseRewind(what))
  })

  handle('claude:sessions', async (e): Promise<ClaudeSessionSummary[]> => {
    const root = getWindowRoot(e.sender)
    return root ? listSessions(root) : []
  })

  handle('claude:favoriteCommands', async (e, root: unknown): Promise<ClaudeFavoriteCommand[]> =>
    favoriteCommands().load(rootMatching(e.sender, root))
  )
  handle(
    'claude:setFavoriteCommands',
    async (e, root: unknown, commands: unknown): Promise<ClaudeFavoriteCommand[]> => {
      const parsed = parseFavoriteCommands(commands)
      return favoriteCommands().save(rootMatching(e.sender, root), parsed)
    }
  )

  handle('claude:setSessionMeta', async (e, sessionId: unknown, patch: unknown): Promise<void> => {
    const root = requireRoot(e.sender)
    if (!isSessionId(sessionId))
      throw new UserError(t().claudeHost.request.invalid(t().claudeHost.request.parts.session))
    await updateSessionMeta(e.sender, root, sessionId, parseMetaPatch(patch))
  })

  handle('claude:fork', async (e, id: unknown): Promise<string> => {
    const conversation = ownedConversation(e.sender, id)
    return forkConversation(conversation, requireRoot(e.sender))
  })

  handle('claude:exportMarkdown', async (e, id: unknown): Promise<string | null> =>
    exportConversation(e.sender, ownedConversation(e.sender, id))
  )

  on('claude:setEditorContext', (e, context: unknown) => {
    try {
      setEditorContext(e.sender, parseEditorContext(context))
    } catch {
      // malformed context: keeps the previous one
    }
  })
}

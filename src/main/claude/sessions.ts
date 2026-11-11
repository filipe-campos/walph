import { app, type WebContents } from 'electron'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import type { ClaudeSessionMetaPatch, ClaudeSessionSummary } from '@shared/types'
import { writeFileAtomic } from '../fs/atomicWrite'
import { showSaveDialogFor } from '../window/nativeUi'
import type { ClaudeConversation } from './conversation/conversation'
import { buildMarkdown, exportFileName } from './exportMarkdown'
import { conversationsOf } from './registry'
import { loadSdk } from './sdk'
import { sanitizeTitle } from './sessionMeta'
import { autoTitle, toSessionSummary } from './sessionTitle'
import { sessionMeta } from './stores'
import { UserError } from '../errors'

const SESSIONS_LIMIT = 200

/** Conversation history of the folder, from newest to oldest. */
export async function listSessions(root: string): Promise<ClaudeSessionSummary[]> {
  const sdk = await loadSdk()
  // `includeProgrammatic`: this panel's conversations are SDK ones (programmatic) and must show up.
  const [list, meta] = await Promise.all([
    sdk.listSessions({ dir: root, includeProgrammatic: true, limit: SESSIONS_LIMIT }),
    sessionMeta().load(root)
  ])
  return list.map((s) => toSessionSummary(s, meta.get(s.sessionId))).sort((a, b) => b.lastModified - a.lastModified)
}

/** Saves the session favorite/title; a changed title also goes to the open conversations and the CLI transcript. */
export async function updateSessionMeta(
  wc: WebContents,
  root: string,
  sessionId: string,
  patch: ClaudeSessionMetaPatch
): Promise<void> {
  await sessionMeta().update(root, sessionId, patch)
  if (patch.title === undefined) return
  // Open conversations with this session start using the title (toasts, OS notices, `WorkspaceNotice`).
  let live: ClaudeConversation | undefined
  for (const c of conversationsOf(wc)) {
    if (c.currentSessionId !== sessionId) continue
    c.setUserTitle(patch.title)
    live = c
  }
  await syncCliTitle(root, sessionId, patch.title, live?.autoTitle)
}

/**
 * Best effort: the title also goes to the CLI transcript (`claude --resume` shows the same name). Clearing the title
 * rewrites the automatic one (the CLI has no way to delete a `custom-title`). A failure (session file does not exist
 * yet, SDK unavailable) is ignored: the Walph title is already saved and wins in the list and on resume.
 */
async function syncCliTitle(
  root: string,
  sessionId: string,
  title: string | null,
  liveAutoTitle: string | undefined
): Promise<void> {
  try {
    const sdk = await loadSdk()
    let cliTitle = title
    if (cliTitle === null) {
      if (liveAutoTitle !== undefined) cliTitle = liveAutoTitle
      else {
        // Same rule as the conversation automatic title (summary > first message), so tab and transcript match.
        const info = await sdk.getSessionInfo(sessionId, { dir: root })
        cliTitle = autoTitle({ summary: info?.summary, firstPrompt: info?.firstPrompt })
      }
    }
    if (cliTitle) await sdk.renameSession(sessionId, cliTitle, { dir: root })
  } catch {
    // see above
  }
}

/** Duplicates the conversation session and returns the new `sessionId`. */
export async function forkConversation(conversation: ClaudeConversation, root: string): Promise<string> {
  const sessionId = await conversation.fork()
  // The copy does not take the favorite, only the user title ("<title> (copy)"); without a user title, the CLI one
  // (`forkSession` with the same "(copy)") and the conversation's own automatic one are enough.
  const own = conversation.customTitle
  if (own)
    await sessionMeta().update(root, sessionId, { title: sanitizeTitle(t().claudeHost.conversation.copyTitle(own)) })
  return sessionId
}

/** Asks where to save and writes the conversation as Markdown; `null` = the user cancelled. */
export async function exportConversation(wc: WebContents, conversation: ClaudeConversation): Promise<string | null> {
  const { title, messages } = conversation.exportData()
  const filePath = await showSaveDialogFor(wc, {
    title: t().claudeHost.export.dialogTitle,
    defaultPath: join(app.getPath('documents'), exportFileName(title)),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (!filePath) return null
  try {
    await writeFileAtomic(filePath, buildMarkdown({ title, messages, exportedAt: new Date() }))
  } catch (err) {
    throw new UserError(t().claudeHost.export.saveFailed(err instanceof Error ? err.message : String(err)), {
      cause: err
    })
  }
  return filePath
}

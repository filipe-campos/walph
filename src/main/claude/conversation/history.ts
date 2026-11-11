import type { ClaudeMessage } from '@shared/types'
import { normalizeMessage } from '../normalizeMessage'
import { autoTitle, displayTitle } from '../sessionTitle'
import type { ConversationDeps } from './deps'

interface LoadedHistory {
  transcript: ClaudeMessage[]
  favorite: boolean
  /** User title (Walph); `null` = none. */
  userTitle: string | null
  /** AUTOMATIC title (without the user's); `undefined` = nothing to show. */
  autoTitle: string | undefined
  /** The displayed title: the user's (Walph) wins over the CLI's (`/rename`) and the automatic summary. */
  title: string | undefined
}

/** Transcript, favorite and titles of a session to resume. */
export async function loadHistory(
  deps: Pick<ConversationDeps, 'loadSdk' | 'loadSessionMeta'>,
  root: string,
  resume: string
): Promise<LoadedHistory> {
  const sdk = await deps.loadSdk()
  const [messages, info, meta] = await Promise.all([
    sdk.getSessionMessages(resume, { dir: root }).catch(() => []),
    sdk.getSessionInfo(resume, { dir: root }).catch(() => undefined),
    deps.loadSessionMeta?.(resume).catch(() => undefined)
  ])
  const userTitle = meta?.title ?? null
  // The automatic one never comes from the user title: the CLI `customTitle`/`summary` may be a copy of it
  // (`renameSession`), so the automatic one comes from the first message. Clearing the title goes back to this value.
  const sources = {
    userTitle,
    customTitle: info?.customTitle,
    summary: info?.summary,
    firstPrompt: info?.firstPrompt
  }
  return {
    transcript: messages.flatMap((m) => {
      const normalized = normalizeMessage(m, { history: true })
      return normalized ? [normalized] : []
    }),
    favorite: meta?.favorite === true,
    userTitle,
    autoTitle: autoTitle(sources) ?? undefined,
    title: displayTitle(sources) ?? undefined
  }
}

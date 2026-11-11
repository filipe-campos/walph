// Title of a Claude session: a single rule for the tab (`conversation/conversation.ts`) and for the history
// (`sessions.ts`), otherwise the same conversation shows up with different names in the two places. The texts come from
// the CLI/user (untrusted).
import { t } from '@shared/i18n'
import type { ClaudeSessionSummary } from '@shared/types'
import type { SessionMetaEntry } from './sessionMeta'

const TITLE_MAX = 60
const SUMMARY_TITLE_MAX = 200

export interface TitleSources {
  /** Title given by the user in Walph. */
  userTitle?: string | null | undefined
  /** CLI title (`/rename`); may be a copy of the user title (`renameSession`). */
  customTitle?: string | null | undefined
  /** CLI automatic summary. */
  summary?: string | null | undefined
  firstPrompt?: string | null | undefined
}

/** First non-empty line, capped at 60 characters. */
export function titleFrom(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (!line) return t().claudeHost.conversation.newTitle
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
}

/** AUTOMATIC title (without the user's): `customTitle` > `summary` > first message. `null` = nothing to show. */
export function autoTitle(src: TitleSources): string | null {
  const user = src.userTitle || null
  // With a user title, customTitle/summary may be a copy of it: they only count if different.
  const custom = src.customTitle && src.customTitle !== user ? src.customTitle : null
  const summary = src.summary && src.summary !== user && src.summary !== src.customTitle ? src.summary : null
  const first = src.firstPrompt?.trim() ? titleFrom(src.firstPrompt) : null
  return user ? (summary ?? first) : (custom ?? summary ?? first)
}

/** Shown title: the user's (Walph) beats the CLI's and the automatic one. */
export function displayTitle(src: TitleSources): string | null {
  return src.userTitle || autoTitle(src)
}

export interface SdkSessionInfoLike {
  sessionId: string
  lastModified: number
  gitBranch?: string
  customTitle?: string
  summary?: string
  firstPrompt?: string
}

export function toSessionSummary(s: SdkSessionInfoLike, meta: SessionMetaEntry | undefined): ClaudeSessionSummary {
  const title = displayTitle({
    userTitle: meta?.title,
    customTitle: s.customTitle,
    summary: s.summary,
    firstPrompt: s.firstPrompt
  })
  return {
    sessionId: s.sessionId,
    title: (title ?? t().claudeHost.conversation.untitled).slice(0, SUMMARY_TITLE_MAX),
    lastModified: s.lastModified,
    ...(s.gitBranch ? { gitBranch: s.gitBranch } : {}),
    favorite: meta?.favorite === true
  }
}

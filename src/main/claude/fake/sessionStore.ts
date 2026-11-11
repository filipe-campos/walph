// Session store of the fake SDK (`index.ts`): what the CLI transcript does in the real SDK: `listSessions`,
// `getSessionInfo`, `getSessionMessages`, `forkSession`, `renameSession`. Kept in a JSON file to survive an
// app restart in the E2E tests. Tests only: nothing here runs in the packaged app.

import { isRecord } from '@shared/guards'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { writeJsonAtomicSync } from '../../fs/atomicWrite'
import { isInjectedContext } from '../buildPrompt'

/** Message as `getSessionMessages` returns it (and as `normalizeMessage` consumes it). */
export interface StoredMessage {
  type: 'user' | 'assistant'
  uuid: string
  session_id: string
  message: unknown
  parent_tool_use_id: string | null
}

export interface StoredSession {
  sessionId: string
  cwd: string
  createdAt: number
  lastModified: number
  customTitle?: string
  firstPrompt?: string
  messages: StoredMessage[]
}

export interface FakeSessionInfo {
  sessionId: string
  summary: string
  lastModified: number
  customTitle?: string
  firstPrompt?: string
  cwd?: string
  createdAt: number
}

/** First typed (not injected) text of a `user` message. */
function promptText(message: unknown): string | undefined {
  const content = isRecord(message) ? message.content : undefined
  if (typeof content === 'string') return content || undefined
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string' && !isInjectedContext(block.text)) {
      return block.text
    }
  }
  return undefined
}

export class FakeSessionStore {
  private sessions = new Map<string, StoredSession>()

  /** `path` = JSON file (read now, rewritten on every change); `null` = in memory only. */
  constructor(private readonly path: string | null) {
    if (!path) return
    try {
      const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
      const list = isRecord(raw) && Array.isArray(raw.sessions) ? raw.sessions : []
      for (const s of list) {
        if (isRecord(s) && typeof s.sessionId === 'string' && Array.isArray(s.messages)) {
          this.sessions.set(s.sessionId, s as unknown as StoredSession)
        }
      }
    } catch {
      // No file (first run) or unreadable: starts empty.
    }
  }

  private save(): void {
    if (this.path) writeJsonAtomicSync(this.path, { sessions: [...this.sessions.values()] })
  }

  /** Strictly increasing clock: two changes in the same millisecond still sort. */
  private clock = 0
  private tick(): number {
    return (this.clock = Math.max(Date.now(), this.clock + 1))
  }

  private touch(s: StoredSession): void {
    s.lastModified = this.tick()
  }

  /** `resumeAt`: when resuming "up to here" (rewind), drops the messages after that one. */
  open(sessionId: string, resumeAt?: string): void {
    const s = this.sessions.get(sessionId)
    if (!s || !resumeAt) return
    const index = s.messages.findIndex((m) => m.uuid === resumeAt)
    if (index !== -1 && index < s.messages.length - 1) {
      s.messages = s.messages.slice(0, index + 1)
      this.touch(s)
      this.save()
    }
  }

  /** Records a message; the session comes into existence on the first one (like the CLI file). */
  append(sessionId: string, cwd: string, message: Omit<StoredMessage, 'session_id'>): void {
    let s = this.sessions.get(sessionId)
    if (!s) {
      const now = this.tick()
      s = { sessionId, cwd, createdAt: now, lastModified: now, messages: [] }
      this.sessions.set(sessionId, s)
    }
    if (!s.firstPrompt && message.type === 'user') {
      const prompt = promptText(message.message)
      if (prompt !== undefined) s.firstPrompt = prompt
    }
    s.messages.push({ ...message, session_id: sessionId })
    this.touch(s)
    this.save()
  }

  private infoOf(s: StoredSession): FakeSessionInfo {
    return {
      sessionId: s.sessionId,

      summary: s.customTitle || s.firstPrompt || 'Test session',
      lastModified: s.lastModified,
      createdAt: s.createdAt,
      cwd: s.cwd,
      ...(s.customTitle ? { customTitle: s.customTitle } : {}),
      ...(s.firstPrompt ? { firstPrompt: s.firstPrompt } : {})
    }
  }

  list(dir: string | undefined, limit?: number, offset = 0): FakeSessionInfo[] {
    const all = [...this.sessions.values()]
      .filter((s) => dir === undefined || s.cwd === dir)
      .sort((a, b) => b.lastModified - a.lastModified)
      .map((s) => this.infoOf(s))
    return all.slice(offset, limit === undefined ? undefined : offset + limit)
  }

  info(sessionId: string): FakeSessionInfo | undefined {
    const s = this.sessions.get(sessionId)
    return s ? this.infoOf(s) : undefined
  }

  messages(sessionId: string): StoredMessage[] {
    return (this.sessions.get(sessionId)?.messages ?? []).map((m) => ({ ...m }))
  }

  /** Like the real SDK, fails if the session does not exist (missing file). */
  rename(sessionId: string, title: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`Session ${sessionId} not found`)
    s.customTitle = title
    this.touch(s)
    this.save()
  }

  fork(sessionId: string, options: { title?: string; upToMessageId?: string } = {}): { sessionId: string } {
    const source = this.sessions.get(sessionId)
    if (!source || source.messages.length === 0) throw new Error(`Session ${sessionId} not found`)
    const id = randomUUID()
    const upTo = options.upToMessageId ? source.messages.findIndex((m) => m.uuid === options.upToMessageId) : -1
    const kept = upTo === -1 ? source.messages : source.messages.slice(0, upTo + 1)
    const now = this.tick()
    this.sessions.set(id, {
      sessionId: id,
      cwd: source.cwd,
      createdAt: now,
      lastModified: now,

      customTitle: options.title ?? `${source.customTitle || source.firstPrompt || 'Test session'} (fork)`,
      ...(source.firstPrompt ? { firstPrompt: source.firstPrompt } : {}),
      messages: kept.map((m) => ({ ...m, uuid: randomUUID(), session_id: id }))
    })
    this.save()
    return { sessionId: id }
  }
}

// Claude session metadata that belongs only to Walph: favorite and user-given title, per `sessionId`.
// Stored in `<userData>/claude/<folder-sha256>.json` (same key as the `sessions/` files, see `sessionFileName`).
// Reading is tolerant (missing/corrupted file = empty) and the content is treated as untrusted.

import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ClaudeSessionMetaPatch } from '@shared/types'
import { writeJsonAtomicSync } from '../fs/atomicWrite'
import { sessionFileName } from '../session/sessionFile'
import { KeyedSerialQueue } from '../util/serialQueue'
import { clampText } from './buildPrompt'
import { UserError } from '../errors'

export const TITLE_MAX_CHARS = 200
/** Cap of sessions per folder: past it the oldest go (the ones untouched for the longest). */
export const MAX_META_ENTRIES = 5000

export interface SessionMetaEntry {
  favorite: boolean
  /** User-given title (already sanitized); missing = use the automatic one. */
  title?: string
}

export type SessionMeta = Map<string, SessionMetaEntry>

/** Same shape accepted by `claude:start` in `resume` (and which spares the `Map` from `__proto__` and the like). */
export function isSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(v)
}

// C0/C1 controls, line/paragraph separators and bidirectional marks (they can hide/reverse text in the UI).
const CONTROL_OR_BIDI = new RegExp('[\\p{Cc}\\u2028\\u2029\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069\\u061C]', 'gu')

/** Clean title (one line, no controls/bidi, at most 200 characters) or `null` if nothing is left. */
export function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(CONTROL_OR_BIDI, ' ').replace(/\s+/g, ' ').trim()
  if (clean === '') return null
  return clampText(clean, TITLE_MAX_CHARS).text.trimEnd()
}

/** Validates the renderer `patch` (untrusted). */
export function parseMetaPatch(v: unknown): ClaudeSessionMetaPatch {
  const bad = (): never => {
    throw new UserError(t().claudeHost.request.invalid(t().claudeHost.request.parts.sessionMeta))
  }
  if (!isRecord(v)) return bad()
  const out: ClaudeSessionMetaPatch = {}
  if (v.favorite !== undefined) out.favorite = typeof v.favorite === 'boolean' ? v.favorite : bad()
  if (v.title !== undefined) {
    if (v.title !== null && typeof v.title !== 'string') bad()
    // Empty/only spaces/only controls text = go back to the automatic title.
    out.title = sanitizeTitle(v.title)
  }
  return out
}

/** File content → map; drops what does not have the expected shape. */
export function parseSessionMeta(raw: unknown): SessionMeta {
  const meta: SessionMeta = new Map()
  if (!isRecord(raw) || !isRecord(raw.sessions)) return meta
  for (const [id, value] of Object.entries(raw.sessions)) {
    if (!isSessionId(id) || !isRecord(value)) continue
    const favorite = value.favorite === true
    const title = sanitizeTitle(value.title)
    if (!favorite && title === null) continue
    meta.set(id, { favorite, ...(title !== null ? { title } : {}) })
  }
  // Past the cap: the last ones stay (the most recently touched, which `applyMetaPatch` moves to the end).
  while (meta.size > MAX_META_ENTRIES) meta.delete(meta.keys().next().value as string)
  return meta
}

export function serializeSessionMeta(meta: SessionMeta): { version: 1; sessions: Record<string, SessionMetaEntry> } {
  return { version: 1, sessions: Object.fromEntries(meta) }
}

/** Applies the `patch` into a new map (an entry with no favorite nor title is dropped). The touched entry goes last. */
export function applyMetaPatch(meta: SessionMeta, sessionId: string, patch: ClaudeSessionMetaPatch): SessionMeta {
  const next: SessionMeta = new Map(meta)
  const previous = next.get(sessionId)
  const favorite = patch.favorite ?? previous?.favorite ?? false
  const title = patch.title !== undefined ? sanitizeTitle(patch.title) : (previous?.title ?? null)
  next.delete(sessionId)
  if (favorite || title !== null) next.set(sessionId, { favorite, ...(title !== null ? { title } : {}) })
  while (next.size > MAX_META_ENTRIES) next.delete(next.keys().next().value as string)
  return next
}

/** One file per folder, with serialized reads/writes (two changes in a row do not lose each other). */
export class SessionMetaStore {
  private readonly queue = new KeyedSerialQueue()

  /** `dir` = `<userData>/claude`. */
  constructor(private readonly dir: string) {}

  private path(root: string): string {
    return join(this.dir, sessionFileName(root))
  }

  private async read(root: string): Promise<SessionMeta> {
    try {
      return parseSessionMeta(JSON.parse(await readFile(this.path(root), 'utf8')))
    } catch {
      // Missing or corrupted: starts empty (the next `update` rewrites a valid file).
      return new Map()
    }
  }

  private serialize<T>(root: string, job: () => Promise<T>): Promise<T> {
    return this.queue.run(this.path(root), job)
  }

  load(root: string): Promise<SessionMeta> {
    return this.serialize(root, () => this.read(root))
  }

  /** Copies the entry from `from` to `to` (the session got another id, e.g. rewind to the start). */
  copy(root: string, from: string, to: string): Promise<void> {
    return this.serialize(root, async () => {
      const entry = (await this.read(root)).get(from)
      if (!entry) return
      const next = applyMetaPatch(await this.read(root), to, { favorite: entry.favorite, title: entry.title ?? null })
      writeJsonAtomicSync(this.path(root), serializeSessionMeta(next))
    })
  }

  update(root: string, sessionId: string, patch: ClaudeSessionMetaPatch): Promise<SessionMeta> {
    return this.serialize(root, async () => {
      const next = applyMetaPatch(await this.read(root), sessionId, patch)
      writeJsonAtomicSync(this.path(root), serializeSessionMeta(next))
      return next
    })
  }
}

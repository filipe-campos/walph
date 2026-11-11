// `@file`, `@folder/` and `@file#L10-20` mentions of the prompt box: detection for the popup, insertion and conversion
// into attachments. All pure; main still validates that the path is inside the window folder (this check is only
// comfort).
import type { ClaudeAttachment } from '@shared/types'
import { rankPaths } from './fuzzyPath'
import { isInside, sepOf } from './path'

export interface MentionRange {
  startLine: number
  endLine: number
}

/** `@src/a.ts`, `@src/a.ts#L10-20`, `@src/a.ts#L10`; a path with a space goes in quotes: `@"my folder/a.ts"`. */
export function formatMention(relPath: string, range?: MentionRange): string {
  const path = /\s/.test(relPath) ? `"${relPath}"` : relPath
  if (!range) return `@${path}`
  const { startLine, endLine } = range
  return `@${path}#L${startLine}${endLine > startLine ? `-${endLine}` : ''}`
}

export interface ActiveMention {
  /** Position of the `@`. */
  start: number
  /** End of the span to replace (up to the next space after the cursor). */
  end: number
  /** What was typed after the `@`, up to the cursor. */
  query: string
}

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch)

/**
 * Mention being edited at the cursor (to open the popup), or `null`. An `@` in the middle of a word (e-mail) does not
 * count.
 */
export function activeMention(text: string, caret: number): ActiveMention | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i]
    if (isSpace(ch)) return null
    if (ch === '#' || ch === '"') return null
    if (ch === '@') {
      if (i > 0 && !isSpace(text[i - 1])) return null
      let end = caret
      while (end < text.length && !isSpace(text[end])) end++
      return { start: i, end, query: text.slice(i + 1, caret) }
    }
  }
  return null
}

/**
 * Replaces the mention being edited with the chosen item. A file gets a space after; a folder ends in `/` and stays
 * open.
 */
export function applyMention(
  text: string,
  mention: ActiveMention,
  relPath: string,
  isDir: boolean
): { text: string; caret: number } {
  const inserted = formatMention(relPath) + (isDir ? '' : ' ')
  const next = text.slice(0, mention.start) + inserted + text.slice(mention.end)
  return { text: next, caret: mention.start + inserted.length }
}

/** Folders that contain the files (`a/b/c.ts` → `a/`, `a/b/`), with a trailing `/`, sorted. */
export function deriveFolders(files: readonly string[]): string[] {
  const dirs = new Set<string>()
  for (const file of files) {
    let idx = file.indexOf('/')
    while (idx >= 0) {
      dirs.add(file.slice(0, idx + 1))
      idx = file.indexOf('/', idx + 1)
    }
  }
  return [...dirs].sort()
}

export interface MentionCandidate {
  path: string
  isDir: boolean
  matches: number[]
}

/** Best files and folders for the query (a folder ends in `/`); an empty query lists the first ones. */
export function mentionCandidates(
  files: readonly string[],
  folders: readonly string[],
  query: string,
  limit: number
): MentionCandidate[] {
  const q = query.replace(/^"/, '')
  if (!q) {
    const top = [...folders.filter((f) => f.indexOf('/') === f.length - 1), ...files.filter((f) => !f.includes('/'))]
    return top.slice(0, limit).map((path) => ({ path, isDir: path.endsWith('/'), matches: [] }))
  }
  // Folders compete without the trailing slash (the name matches like a file) and come back with it.
  const all = [...folders.map((f) => f.slice(0, -1)), ...files]
  const dirSet = new Set(folders.map((f) => f.slice(0, -1)))
  return rankPaths(q, all, limit).map(({ path, matches }) => {
    const isDir = dirSet.has(path)
    return { path: isDir ? `${path}/` : path, isDir, matches }
  })
}

/**
 * Absolute path of `raw` (relative to the window folder or absolute) with `.` and `..` resolved, or `null` if it leaves
 * the folder. The resolution is textual: main still checks the real file.
 */
export function resolveInside(root: string, raw: string): string | null {
  const full = resolvePath(root, raw)
  const fold = (p: string): string => (sepOf(root) === '\\' ? p.toLowerCase() : p)
  return isInside(fold(root), fold(full)) ? full : null
}

/**
 * Absolute path of `raw` (relative to the window folder or absolute) with `.` and `..` resolved, without checking the
 * folder.
 */
export function resolvePath(root: string, raw: string): string {
  const sep = sepOf(root)
  const absolute = /^([\\/]|[A-Za-z]:[\\/])/.test(raw)
  const parts = (absolute ? raw : `${root}${sep}${raw}`).split(/[\\/]/)
  const out: string[] = []
  parts.forEach((part, i) => {
    // The first item is the prefix ('' for the POSIX root, 'C:' on Windows): it is never discarded.
    if (i === 0) return void out.push(part)
    if (part === '' || part === '.') return
    if (part === '..') {
      if (out.length > 1) out.pop()
      return
    }
    out.push(part)
  })
  return out.length === 1 && out[0] === '' ? sep : out.join(sep)
}

const MENTION_RE = /(^|\s)@(?:"([^"\n]+)"|([^\s#"]+))(?:#L(\d+)(?:-(\d+))?)?/g

/**
 * Attachments of the mentions in the text. `isKnown(relPath)` filters out what is not a project file/folder
 * (`@someone`, `@param`);
 * without it every mention becomes an attachment. Repeats become a single one.
 */
export function parseMentions(text: string, root: string, isKnown?: (relPath: string) => boolean): ClaudeAttachment[] {
  const found: ClaudeAttachment[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) {
    const rel = m[2] ?? (m[3] ?? '').replace(/[.,;:!?)\]]+$/, '')
    if (!rel) continue
    const relClean = rel.replace(/\/+$/, '')
    if (isKnown && !isKnown(rel) && !isKnown(relClean)) continue
    const path = resolveInside(root, relClean)
    if (!path) continue
    const attachment: ClaudeAttachment = { path }
    if (m[4]) {
      let start = Number(m[4])
      let end = m[5] ? Number(m[5]) : start
      if (start < 1) continue
      if (end < start) [start, end] = [end, start]
      attachment.startLine = start
      attachment.endLine = end
    }
    const key = `${path}#${attachment.startLine ?? ''}-${attachment.endLine ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push(attachment)
  }
  return found
}

// File paths cited by Claude in markdown (`src/app.ts:42`): textual recognition and resolution inside the
// window folder. The text comes from the model (untrusted): only what fits a file reference becomes a link and the
// final
// path has to stay inside the folder; the UI still checks the disk before opening.
import { hasControl } from '@shared/controlChars'
import { resolveInside, resolvePath } from './claudeMentions'

export interface FileRef {
  /** Absolute, inside the window folder. */
  path: string
  /** Line (from 1) and column (from 1), when cited. */
  line?: number
  column?: number
}

// Without a known extension and without a slash, `console.log` or `a.b` would come out as files.
const KNOWN_EXT =
  /\.(?:[cm]?[jt]sx?|json[c5]?|md|mdx|css|scss|less|html?|vue|svelte|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|sh|zsh|ya?ml|toml|xml|sql|txt|lock|env|gradle|conf|ini|mjs|cjs|prisma|graphql|gql)$/i

const REF_RE = /^(.+?)(?::(\d+)(?::(\d+))?|#L(\d+)(?:-\d+)?)?$/

const ABSOLUTE = /^([\\/]|[A-Za-z]:[\\/])/

/**
 * File reference in `text` (content of a `code` or of a link), or `null` if it does not look like a path.
 * `href` (target of a markdown link, where the author chose the target): accepts a name without a slash or a known
 * extension, an absolute path outside the folder (opening only reads; the UI checks it exists) and spaces.
 */
export function parseFileRef(text: string, root: string, options: { href?: boolean } = {}): FileRef | null {
  const trimmed = text.trim()
  if (
    !trimmed ||
    trimmed.length > 300 ||
    (!options.href && /\s/.test(trimmed)) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  )
    return null
  const m = REF_RE.exec(trimmed)
  if (!m) return null
  const raw = m[1]
  if (raw === undefined) return null
  if (!options.href && !/[\\/]/.test(raw) && !KNOWN_EXT.test(raw)) return null
  // `//`, `*`, `<`… indicate glob/regex/HTML, not a path.
  if (/[*?<>|"`$(){}[\]]/.test(raw) || raw.startsWith('//') || raw.endsWith('/')) return null
  const path = options.href && ABSOLUTE.test(raw) ? resolvePath(root, raw) : resolveInside(root, raw)
  if (!path) return null
  const line = m[2] ?? m[4]
  const ref: FileRef = { path }
  if (line && Number(line) >= 1) ref.line = Number(line)
  if (m[3] && Number(m[3]) >= 1) ref.column = Number(m[3])
  return ref
}

export type LinkTarget = { kind: 'external'; url: string } | { kind: 'file'; ref: FileRef }

// A real `scheme:`, without confusing `file.ts:10` (scheme "file.ts") or `C:\x` (drive letter).
const SCHEME = /^([a-z][a-z0-9+.-]+):(?!\d+(?::\d+)?$)/i

/**
 * A link `href` can become clickable (`data-href`): without a scheme, or http/https/mailto/file; never `javascript:` &
 * co.
 */
export function isLinkableHref(href: string): boolean {
  const value = href.trim()
  if (!value || value.length > 2000 || value.startsWith('#') || hasControl(value)) return false
  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase()
  return !scheme || scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'file'
}

/**
 * Target of a link in Claude's markdown: external URL (http/https/mailto) or file (path, `file://`); the rest `null`.
 */
export function parseHref(href: string, root: string): LinkTarget | null {
  const value = href.trim()
  if (!value || value.startsWith('#') || value.startsWith('//')) return null
  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase()
  if (scheme === 'http' || scheme === 'https') {
    try {
      return { kind: 'external', url: new URL(value).href }
    } catch {
      return null
    }
  }
  if (scheme === 'mailto') return { kind: 'external', url: value }
  let path = value
  if (scheme === 'file') {
    try {
      const url = new URL(value)
      if (url.host && url.host !== 'localhost') return null
      path = decodeURIComponent(url.pathname).replace(/^\/(?=[A-Za-z]:)/, '') + url.hash
    } catch {
      return null
    }
  } else if (scheme) {
    return null
  } else {
    try {
      path = decodeURI(value)
    } catch {
      // A stray `%`: the raw text counts.
    }
  }
  const ref = parseFileRef(path, root, { href: true })
  return ref ? { kind: 'file', ref } : null
}

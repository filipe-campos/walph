// Quick Open list with an empty query: open → recent → the rest, without duplicates. Pure data (no React).
import { t } from '@shared/i18n'
import { sepOf } from './path'

export interface QuickFile {
  /** Path relative to the folder, always with `/` (outside the folder: the normalized absolute path). */
  rel: string
  abs: string
  tag?: string | undefined
}

export interface QuickFilesInput {
  root: string
  /** Relative with `/`, as they come from main. */
  files: string[]
  truncated: boolean
  /** Absolute paths of the open file tabs. */
  openPaths: string[]
  /** MRU (absolute), most recent first. */
  recent: string[]
}

// Roots like `/` or `C:\` already end with a separator; on the others it is appended.
function base(root: string): string {
  return /[\\/]$/.test(root) ? root : root + sepOf(root)
}

export function toAbs(root: string, rel: string): string {
  const sep = sepOf(root)
  return base(root) + (sep === '/' ? rel : rel.replaceAll('/', sep))
}

/** Relative with `/`; paths outside the folder come back absolute (normalized). */
export function toRel(root: string, abs: string): string {
  const b = base(root)
  return (abs.startsWith(b) ? abs.slice(b.length) : abs).replaceAll('\\', '/')
}

const isInsideRoot = (root: string, abs: string): boolean => abs.startsWith(base(root))

// Alphabetical order computed once per list (the empty query reopens on every ⌘P; sorting 10k paths costs).
const sortedCache = new WeakMap<string[], string[]>()
function sortedFiles(files: string[]): string[] {
  let sorted = sortedCache.get(files)
  if (!sorted) {
    sorted = [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    sortedCache.set(files, sorted)
  }
  return sorted
}

export function emptyQueryFiles(input: QuickFilesInput, limit: number): QuickFile[] {
  const { root, files, truncated } = input
  const known = new Set(files)
  const recentRank = new Map(input.recent.map((p, i) => [p, i]))
  const open = [...input.openPaths].sort((a, b) => (recentRank.get(a) ?? Infinity) - (recentRank.get(b) ?? Infinity))
  const seen = new Set<string>()
  const out: QuickFile[] = []
  const add = (rel: string, abs: string, tag?: QuickFile['tag']): void => {
    if (seen.has(rel) || out.length >= limit) return
    seen.add(rel)
    out.push({ rel, abs, tag })
  }
  const tags = t().quickInput.files
  for (const abs of open) add(toRel(root, abs), abs, tags.open)
  for (const abs of input.recent) {
    const rel = toRel(root, abs)
    // With the full list, hides recent ones that no longer exist (or that .gitignore excludes).
    if (truncated || (isInsideRoot(root, abs) && known.has(rel))) add(rel, abs, tags.recentlyOpened)
  }
  for (const rel of sortedFiles(files)) add(rel, toAbs(root, rel))
  return out
}

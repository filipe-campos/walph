import { posix, win32 } from 'node:path'
import { globToRegExp } from './glob'
import { isInside } from '@shared/pathCompare'
import { uriToPath } from './uri'

/** LSP `FileChangeType`. */
export type WatchedType = 1 | 2 | 3

export interface WatchedChange {
  /** Native absolute path. */
  path: string
  type: WatchedType
}

/** A `FileSystemWatcher` registered by the server. `base === null` = relative to the window folder. */
export interface WatchSpec {
  base: string | null
  regex: RegExp
  /** Mask: create=1, change=2, delete=4. */
  kind: number
}

export const WATCH_METHOD = 'workspace/didChangeWatchedFiles'
const DEFAULT_KIND = 7
/** Cap per registration: a server cannot make us compile thousands of globs. */
const MAX_WATCHERS = 200

const bitOf = (type: WatchedType): number => 1 << (type - 1)

/** Reads the `registerOptions` of `workspace/didChangeWatchedFiles`; invalid entries are ignored. */
export function parseWatchers(options: unknown, platform: string = process.platform): WatchSpec[] {
  const list = (options as { watchers?: unknown } | null | undefined)?.watchers
  if (!Array.isArray(list)) return []
  const ignoreCase = platform === 'win32' || platform === 'darwin'
  const specs: WatchSpec[] = []
  for (const item of list.slice(0, MAX_WATCHERS)) {
    const w = item as { globPattern?: unknown; kind?: unknown } | null
    const glob = w?.globPattern
    let pattern: unknown = glob
    let base: string | null = null
    if (glob && typeof glob === 'object') {
      const rel = glob as { baseUri?: unknown; pattern?: unknown }
      const uri = typeof rel.baseUri === 'string' ? rel.baseUri : (rel.baseUri as { uri?: unknown } | undefined)?.uri
      base = typeof uri === 'string' ? uriToPath(uri, platform) : null
      if (base === null) continue
      pattern = rel.pattern
    }
    if (typeof pattern !== 'string') continue
    const regex = globToRegExp(pattern, ignoreCase)
    if (!regex) continue
    const kind = typeof w?.kind === 'number' && Number.isInteger(w.kind) && w.kind >= 1 ? w.kind & 7 : DEFAULT_KIND
    if (kind === 0) continue
    specs.push({ base, regex, kind })
  }
  return specs
}

/** Path of `path` relative to `base`, with `/`; `null` if outside (lexical comparison, like `isInside`). */
export function relativePosix(base: string, path: string, platform: string = process.platform): string | null {
  if (!isInside(base, path, { platform })) return null
  const mod = platform === 'win32' ? win32 : posix
  const baseParts = mod.normalize(base).split(mod.sep).filter(Boolean)
  return mod.normalize(path).split(mod.sep).filter(Boolean).slice(baseParts.length).join('/')
}

/** `true` if some watcher wants this change. */
export function matchesWatch(
  specs: readonly WatchSpec[],
  change: WatchedChange,
  root: string,
  platform: string = process.platform
): boolean {
  const bit = bitOf(change.type)
  for (const spec of specs) {
    if (!(spec.kind & bit)) continue
    const rel = relativePosix(spec.base ?? root, change.path, platform)
    if (rel && spec.regex.test(rel)) return true
  }
  return false
}

export const toWatchedType = (type: 'add' | 'change' | 'unlink'): WatchedType =>
  type === 'add' ? 1 : type === 'change' ? 2 : 3

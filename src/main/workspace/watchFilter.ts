import { globToRegExp } from '../lsp/glob'

/**
 * Always ignored, regardless of the settings: the watcher must never look at git objects, `node_modules` nor the Finder
 * churn. What git needs (HEAD, index, refs, packed-refs, MERGE_HEAD…) stays watched.
 */
export const FLOOR_WATCH_IGNORES: readonly string[] = [
  '**/node_modules/**',
  '**/.git/objects/**',
  '**/.git/logs/**',
  '**/.git/hooks/**',
  '**/.git/lfs/**',
  '**/.git/subtree-cache/**',
  '**/.git/modules/**/objects/**',
  '**/.DS_Store'
]

/** Same semantics as VS Code `files.exclude`: relative to the root; `**\/x` applies at any level. */
function normalizeGlob(raw: string): string | null {
  const clean = raw
    .trim()
    .replaceAll('\\', '/')
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '')
  if (!clean) return null
  if (clean.startsWith('**/') || clean.startsWith('/')) return clean.replace(/^\/+/, '')
  return clean
}

/**
 * Globs handed to the watcher (picomatch, relative to the root): floor + `files.watcherExclude`. A pattern that hides
 * `.git` itself is dropped: without it the Git panel would not know that HEAD/index changed.
 */
export function buildWatchIgnoreGlobs(settingGlobs: readonly string[]): string[] {
  const out = new Set<string>(FLOOR_WATCH_IGNORES)
  for (const raw of settingGlobs) {
    const glob = normalizeGlob(raw)
    if (!glob) continue
    const regex = globToRegExp(glob)
    if (!regex) continue
    if (regex.test('.git') || regex.test('.git/HEAD') || regex.test('.git/index')) continue
    out.add(glob)
    // A folder glob ("**/dist") also covers its contents.
    if (!glob.endsWith('/**') && !glob.endsWith('*')) out.add(`${glob}/**`)
  }
  return [...out]
}

/**
 * Backup filter in JS (the native watcher already prunes, but this ensures the same criterion on any backend and in
 * tests). Receives the path RELATIVE to the root, with `/`. Matches if it or any ancestor matches a glob.
 */
export function createIgnoreMatcher(globs: readonly string[]): (relPath: string) => boolean {
  const regexes = globs.map((g) => globToRegExp(g)).filter((r): r is RegExp => r !== null)
  // `**/x/**` does not match "x" alone; testing the prefix + "/" covers the folder itself (a file with that name also
  // matches).
  return (relPath) => {
    if (!relPath) return false
    const parts = relPath.split('/')
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join('/')
      for (const r of regexes) if (r.test(prefix) || r.test(`${prefix}/`)) return true
    }
    return false
  }
}

/** Stable key of the glob set: restart the watcher only when it changes. */
export function ignoreKey(globs: readonly string[]): string {
  return [...globs].sort().join('\n')
}

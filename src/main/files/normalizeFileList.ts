import { basename } from 'node:path'

/**
 * Normalizes a path printed by rg: without a leading `./` and always with `/`. Only replaces `\` on Windows (where rg
 * uses it as the separator): on POSIX `\` is a valid file name character.
 */
export function normalizeRgPath(raw: string, isWindows = false): string {
  let path = isWindows ? raw.replace(/\\/g, '/') : raw
  while (path.startsWith('./')) path = path.slice(2)
  return path
}

/**
 * Consumes a chunk of the `rg --files --null` output (paths separated by NUL).
 * Returns the complete paths already normalized and the rest (partial path) to prepend to the next chunk.
 */
export function drainRgPaths(pending: string, chunk: string, isWindows = false): { paths: string[]; rest: string } {
  const parts = (pending + chunk).split('\0')
  const rest = parts.pop() ?? ''
  const paths: string[] = []
  for (const part of parts) {
    const path = normalizeRgPath(part, isWindows)
    if (path) paths.push(path)
  }
  return { paths, rest }
}

const IGNORE_FILES = new Set(['.gitignore', '.ignore', '.rgignore'])
const STRUCTURE_EVENTS = new Set(['add', 'unlink', 'addDir', 'unlinkDir'])

/**
 * Decides whether a watcher event makes the file list (Quick Open cache) stale:
 * creation/removal of files and folders, or a change in ignore files. Events inside `.git` do not count.
 */
export function shouldInvalidateFileList(event: string, path: string): boolean {
  if (/(^|[\\/])\.git([\\/]|$)/.test(path)) return false
  if (STRUCTURE_EVENTS.has(event)) return true
  return IGNORE_FILES.has(basename(path.replace(/\\/g, '/')))
}

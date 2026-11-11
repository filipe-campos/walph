import { sessionFileName } from './sessionFile'

// Sessions of folders the user stopped opening serve nobody; 90 days covers vacations and seasonal projects.
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

const SESSION_FILE = /^[0-9a-f]{64}\.json$/

export function isSessionStale(mtimeMs: number, now: number): boolean {
  return Number.isFinite(mtimeMs) && now - mtimeMs > SESSION_MAX_AGE_MS
}

export interface SessionFileInfo {
  name: string
  mtimeMs: number
}

/**
 * Session files to delete: old ones whose folder is not in the recents, in the saved windows nor open now (`live`).
 * The name is a hash, so the comparison is by the name each referenced folder would produce; non-session names never
 * enter.
 */
export function planSessionPrune(
  files: readonly SessionFileInfo[],
  recent: readonly string[],
  windows: readonly string[],
  live: readonly string[],
  now: number,
  platform: string = process.platform
): string[] {
  const referenced = new Set([...recent, ...windows, ...live].map((root) => sessionFileName(root, platform)))
  return files
    .filter((f) => SESSION_FILE.test(f.name) && isSessionStale(f.mtimeMs, now) && !referenced.has(f.name))
    .map((f) => f.name)
}

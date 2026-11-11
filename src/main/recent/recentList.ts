import { isFiniteNumber, isNonEmptyString } from '@shared/guards'
import { isAbsolute } from 'node:path'
import type { RecentFolder } from '@shared/types'
import { samePath } from '@shared/pathCompare'

const MAX_RECENT = 20

/**
 * Puts `path` on top of the list, without duplicating (compared by `samePath`) and respecting the limit. `lastOpened` =
 * `now`; the branch of the previous entry of the same folder is kept (only a view of the folder knows the new branch).
 */
export function touchRecent(
  list: readonly RecentFolder[],
  path: string,
  now: number,
  max = MAX_RECENT,
  platform: string = process.platform
): RecentFolder[] {
  const previous = list.find((f) => samePath(f.path, path, platform))
  const entry: RecentFolder = { path, lastOpened: now, branch: previous?.branch ?? null }
  return [entry, ...list.filter((f) => !samePath(f.path, path, platform))].slice(0, max)
}

export function removeRecent(
  list: readonly RecentFolder[],
  path: string,
  platform: string = process.platform
): RecentFolder[] {
  return list.filter((f) => !samePath(f.path, path, platform))
}

/**
 * Updates the branch of a folder already in the list, without reordering. Returns the SAME list (reference) when there
 * is nothing to change: the folder is not in the list or the branch is the same. The caller only writes/notifies if the
 * result is different.
 */
export function setRecentBranch(
  list: readonly RecentFolder[],
  path: string,
  branch: string | null,
  platform: string = process.platform
): readonly RecentFolder[] {
  const index = list.findIndex((f) => samePath(f.path, path, platform))
  if (index === -1 || list[index]?.branch === branch) return list
  return list.map((f, i) => (i === index ? { ...f, branch } : f))
}

function sanitizeEntry(item: unknown): RecentFolder | null {
  // Old format (v1): the entry was just the path.
  if (typeof item === 'string') return item && isAbsolute(item) ? { path: item, lastOpened: null, branch: null } : null
  if (!item || typeof item !== 'object') return null
  const { path, lastOpened, branch } = item as Record<string, unknown>
  if (!isNonEmptyString(path) || !isAbsolute(path)) return null
  return {
    path,
    lastOpened: isFiniteNumber(lastOpened) && lastOpened >= 0 ? lastOpened : null,
    branch: typeof branch === 'string' && branch.length > 0 && branch.length <= 250 ? branch : null
  }
}

/**
 * Reads the list from disk: accepts `{ folders: [...] }` or the bare array, with `{ path, lastOpened, branch }` entries
 * (v2) or just the path (v1); discards whatever is not an absolute path, and duplicates.
 */
export function sanitizeRecent(value: unknown, max = MAX_RECENT, platform: string = process.platform): RecentFolder[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { folders?: unknown }).folders)
      ? (value as { folders: unknown[] }).folders
      : []
  const result: RecentFolder[] = []
  for (const item of raw) {
    const entry = sanitizeEntry(item)
    if (!entry) continue
    // Keeps the first occurrence (the most recent one).
    if (result.some((f) => samePath(f.path, entry.path, platform))) continue
    result.push(entry)
    if (result.length >= max) break
  }
  return result
}

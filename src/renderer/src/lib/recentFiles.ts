// Recently opened files (MRU) per folder, persisted in localStorage.
import { isRecord } from '@shared/guards'
import { isInside, replacePrefix } from './path'

const KEY = 'walph.recentFiles'
export const RECENT_FILES_MAX = 50
const ROOTS_MAX = 20

/** Moves `path` to the start (most recent), without duplicates and respecting the limit. */
export function touchRecent(list: readonly string[], path: string, max = RECENT_FILES_MAX): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, max)
}

export function forgetRecent(list: readonly string[], path: string): string[] {
  return list.filter((p) => !isInside(path, p))
}

export function renameRecent(list: readonly string[], from: string, to: string): string[] {
  return list.map((p) => (isInside(from, p) ? replacePrefix(p, from, to) : p))
}

function readAll(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return isRecord(raw) ? (raw as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

export function loadRecentFiles(root: string): string[] {
  const list = readAll()[root]
  return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, RECENT_FILES_MAX) : []
}

export function saveRecentFiles(root: string, list: readonly string[]): void {
  try {
    const all = readAll()
    delete all[root] // reinserts at the end: the oldest folders are the first to drop off the limit
    all[root] = [...list]
    const roots = Object.keys(all)
    for (const old of roots.slice(0, Math.max(roots.length - ROOTS_MAX, 0))) delete all[old]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // no localStorage: the recent ones only last for the session
  }
}

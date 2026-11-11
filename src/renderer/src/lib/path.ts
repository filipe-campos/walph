// Path utilities for the renderer (which has no access to Node's `path` module).
// The paths always come from the main process, already in the native OS format.

import { isInside as sharedIsInside, pathKey as sharedPathKey } from '@shared/pathCompare'

export function sepOf(path: string): string {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/'
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function dirname(path: string): string {
  const sep = sepOf(path)
  const idx = path.lastIndexOf(sep)
  if (idx <= 0) return sep === '/' ? '/' : path
  // On Windows "C:" is the current directory of the drive; the root needs to keep the separator ("C:\\").
  if (sep === '\\' && idx === 2 && path[1] === ':') return path.slice(0, 3)
  return path.slice(0, idx)
}

/** Folder of a relative path with `/` (`src/lib/a.ts` → `src/lib`), empty at the root; trailing separator ignored. */
export function parentOf(path: string): string {
  const trimmed = path.replace(/\/$/, '')
  const slash = trimmed.lastIndexOf('/')
  return slash < 0 ? '' : trimmed.slice(0, slash)
}

/**
 * `path` is `root` itself or is inside it (`@shared/pathCompare`). Exact in case and Unicode form: the caller
 * cuts the prefix by the length of `root` (`relativeTo`, `replacePrefix`), and NFC changes the length.
 */
export function isInside(root: string, path: string): boolean {
  const platform = sepOf(root) === '\\' ? 'win32' : 'linux'
  return sharedIsInside(root, path, { platform, caseSensitive: true, nfc: false })
}

export function relativeTo(root: string, path: string): string {
  if (path === root) return ''
  if (!isInside(root, path)) return path
  return path.slice(root.endsWith(sepOf(root)) ? root.length : root.length + 1)
}

/** Replaces the `from` prefix with `to` (used when renaming folders with open files). */
export function replacePrefix(path: string, from: string, to: string): string {
  return path === from ? to : to + path.slice(from.length)
}

/** Comparison key of main (`@shared/pathCompare`); here the platform is required (`api.platform`). */
export function pathKey(path: string, platform: string): string {
  return sharedPathKey(path, platform)
}

export function samePath(a: string, b: string, platform: string): boolean {
  return pathKey(a, platform) === pathKey(b, platform)
}

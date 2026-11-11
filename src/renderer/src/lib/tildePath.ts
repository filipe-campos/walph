// Project path in the status bar: the home folder becomes `~` and the path is split into "parent folders" and name.
import { t } from '@shared/i18n'

const isWin = (platform: string): boolean => platform === 'win32'

/** Windows backslashes and `/` count the same; the rest (case) only on Windows, where the file system ignores case. */
function comparable(path: string, platform: string): string {
  return isWin(platform) ? path.replace(/\//g, '\\').toLowerCase() : path
}

/**
 * Replaces the home prefix with `~` (`/Users/ana/app` → `~/app`). Only matches at a folder boundary (`/Users/ana2` is
 * not
 * a child of `/Users/ana`); outside the home, or without a home, returns the path as it came. Trailing separators are
 * kept.
 */
export function tildePath(path: string, home: string, platform: string): string {
  const base = home.replace(/[\\/]+$/, '')
  if (!base) return path
  const a = comparable(path, platform)
  const b = comparable(base, platform)
  if (!a.startsWith(b)) return path
  const rest = path.slice(base.length)
  if (rest === '' || /^[\\/]+$/.test(rest)) return '~'
  return /^[\\/]/.test(rest) ? `~${rest}` : path
}

export interface PathParts {
  /** Parent folders with the trailing separator (empty when there are none). */
  parent: string
  /** Last folder (the project name), or `~`/`/` when the path is just that. */
  leaf: string
}

/** Splits the already displayed path (with `~`) into "parent folders" and the project name. */
export function splitPathParts(display: string): PathParts {
  const trimmed = display.replace(/[\\/]+$/, '')
  if (!trimmed) return { parent: '', leaf: display }
  const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (at < 0) return { parent: '', leaf: trimmed }
  return { parent: trimmed.slice(0, at + 1), leaf: trimmed.slice(at + 1) || trimmed }
}

/** Label of the "show in the file manager" item per OS. */
export function revealLabel(platform: string): string {
  const m = t().app
  if (platform === 'darwin') return m.revealInFinder
  if (isWin(platform)) return m.revealInExplorer
  return m.revealInFolder
}

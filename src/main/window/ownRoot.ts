import type { WebContents } from 'electron'
import { samePath } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { UserError } from '../errors'
import { getWindowRoot } from './windows'

/**
 * Is `root` (from the renderer, hence `unknown`) the view's `owned` folder? Returns main's spelling (`owned`) or
 * `null`.
 * Pure: whoever needs another source for the folder (e.g. `getSenderRoot`) uses this one directly.
 */
export function matchOwnRoot(owned: string | null, root: unknown): string | null {
  if (typeof root !== 'string' || !owned || !samePath(owned, root)) return null
  return owned
}

/** The view's own folder if `root` is it, otherwise `null`. */
export function ownRootOf(wc: WebContents, root: unknown): string | null {
  return matchOwnRoot(getWindowRoot(wc), root)
}

/**
 * The renderer does not choose the folder: only the view's own passes. Returns main's spelling; throws `message`
 * otherwise.
 */
export function assertOwnRoot(wc: WebContents, root: unknown, message: string): string {
  const own = ownRootOf(wc, root)
  if (own === null) throw new UserError(message)
  return own
}

/**
 * The view's own folder (read now, without the renderer's say); throws `message` (default: "open a folder") if none.
 */
export function requireViewRoot(wc: WebContents, message: string = t().files.errors.noFolderOpen): string {
  const root = getWindowRoot(wc)
  if (!root) throw new UserError(message)
  return root
}

import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import { samePath } from '@shared/pathCompare'
import { addRecent, assertFolderOrForget } from '../recent/store'
import {
  dropQueuedStart,
  findWorkspaceByRoot,
  focusWorkspace,
  getWindowRoot,
  markFolderOpened,
  setWindowRoot,
  workspaceOf
} from '../window/windows'
import { isWatchingRoot, watchViewRoot } from './viewWatchers'
import { UserError } from '../errors'

// The workspace already owned this folder (assigned by `createWindow`/restore) and the renderer could not open it:
// it stops owning it, otherwise no other window could open it and the window would stay empty with the folder saved.
function releaseFailedRoot(sender: WebContents, root: string): void {
  dropQueuedStart(sender, root)
  const current = getWindowRoot(sender)
  if (current && samePath(current, root)) setWindowRoot(sender, null)
}

/** If another workspace (of any window) already has `root`, focuses it and returns `true`. */
export function focusIfOpen(sender: WebContents, root: string): boolean {
  const owner = findWorkspaceByRoot(root, workspaceOf(sender))
  if (!owner) return false
  focusWorkspace(owner)
  return true
}

/** Makes `root` the view folder and starts watching it; `false` when another workspace owned the folder (focused). */
export async function openWorkspaceRoot(sender: WebContents, root: string): Promise<boolean> {
  // The window cannot own a folder it cannot open (watcher/files would point at it).
  await assertFolderOrForget(root, () => releaseFailedRoot(sender, root))

  // The folder is unique in the app: if another workspace has it, that one is activated instead of duplicating.
  if (focusIfOpen(sender, root)) return false

  const current = getWindowRoot(sender)
  if (!setWindowRoot(sender, root)) throw new UserError(t().app.errors.unknownWindow)
  // Reloading the window and reopening the same folder keeps the watcher that is already running.
  if (!(current && samePath(current, root) && isWatchingRoot(sender, root))) {
    await watchViewRoot(sender, root)
  }
  addRecent(root)
  markFolderOpened(sender)
  return true
}

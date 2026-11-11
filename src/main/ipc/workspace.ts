import { parseAbsolutePath } from '../fs/validate'
import { t } from '@shared/i18n'
import { pickFolder } from '../window/nativeUi'
import { flushQueuedCommand, getWindowRoot } from '../window/windows'
import { focusIfOpen, openWorkspaceRoot } from '../workspace/openRoot'
import { startViewWatcherReactions } from '../workspace/viewWatchers'
import { handle } from './typed'

const assertAbsolute = (root: unknown): string => parseAbsolutePath(root, t().app.errors.invalidFolder)

export function registerWorkspaceHandlers(): void {
  startViewWatcherReactions()

  // Folder main assigned to this window; read on every call (a reload gets the same one).
  handle('workspace:current', (e) => {
    flushQueuedCommand(e.sender)
    return getWindowRoot(e.sender)
  })

  handle('workspace:openFolder', (e) => pickFolder(e.sender))

  handle('workspace:focusIfOpen', (e, root: unknown) => focusIfOpen(e.sender, assertAbsolute(root)))

  handle('workspace:open', (e, root: unknown) => openWorkspaceRoot(e.sender, assertAbsolute(root)))
}

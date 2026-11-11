import { allViewContents } from '../window/workspaceViews'
import { clearRecent, getRecent, onRecentChange, removeRecentFolder } from '../recent/store'
import { handle } from './typed'
import { send } from '../window/send'
import { isAbsolutePathInput } from '../fs/validate'

export function registerRecentHandlers(): void {
  onRecentChange((folders) => {
    for (const wc of allViewContents())
      send(
        wc,
        'recent:changed',
        folders.map((f) => ({ ...f }))
      )
  })
  handle('recent:list', () => getRecent().map((f) => ({ ...f })))
  handle('recent:remove', (_e, path: unknown) => {
    if (isAbsolutePathInput(path)) removeRecentFolder(path)
  })
  handle('recent:clear', () => clearRecent())
}

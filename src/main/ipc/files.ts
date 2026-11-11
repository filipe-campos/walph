import { ownRootOf } from '../window/ownRoot'
import { getFileList } from '../files/fileListCache'
import { t } from '@shared/i18n'
import { handle } from './typed'
import { UserError } from '../errors'

export function registerFilesHandlers(): void {
  // Only the window's own folder: the cache is invalidated by its watcher, and a root with no owning watcher would go
  // stale.
  handle('files:list', (e, root: unknown) => {
    const own = ownRootOf(e.sender, root)
    if (own === null) {
      return Promise.reject(new UserError(t().files.errors.listOnlyOwnFolder))
    }
    return getFileList(own)
  })
}

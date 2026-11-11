import type { Stats } from 'node:fs'
import { rename } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { samePath } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { describeWriteError } from './describeWriteError'
import { lstatOrNull, moveNoOverwrite } from './moveNoOverwrite'
import { UserError } from '../errors'

/**
 * `true` if `target` is the SAME item as `source` with another spelling (renaming only the case on a file system that
 * ignores case). Requires the same inode: on a case-sensitive volume, `a.txt` and `A.txt` are distinct files.
 */
export function isCaseOnlyRename(
  source: string,
  target: string,
  sourceInfo: Pick<Stats, 'dev' | 'ino'>,
  targetInfo: Pick<Stats, 'dev' | 'ino'>,
  platform: string = process.platform
): boolean {
  return samePath(source, target, platform) && sourceInfo.dev === targetInfo.dev && sourceInfo.ino === targetInfo.ino
}

/** Renames inside the same folder without overwriting another item. Returns the new path. */
export async function renameEntry(path: string, newName: string): Promise<string> {
  const target = join(dirname(path), newName)
  if (target === path) return path
  try {
    const info = await lstatOrNull(path)
    if (!info) throw new UserError(t().files.errors.itemGone(basename(path)))
    const existing = await lstatOrNull(target)
    if (existing) {
      // Only the case changes: the destination `lstat` sees the item itself. `link` would give EEXIST, so it is a
      // plain rename (there is no other file to overwrite).
      if (!isCaseOnlyRename(path, target, info, existing)) throw new UserError(t().files.errors.alreadyExists(newName))
      await rename(path, target)
    } else {
      // link+unlink closes the window between the check and the rename: a file created now is not overwritten.
      await moveNoOverwrite(path, target, info)
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EEXIST' || code === 'ENOTEMPTY')
      throw new UserError(t().files.errors.alreadyExists(newName), { cause: err })
    // UserError passes through; errno (EACCES…) and the rest are translated.
    throw describeWriteError(err, target)
  }
  return target
}

import { basename } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/**
 * Translates the errno of a read/create/list operation (ENOENT, EEXIST, EACCES…) into the current language; a
 * `UserError` already written by us passes through. For writes use `describeWriteError`.
 */
export function describeFsError(err: unknown, path: string): UserError {
  if (err instanceof UserError) return err
  const code = (err as NodeJS.ErrnoException | null)?.code
  const name = basename(path) || path
  const m = t().files.errors
  const cause = { cause: err }
  switch (code) {
    case 'ENOENT':
      return new UserError(m.itemGone(name), cause)
    case 'EEXIST':
    case 'ENOTEMPTY':
      return new UserError(m.alreadyExists(name), cause)
    case 'EACCES':
    case 'EPERM':
      return new UserError(m.accessNoPermission(name), cause)
    case 'ENOTDIR':
      return new UserError(m.accessNotDirInPath(name), cause)
    case 'EISDIR':
      return new UserError(m.accessIsDir(name), cause)
    default:
      return new UserError(m.accessFailed(name, err instanceof Error ? err.message : String(err)), cause)
  }
}

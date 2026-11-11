import { posix, win32 } from 'node:path'
import { isInside, pathTail, samePath } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

export type MovePlan = { kind: 'noop'; path: string } | { kind: 'move'; destination: string }

/**
 * Validates (pure, no disk) moving `source` into `targetDir`. Both already went through `resolveInsideRoot`.
 * Same source folder → no-op; root, a folder into itself or into a descendant → error in the current language.
 */
export function planMove(
  root: string,
  source: string,
  targetDir: string,
  platform: string = process.platform
): MovePlan {
  const mod = platform === 'win32' ? win32 : posix
  if (samePath(root, source, platform)) throw new UserError(t().files.errors.cannotMoveRoot)
  if (samePath(mod.dirname(source), targetDir, platform)) return { kind: 'noop', path: source }
  // Folder into itself or into a descendant (isInside also holds for the equal one).
  if (isInside(source, targetDir, { platform })) throw new UserError(t().files.errors.moveIntoItself)
  return { kind: 'move', destination: mod.join(targetDir, mod.basename(source)) }
}

/** Message for the errno of a move; `null` when the code is not known (falls back to the generic message). */
export function describeMoveError(err: unknown, name: string, platform: string = process.platform): Error | null {
  const code = (err as NodeJS.ErrnoException | null)?.code
  const fail = (message: string): Error => new UserError(message, { cause: err })
  const m = t().files.errors
  switch (code) {
    case 'EXDEV':
      return fail(m.moveOtherVolume)
    case 'ENOENT':
      return fail(m.moveSourceGone)
    case 'EBUSY':
      return fail(m.itemInUse)
    case 'EPERM':
      return fail(platform === 'win32' ? m.itemInUse : m.moveNoPermission)
    case 'EACCES':
      return fail(m.moveNoPermission)
    case 'ENOTEMPTY':
    case 'EEXIST':
    case 'EISDIR':
      return fail(m.alreadyExists(name))
    case 'EINVAL':
      return fail(m.moveIntoItself)
    default:
      return null
  }
}

/** Rewrites `real` (inside `realRoot`) in `root`'s spelling, the one the renderer uses to match tabs/watcher/git. */
export function rebaseUnderRoot(
  root: string,
  realRoot: string,
  real: string,
  platform: string = process.platform
): string {
  const tail = pathTail(realRoot, real, { platform })
  if (!tail) return real
  return (platform === 'win32' ? win32 : posix).join(root, ...tail)
}

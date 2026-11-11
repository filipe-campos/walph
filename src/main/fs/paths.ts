// Paths from the renderer or from Claude (untrusted) are only valid INSIDE the window folder. Besides the lexical
// check (`isInside`), the nearest existing ancestor is resolved with `realpath`: a symlink inside the folder that
// points outside is no shortcut for writing outside it.

import { readlink, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { isInside, pathTail, samePath } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

const outside = (path: string): Error => new UserError(t().files.errors.outsideRoot(path))

const MAX_LINK_HOPS = 40

/** A link's relative target starts from the link's REAL folder (the parent can be a symlink to somewhere else). */
export async function linkTarget(link: string, target: string): Promise<string> {
  const dir = await realpath(dirname(link)).catch(() => dirname(link))
  return resolve(dir, target)
}

/**
 * Nearest existing ancestor (resolved with `realpath`) and the names missing after it. A dangling symlink
 * (`realpath` fails) is followed to the target: writing to it creates the file there, so the target is what counts.
 */
async function nearestExisting(path: string, hops = 0): Promise<{ real: string; rest: string[] } | null> {
  if (hops > MAX_LINK_HOPS) return null
  const rest: string[] = []
  let current = path
  for (;;) {
    try {
      return { real: await realpath(current), rest }
    } catch {
      const target = await readlink(current).catch(() => null)
      if (target !== null) {
        const found = await nearestExisting(await linkTarget(current, target), hops + 1)
        return found && { real: found.real, rest: [...found.rest, ...rest] }
      }
      const parent = dirname(current)
      if (parent === current) return null
      rest.unshift(basename(current))
      current = parent
    }
  }
}

async function nearestExistingRealpath(path: string): Promise<string> {
  const found = await nearestExisting(path)
  if (!found) throw outside(path)
  return found.real
}

/**
 * Canonical form of a path: the nearest existing ancestor by `realpath` and the rest as given. Works for a file that
 * does not exist yet; two paths that lead to the same target (symlinks, `/tmp` and `/private/tmp`) coincide.
 */
export async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path)
  const found = await nearestExisting(absolute)
  return found ? join(found.real, ...found.rest) : absolute
}

/**
 * Normalized absolute path inside `root`, or throws. Accepts a relative one (resolved against `root`). A path
 * in the real spelling of the folder (macOS: `/private/tmp/x` for the folder `/tmp/x`) comes back in the window
 * spelling, which is the one the renderer uses to match the tabs.
 */
export async function resolveInsideRoot(root: string, path: string): Promise<string> {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) throw new UserError(t().files.errors.invalidPath)
  let absolute = resolve(root, path)
  let realRoot: string
  try {
    realRoot = await realpath(root)
  } catch {
    throw new UserError(t().files.errors.rootGone)
  }
  if (!isInside(root, absolute)) {
    const tail = pathTail(realRoot, absolute)
    if (!tail) throw outside(path)
    absolute = join(root, ...tail)
  }
  const realNear = await nearestExistingRealpath(absolute)
  if (!isInside(realRoot, realNear)) throw outside(path)
  return absolute
}

/**
 * Explorer item to rename or send to the trash: strictly inside `root` (never the open folder). Only the PARENT
 * goes through `resolveInsideRoot`: if the item is a symlink (even to outside the folder), the link itself changes.
 */
export async function resolveEntryInsideRoot(root: string, path: string): Promise<string> {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) throw new UserError(t().files.errors.invalidPath)
  const absolute = resolve(root, path)
  if (samePath(root, absolute)) throw new UserError(t().files.errors.cannotChangeRoot)
  const parent = await resolveInsideRoot(root, dirname(absolute))
  return join(parent, basename(absolute))
}

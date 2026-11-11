import type { WebContents } from 'electron'
import { join, relative } from 'node:path'
import { t } from '@shared/i18n'
import type { TextEncoding } from '@shared/types'
import { decodeText, detectEncoding } from '../../fs/encoding'
import { trashPath } from '../../fs/trashPath'
import { selectDiscardTargets } from '../discardTargets'
import { isAbortedGit, isPathNotInRefError } from '../gitErrors'
import { parseStatus } from '../parseStatus'
import { dropRepoTop, findRepoTop, repoTop } from '../repoTop'
import { git, runGit } from '../run'
import { repoRelative, repoRelativeList } from '../validateArgs'
import { UserError } from '../../errors'

/** git file content decoded the way the editor reads the disk (BOM stripped, UTF-16 by BOM): no phantom diff. */
export async function gitFileText(cwd: string, args: string[], encoding?: TextEncoding): Promise<string> {
  const buf = (await runGit(cwd, args, { binary: true })).stdout as Buffer
  return decodeText(buf, encoding ?? detectEncoding(buf))
}

export async function init(sender: WebContents, root: string): Promise<void> {
  await git(root, ['init'], { localOwner: sender })
  dropRepoTop(root)
}

export async function stage(sender: WebContents, root: string, rawPaths: unknown): Promise<void> {
  const top = await repoTop(root)
  await git(top, ['add', '-A', '--', ...repoRelativeList(top, rawPaths)], { localOwner: sender })
}

/** git runs at the repository root: the paths are relative to it. */
export async function unstage(sender: WebContents, root: string, rawPaths: unknown): Promise<void> {
  const top = await repoTop(root)
  const paths = repoRelativeList(top, rawPaths)
  const localOwner = { localOwner: sender }
  try {
    await git(top, ['restore', '--staged', '--', ...paths], localOwner)
  } catch (err) {
    if (isAbortedGit(err)) throw err
    // Repository without any commit: there is no HEAD to restore.
    await git(top, ['rm', '--cached', '-r', '--quiet', '--', ...paths], localOwner)
  }
}

export async function discard(sender: WebContents, root: string, rawPaths: unknown): Promise<void> {
  const top = await repoTop(root)
  const rels = repoRelativeList(top, rawPaths)
  const candidates = parseStatus(
    await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    top
  ).files.map((f) => ({ rel: relative(top, f.path).split('\\').join('/'), index: f.index, workingDir: f.workingDir }))
  const { untracked, tracked } = selectDiscardTargets(candidates, rels)

  if (tracked.length > 0) await git(top, ['restore', '--worktree', '--', ...tracked], { localOwner: sender })
  // Untracked: trash (reversible), never delete for good.
  for (const rel of untracked) await trashPath(join(top, rel))
}

// Index stages in a conflict: 2 = the current version (ours), 3 = the incoming one (theirs).
const REF_PREFIX: Record<string, string> = { HEAD: 'HEAD:', INDEX: ':', OURS: ':2:', THEIRS: ':3:' }

export async function show(root: string, path: unknown, ref: unknown, encoding?: TextEncoding): Promise<string> {
  const top = await repoTop(root)
  const rel = repoRelative(top, path)
  const prefix = typeof ref === 'string' ? REF_PREFIX[ref] : undefined
  if (prefix === undefined) throw new UserError(t().git.errors.invalidRef)
  const spec = `${prefix}${rel}`
  try {
    return await gitFileText(top, ['show', spec], encoding)
  } catch (err) {
    // Only "the path does not exist in that ref" (new/untracked) becomes empty; any other failure reaches the user.
    if (isPathNotInRefError(err)) return ''
    throw err
  }
}

export async function baseline(root: string, path: unknown, encoding?: TextEncoding): Promise<string | null> {
  let top: string
  try {
    top = await findRepoTop(root)
  } catch {
    return null
  }
  const rel = repoRelative(top, path)
  try {
    return await gitFileText(top, ['show', `:${rel}`], encoding)
  } catch (err) {
    // Outside the index (untracked/ignored) or in conflict.
    if (isPathNotInRefError(err)) return null
    throw err
  }
}

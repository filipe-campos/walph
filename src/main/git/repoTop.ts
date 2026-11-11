import { resolve } from 'node:path'
import { t } from '@shared/i18n'
import { forgetIgnored } from './ignoredCache'
import { createRepoTopCache } from './repoTopCache'
import { git } from './run'
import { UserError } from '../errors'

/**
 * Repository root in the same path space as the window folder. `--show-toplevel` resolves symlinks (on macOS `/tmp`
 * → `/private/tmp`) and the renderer paths do not: `--show-cdup` is relative to the folder as it was opened.
 */
async function findRepoTopUncached(root: string): Promise<string> {
  const cdup = (await git(root, ['rev-parse', '--show-cdup'])).replace(/\r?\n$/, '')
  return resolve(root, cdup)
}

// Avoids an extra `rev-parse` on every status/log/baseline; `git init` and git failures invalidate.
const repoTops = createRepoTopCache(findRepoTopUncached)

// git folder (`.git`, or `.git/worktrees/<name>` in a linked worktree), in the same path space as the folder.
const gitDirs = createRepoTopCache(async (root) =>
  resolve(root, (await git(root, ['rev-parse', '--git-dir'])).replace(/\r?\n$/, ''))
)

/** Rejects with git's raw error when the folder is not a repository. */
export function findGitDir(root: string): Promise<string> {
  return gitDirs.get(root)
}

/** Rejects with git's raw error when the folder is not a repository. */
export function findRepoTop(root: string): Promise<string> {
  return repoTops.get(root)
}

export async function repoTop(root: string): Promise<string> {
  try {
    return await findRepoTop(root)
  } catch {
    throw new UserError(t().git.errors.notARepo)
  }
}

/** Only the cached root: `git init` and the git failure do not change the ignored files. */
export function dropRepoTop(root: string): void {
  repoTops.invalidate(root)
  gitDirs.invalidate(root)
}

/** The watcher saw the root `.git` appear/disappear. */
export function invalidateRepoTop(root: string): void {
  forgetIgnored(root)
  repoTops.invalidate(root)
  gitDirs.invalidate(root)
}

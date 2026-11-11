import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import { isRecord } from '@shared/guards'
import type { GitCommitDiff, GitCommitFile, GitLogPage } from '@shared/types'
import { int } from '../../validate/args'
import { hasHead } from '../hasHead'
import { LOG_FORMAT, parseLog } from '../parseLog'
import { parseNameStatus } from '../parseNameStatus'
import { parentsOf } from '../parents'
import { repoTop } from '../repoTop'
import { git } from '../run'
import { assertHash, parseCommitFile, repoRelative } from '../validateArgs'
import { gitFileText } from './worktree'
import { UserError } from '../../errors'

const MAX_LOG_PAGE = 500

export async function commit(sender: WebContents, root: string, message: unknown, options?: unknown): Promise<void> {
  const localOwner = { localOwner: sender }
  if (typeof message !== 'string') throw new UserError(t().git.errors.invalidCommitMessage)
  const amend = isRecord(options) && options.amend === true
  if (!message.trim()) {
    if (!amend) throw new UserError(t().git.errors.enterCommitMessage)
    await git(root, ['commit', '--amend', '--no-edit'], localOwner)
    return
  }
  await git(root, amend ? ['commit', '--amend', '-m', message] : ['commit', '-m', message], localOwner)
}

export async function lastCommitMessage(root: string, rawHash?: unknown): Promise<string | null> {
  const rev = rawHash === undefined ? 'HEAD' : `${assertHash(rawHash)}^{commit}`
  try {
    return (await git(root, ['log', '-1', '--no-show-signature', '--format=%B', rev, '--'])).trimEnd()
  } catch (err) {
    // Without commits `git log` fails: the common path pays a single process.
    if (!(await hasHead(root))) return null
    throw err
  }
}

export async function undoLastCommit(sender: WebContents, root: string): Promise<string> {
  const message = await lastCommitMessage(root)
  if (message === null) throw new UserError(t().git.errors.noCommitToUndo)
  if ((await parentsOf(root, 'HEAD')).length === 0) {
    // Root commit: HEAD~1 does not exist; deleting the branch ref keeps everything in the index.
    // Never `update-ref -d HEAD`: with a detached HEAD that would delete the .git/HEAD file itself.
    let ref: string
    try {
      ref = (await git(root, ['symbolic-ref', '-q', 'HEAD'])).trim()
    } catch {
      throw new UserError(t().git.errors.detachedNoCommitToUndo)
    }
    await git(root, ['update-ref', '-d', ref], { localOwner: sender })
  } else {
    await git(root, ['reset', '--soft', 'HEAD~1'], { localOwner: sender })
  }
  return message
}

export async function log(root: string, rawSkip: unknown, rawLimit: unknown): Promise<GitLogPage> {
  const invalidPagination = t().git.errors.invalidPagination
  const skip = int(rawSkip, { min: 0 }, invalidPagination)
  const limit = int(rawLimit, { min: 1, max: MAX_LOG_PAGE }, invalidPagination)
  let out: string
  try {
    out = await git(root, [
      'log',
      '-z',
      '--no-show-signature',
      `--format=${LOG_FORMAT}`,
      `--skip=${skip}`,
      `--max-count=${limit + 1}`
    ])
  } catch (err) {
    // Without commits `git log` fails: the common path pays a single process; only the failure checks HEAD.
    if (!(await hasHead(root))) return { commits: [], hasMore: false }
    throw err
  }
  const commits = parseLog(out)
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit }
}

export async function commitFiles(root: string, rawHash: unknown): Promise<GitCommitFile[]> {
  const hash = assertHash(rawHash)
  const top = await repoTop(root)
  let parents: string[]
  try {
    parents = await parentsOf(top, hash)
  } catch {
    throw new UserError(t().git.errors.commitNotFound)
  }
  const [firstParent] = parents
  const args =
    firstParent === undefined
      ? ['diff-tree', '--root', '--no-commit-id', '-r', '-z', '--name-status', '-M', '--no-ext-diff', hash]
      : ['diff', '-z', '--name-status', '-M', '--no-ext-diff', firstParent, hash, '--']
  return parseNameStatus(await git(top, args), top)
}

export async function commitDiff(root: string, rawHash: unknown, rawFile: unknown): Promise<GitCommitDiff> {
  const hash = assertHash(rawHash)
  const top = await repoTop(root)
  const file = parseCommitFile(rawFile)
  const path = repoRelative(top, file.path)
  const oldPath = file.oldPath === undefined ? path : repoRelative(top, file.oldPath)

  const hasParent = (await parentsOf(top, hash)).length > 0
  const original = hasParent && file.status[0] !== 'A' ? await gitFileText(top, ['show', `${hash}^:${oldPath}`]) : ''
  const modified = file.status[0] === 'D' ? '' : await gitFileText(top, ['show', `${hash}:${path}`])
  return { original, modified }
}

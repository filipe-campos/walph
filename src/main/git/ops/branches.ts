import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import type { GitBranch } from '@shared/types'
import { hasHead } from '../hasHead'
import { BRANCH_FORMAT, parseBranches } from '../parseBranches'
import { remoteNames } from '../remote'
import { splitRemoteBranch } from '../remoteRefs'
import { git } from '../run'
import { assertBranchName } from '../validateArgs'
import { UserError } from '../../errors'

export async function branches(root: string): Promise<GitBranch[]> {
  if (!(await hasHead(root))) {
    // Repository without commits: there is still the initial (unborn) branch, but for-each-ref does not list it.
    return []
  }
  const out = await git(root, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads', 'refs/remotes'])
  return parseBranches(out)
}

async function refExists(root: string, ref: string): Promise<boolean> {
  try {
    await git(root, ['show-ref', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

export async function checkout(sender: WebContents, root: string, rawName: unknown, remote: unknown): Promise<void> {
  const name = await assertBranchName(root, rawName)
  const localOwner = { localOwner: sender }
  if (remote !== true) {
    await git(root, ['switch', name], localOwner)
    return
  }
  // The remote name is `<remote>/<branch>`; the remote can have `/` in its name, so compare with the real remotes.
  const split = splitRemoteBranch(await remoteNames(root), name)
  if (!split) throw new UserError(t().git.errors.remoteBranchNotFound)
  const local = split.branch
  if (await refExists(root, `refs/heads/${local}`)) await git(root, ['switch', local], localOwner)
  else await git(root, ['switch', '--track', name], localOwner)
}

export async function createBranch(sender: WebContents, root: string, rawName: unknown): Promise<void> {
  const name = await assertBranchName(root, rawName)
  await git(root, ['switch', '-c', name], { localOwner: sender })
}

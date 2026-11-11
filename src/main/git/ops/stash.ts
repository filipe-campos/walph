import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import type { GitStash } from '@shared/types'
import { classifyGitError, type GitErrorContext } from '../gitErrors'
import { STASH_FORMAT, parseStashList } from '../parseStash'
import { git } from '../run'
import { assertHash, assertStashIndex } from '../validateArgs'
import { UserError } from '../../errors'

export async function stashList(root: string): Promise<GitStash[]> {
  return parseStashList(await git(root, ['stash', 'list', '-z', `--format=${STASH_FORMAT}`]))
}

export async function stashSave(sender: WebContents, root: string, message: unknown): Promise<void> {
  const args = ['stash', 'push', '--include-untracked']
  if (typeof message === 'string' && message.trim()) args.push('-m', message.trim())
  const out = await git(root, args, { localOwner: sender })
  // Without changes git exits successfully, it only warns.
  if (/no local changes to save/i.test(out)) throw new UserError(classifyGitError(out))
}

export async function stashOp(
  sender: WebContents,
  root: string,
  op: 'apply' | 'pop' | 'drop',
  index: unknown,
  rawHash: unknown
): Promise<void> {
  const ref = `stash@{${assertStashIndex(index)}}`
  const hash = assertHash(rawHash)
  // The stack may have changed externally since the listing: the index only holds if it still points to that commit.
  let current: string
  try {
    current = (await git(root, ['rev-parse', '--verify', '--quiet', ref])).trim()
  } catch {
    throw new UserError(t().git.errors.stashNotFound)
  }
  if (current.toLowerCase() !== hash.toLowerCase()) {
    throw new UserError(t().git.errors.stashChanged)
  }
  const context: GitErrorContext | undefined = op === 'pop' ? 'stashPop' : op === 'apply' ? 'stashApply' : undefined
  await git(root, ['stash', op, ref], { context, localOwner: sender })
}

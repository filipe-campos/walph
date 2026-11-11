import type { WebContents } from 'electron'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GitRepoOperation } from '@shared/types'
import { t } from '@shared/i18n'
import { UserError } from '../../errors'
import { findGitDir } from '../repoTop'
import { git } from '../run'

// Markers git leaves in its folder while the operation waits for the user (conflicts), in priority order.
const MARKERS: readonly (readonly [string, GitRepoOperation])[] = [
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherryPick'],
  ['REVERT_HEAD', 'revert']
]

const ABORT: Record<GitRepoOperation, string[]> = {
  merge: ['merge', '--abort'],
  rebase: ['rebase', '--abort'],
  cherryPick: ['cherry-pick', '--abort'],
  revert: ['revert', '--abort']
}

/** Merge/rebase/cherry-pick/revert stopped midway, or `null`. Never rejects (outside a repository it is `null`). */
export async function repoOperation(root: string): Promise<GitRepoOperation | null> {
  let dir: string
  try {
    dir = await findGitDir(root)
  } catch {
    return null
  }
  const found = await Promise.all(
    MARKERS.map(([name]) =>
      stat(join(dir, name)).then(
        () => true,
        () => false
      )
    )
  )
  return MARKERS.find((_, i) => found[i])?.[1] ?? null
}

/** "Abort merge" (or rebase, cherry-pick, revert): goes back to the state before the operation. */
export async function abortOperation(sender: WebContents, root: string): Promise<void> {
  const operation = await repoOperation(root)
  if (!operation) throw new UserError(t().git.errors.noOperation)
  await git(root, ABORT[operation], { localOwner: sender })
}

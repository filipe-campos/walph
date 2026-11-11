import type { GitBlame } from '@shared/types'
import { t } from '@shared/i18n'
import { UserError } from '../../errors'
import { GitCommandError } from '../gitErrors'
import { parseBlame } from '../parseBlame'
import { findRepoTop } from '../repoTop'
import { git } from '../run'
import { repoRelative } from '../validateArgs'

const MAX_CONTENTS = 32 * 1024 * 1024

// File without history (untracked, repository without commits, removed from disk): there is nothing to annotate.
const NO_BLAME = [/no such path '.*' in HEAD/i, /no such ref: HEAD/i, /bad revision 'HEAD'/i, /cannot stat path/i]

/**
 * `git blame --porcelain` of the file; with `contents`, annotates that text (the buffer with unsaved changes) from
 * HEAD, and the lines that do not exist there come out as uncommitted. `null` outside a repository or without history.
 */
export async function blame(root: string, rawPath: unknown, rawContents?: unknown): Promise<GitBlame | null> {
  let top: string
  try {
    top = await findRepoTop(root)
  } catch {
    return null
  }
  const rel = repoRelative(top, rawPath)
  if (rawContents !== undefined && (typeof rawContents !== 'string' || rawContents.length > MAX_CONTENTS)) {
    throw new UserError(t().git.errors.invalidContents)
  }
  const args = ['blame', '--porcelain', ...(rawContents === undefined ? [] : ['--contents', '-']), '--', rel]
  try {
    return parseBlame(await git(top, args, rawContents === undefined ? {} : { input: rawContents }))
  } catch (err) {
    if (err instanceof GitCommandError && NO_BLAME.some((re) => re.test(err.stderr))) return null
    throw err
  }
}

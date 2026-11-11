import type { WebContents } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../../errors'
import { isPathNotInRefError } from '../gitErrors'
import { buildPatch, selectRawLines, splitRawLines } from '../rangePatch'
import { repoTop } from '../repoTop'
import { git, runGit } from '../run'
import { lineRanges, repoRelative } from '../validateArgs'
import { stage, unstage } from './worktree'

const MAX_BYTES = 32 * 1024 * 1024

/** Bytes as `latin1` text (1 byte = 1 character, see `rangePatch.ts`); binary (null byte) is refused. */
function asRawText(buf: Buffer): string {
  if (buf.length > MAX_BYTES) throw new UserError(t().git.errors.fileTooLarge)
  if (buf.includes(0)) throw new UserError(t().git.errors.binaryRanges)
  return buf.toString('latin1')
}

/** Blob of `<ref>:<path>`; `null` when the path is not in that ref (new, in conflict, no commits). */
async function blob(top: string, spec: string): Promise<string | null> {
  try {
    return asRawText((await runGit(top, ['cat-file', 'blob', spec], { binary: true })).stdout as Buffer)
  } catch (err) {
    if (isPathNotInRefError(err)) return null
    throw err
  }
}

async function worktreeText(top: string, rel: string): Promise<string | null> {
  try {
    return asRawText(await readFile(join(top, rel)))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Brings the file index from `index` to `target` with a patch (`git apply --cached` checks the current content). */
async function patchIndex(
  sender: WebContents,
  top: string,
  rel: string,
  index: string,
  target: string[]
): Promise<void> {
  const patch = buildPatch(rel, splitRawLines(index), target)
  if (!patch) return
  await git(top, ['apply', '--cached', '--whitespace=nowarn', '-'], {
    localOwner: sender,
    input: Buffer.from(patch, 'latin1')
  })
}

/** Stages only the changes in the selected working tree lines. */
export async function stageRanges(
  sender: WebContents,
  root: string,
  rawPath: unknown,
  rawRanges: unknown
): Promise<void> {
  const top = await repoTop(root)
  const rel = repoRelative(top, rawPath)
  const ranges = lineRanges(rawRanges)
  const [index, disk] = await Promise.all([blob(top, `:${rel}`), worktreeText(top, rel)])
  // Outside the index (new, in conflict) or removed from disk: there is no hunk to pick, the whole file goes.
  if (index === null || disk === null) return stage(sender, root, [rawPath])
  await patchIndex(sender, top, rel, index, selectRawLines(index, disk, ranges, 'apply'))
}

/** Unstages only the changes in the selected index lines (the index goes back to HEAD on them). */
export async function unstageRanges(
  sender: WebContents,
  root: string,
  rawPath: unknown,
  rawRanges: unknown
): Promise<void> {
  const top = await repoTop(root)
  const rel = repoRelative(top, rawPath)
  const ranges = lineRanges(rawRanges)
  const index = await blob(top, `:${rel}`)
  if (index === null) return unstage(sender, root, [rawPath])
  const head = await blob(top, `HEAD:${rel}`)
  const target = selectRawLines(head ?? '', index, ranges, 'revert')
  // New file without any staged line: leaves the index (an empty blob would be another file).
  if (head === null && target.length === 0) return unstage(sender, root, [rawPath])
  await patchIndex(sender, top, rel, index, target)
}

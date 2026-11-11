import { t } from '@shared/i18n'
import { isConflictStatus } from '@shared/gitStatusCodes'
import { UserError } from '../errors'

/** Status entry with the path relative to the repository root (`/` separator). */
export interface DiscardCandidate {
  rel: string
  index: string
  workingDir: string
}

export interface DiscardTargets {
  /** Untracked: go to the trash. */
  untracked: string[]
  /** Tracked with a working tree difference: `git restore --worktree`. */
  tracked: string[]
}

/** Decides what to discard among the requested `targets`; the rest (staged only, ignored, missing) is not touched. */
export function selectDiscardTargets(candidates: DiscardCandidate[], targets: Iterable<string>): DiscardTargets {
  const wanted = new Set(targets)
  const result: DiscardTargets = { untracked: [], tracked: [] }
  for (const { rel, index, workingDir } of candidates) {
    if (!wanted.has(rel)) continue
    if (isConflictStatus(index, workingDir)) throw new UserError(t().git.errors.conflictDiscard)
    if (index === '?' && workingDir === '?') result.untracked.push(rel)
    // There is only something to restore when the working tree differs from the index.
    else if (workingDir !== ' ') result.tracked.push(rel)
  }
  return result
}

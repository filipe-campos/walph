import type { GitBranch, GitCommit, GitNetworkOp, GitStash, GitStatus } from '@shared/types'

/** Last commit for the status bar; `message` (full) arrives in a second step. */
interface LastCommit {
  hash: string
  shortHash: string
  author: string
  date: number
  subject: string
  message: string | null
}

/** Git history loaded in pages (`null` in the state = not loaded yet). */
interface GitHistory {
  commits: GitCommit[]
  hasMore: boolean
  loading: boolean
}

/** Clone in progress (one `git clone` per view). */
interface CloneState {
  url: string
  /** Name of the folder that will be created (from the URL validation). */
  name: string
  destination: string | null
}

export interface GitState {
  git: GitStatus | null
  /** Folder whose `git status` failed (the WorkspaceBar shows "no branch" instead of waiting forever). */
  gitFailedRoot: string | null
  /** Local git operation in progress (stage, commit, checkout…): disables the buttons. */
  gitBusy: boolean
  /** Pull/push/sync in progress (progress indicator); `null` = none. */
  gitOperation: GitNetworkOp | null
  /** Folder where the network operation runs: only shows up (and notifies) while it is still the open folder. */
  gitOperationRoot: string | null
  /** Commit box message (in the store so "Undo Last Commit" can give it back). */
  commitMessage: string
  commitAmend: boolean
  /** Branches for the picker (`null` while loading). */
  gitBranches: GitBranch[] | null
  stashes: GitStash[]
  gitHistory: GitHistory | null
  historyOpen: boolean
  /** Last HEAD commit (status bar); `null` without a repository or without commits. */
  lastCommit: LastCommit | null
  /** Clone in progress for this view (`cloneActions.ts`); `null` = none. `destination` comes with the 1st progress. */
  clone: CloneState | null
}

import type { GitState } from '../types/git'

type GlobalKey = 'gitFailedRoot' | 'gitBusy' | 'gitOperation' | 'gitOperationRoot' | 'historyOpen' | 'clone'

export function scopedGitState(): Omit<GitState, GlobalKey> {
  return {
    git: null,
    commitMessage: '',
    commitAmend: false,
    gitBranches: null,
    stashes: [],
    gitHistory: null,
    lastCommit: null
  }
}

export function globalGitState(): Pick<GitState, GlobalKey> {
  return {
    gitFailedRoot: null,
    gitBusy: false,
    gitOperation: null,
    gitOperationRoot: null,
    historyOpen: false,
    clone: null
  }
}

import type { GitStatus } from '@shared/types'

export function gitStatus(patch: Partial<GitStatus> = {}): GitStatus {
  return {
    isRepo: false,
    repoRoot: null,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
    ignored: [],
    ...patch
  }
}

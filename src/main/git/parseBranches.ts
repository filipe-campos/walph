import type { GitBranch } from '@shared/types'

/** `git for-each-ref` `--format` expected by `parseBranches`. */
export const BRANCH_FORMAT = [
  '%(refname)',
  '%(HEAD)',
  '%(upstream:short)',
  '%(objectname:short)',
  '%(committerdate:unix)'
].join('%1f')

const HEADS = 'refs/heads/'
const REMOTES = 'refs/remotes/'

/**
 * Parses `git for-each-ref refs/heads refs/remotes --format=BRANCH_FORMAT`. Ignores `<remote>/HEAD`.
 * Order: the current one, the other locals by most recent commit, then the remotes (also by recency).
 */
export function parseBranches(output: string): GitBranch[] {
  const branches: GitBranch[] = []
  for (const line of output.split('\n')) {
    if (!line) continue
    const [refname, head, upstream, shortHash, date] = line.split('\x1f')
    if (!refname) continue
    let name: string
    let remote: boolean
    if (refname.startsWith(HEADS)) {
      name = refname.slice(HEADS.length)
      remote = false
    } else if (refname.startsWith(REMOTES)) {
      name = refname.slice(REMOTES.length)
      remote = true
      if (name.endsWith('/HEAD') || !name.includes('/')) continue
    } else continue
    branches.push({
      name,
      remote,
      current: !remote && head === '*',
      upstream: !remote && upstream ? upstream : null,
      shortHash: shortHash ?? '',
      date: (Number(date) || 0) * 1000
    })
  }
  const rank = (b: GitBranch): number => (b.current ? 0 : b.remote ? 2 : 1)
  return branches.sort((a, b) => rank(a) - rank(b) || b.date - a.date || a.name.localeCompare(b.name))
}

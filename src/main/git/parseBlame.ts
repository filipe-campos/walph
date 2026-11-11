import type { GitBlame, GitBlameCommit } from '@shared/types'

const HEADER = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)(?: \d+)?$/
const UNCOMMITTED = /^0+$/

/**
 * Output of `git blame --porcelain`. Each file line comes as a header `<hash> <original line> <final line>
 * [<group lines>]`, the commit fields only the first time it shows up and the content prefixed by TAB.
 * Lines without a header (there should be none) get `-1`.
 */
export function parseBlame(out: string): GitBlame {
  const commits: GitBlameCommit[] = []
  const byHash = new Map<string, number>()
  const lines: number[] = []
  let current: GitBlameCommit | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('\t')) {
      current = null
      continue
    }
    const header = HEADER.exec(line)
    if (header) {
      const hash = header[1] ?? ''
      let index = byHash.get(hash)
      if (index === undefined) {
        index = commits.length
        commits.push({ hash, author: '', email: '', date: 0, summary: '', uncommitted: UNCOMMITTED.test(hash) })
        byHash.set(hash, index)
      }
      const final = Number(header[2])
      while (lines.length < final - 1) lines.push(-1)
      lines[final - 1] = index
      current = commits[index] ?? null
      continue
    }
    if (!current) continue
    const space = line.indexOf(' ')
    const key = space < 0 ? line : line.slice(0, space)
    const value = space < 0 ? '' : line.slice(space + 1)
    if (key === 'author') current.author = value
    else if (key === 'author-mail') current.email = value.replace(/^<|>$/g, '')
    else if (key === 'author-time') current.date = (Number(value) || 0) * 1000
    else if (key === 'summary') current.summary = value
  }
  return { commits, lines }
}

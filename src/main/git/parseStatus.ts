import { join } from 'node:path'
import type { GitFileStatus, GitStatus } from '@shared/types'

export type BranchInfo = Pick<GitStatus, 'branch' | 'upstream' | 'ahead' | 'behind'>
export type ParsedStatus = BranchInfo & { files: GitFileStatus[] }

/** Parses the `## ...` line (without the `## ` prefix) of `git status --branch`. */
export function parseBranchLine(line: string): BranchInfo {
  // Formats: "main...origin/main [ahead 1, behind 2]", "No commits yet on main", "HEAD (no branch)"
  let rest = line
  const noCommits = rest.match(/^No commits yet on (.+)$/)
  if (noCommits) return { branch: noCommits[1] ?? '', upstream: null, ahead: 0, behind: 0 }
  if (rest.startsWith('HEAD (no branch)')) return { branch: 'HEAD (detached)', upstream: null, ahead: 0, behind: 0 }

  const ahead = Number(rest.match(/ahead (\d+)/)?.[1] ?? 0)
  const behind = Number(rest.match(/behind (\d+)/)?.[1] ?? 0)
  rest = rest.replace(/\s*\[.*\]$/, '')
  const [branch, upstream] = rest.split('...')
  return { branch: branch ?? null, upstream: upstream ?? null, ahead, behind }
}

/** Parses the output of `git status --porcelain=v1 -z --branch`; `repoRoot` is the repository root. */
export function parseStatus(output: string, repoRoot: string): ParsedStatus {
  const entries = output.split('\0')
  const files: GitFileStatus[] = []
  let branchInfo = parseBranchLine('')

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    if (entry.startsWith('## ')) {
      branchInfo = parseBranchLine(entry.slice(3))
      continue
    }
    const x = entry.charAt(0)
    const y = entry.charAt(1)
    // Porcelain paths are relative to the repository root.
    files.push({ path: join(repoRoot, entry.slice(3)), index: x, workingDir: y })
    // On renames/copies the source path comes in the next entry.
    if (x === 'R' || x === 'C') i++
  }

  return { ...branchInfo, files }
}

import { join } from 'node:path'
import type { GitCommitFile } from '@shared/types'

/**
 * Parses `git diff|diff-tree --name-status -z`: `M\0path\0` and, on renames/copies,
 * `R100\0source\0destination\0`. `repoRoot` makes the paths absolute.
 */
export function parseNameStatus(output: string, repoRoot: string): GitCommitFile[] {
  const tokens = output.split('\0')
  const files: GitCommitFile[] = []
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i]
    if (!code) continue
    const status = code.charAt(0)
    if (status === 'R' || status === 'C') {
      const from = tokens[i + 1]
      const to = tokens[i + 2]
      i += 2
      if (from && to) files.push({ path: join(repoRoot, to), oldPath: join(repoRoot, from), status })
    } else {
      const path = tokens[i + 1]
      i += 1
      if (path) files.push({ path: join(repoRoot, path), status })
    }
  }
  return files
}

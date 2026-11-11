import type { GitStash } from '@shared/types'

/** `git stash list` `--format` expected by `parseStashList` (use with `-z`). */
export const STASH_FORMAT = '%gd%x1f%H%x1f%ct%x1f%gs'

/** Parses `git stash list -z --format=STASH_FORMAT`. */
export function parseStashList(output: string): GitStash[] {
  const stashes: GitStash[] = []
  for (const record of output.split('\0')) {
    const text = record.replace(/^\n+/, '')
    if (!text) continue
    const [ref, hash, timestamp, ...message] = text.split('\x1f')
    const index = /^stash@\{(\d+)\}$/.exec(ref ?? '')?.[1]
    if (index === undefined) continue
    stashes.push({
      index: Number(index),
      hash: hash ?? '',
      message: message.join('\x1f'),
      date: (Number(timestamp) || 0) * 1000
    })
  }
  return stashes
}

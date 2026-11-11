import type { GitCommit } from '@shared/types'

/** Field (US) and record (NUL, via `log -z`) separators: neither shows up in a hash, e-mail or date. */
const LOG_FIELD_SEP = '\x1f'

/** `git log` `--format` expected by `parseLog`; the subject goes last to tolerate separators in it. */
export const LOG_FORMAT = ['%H', '%h', '%an', '%ae', '%at', '%P', '%s'].join('%x1f')

/** Parses the output of `git log -z --format=LOG_FORMAT`. Malformed records are ignored. */
export function parseLog(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  for (const record of output.split('\0')) {
    // Without `-z` (or after it) git may leave a line break between records.
    const text = record.replace(/^\n+/, '')
    if (!text) continue
    const fields = text.split(LOG_FIELD_SEP)
    if (fields.length < 7) continue
    const [hash, shortHash = '', author = '', email = '', timestamp, parents = '', ...subject] = fields
    const seconds = Number(timestamp)
    if (!hash || !Number.isFinite(seconds)) continue
    commits.push({
      hash,
      shortHash,
      author,
      email,
      date: seconds * 1000,
      subject: subject.join(LOG_FIELD_SEP),
      parents: parents.split(' ').filter(Boolean)
    })
  }
  return commits
}

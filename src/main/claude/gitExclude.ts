// The CLI treats `settings.local.json` as a personal file and keeps it out of git when creating it; when Walph creates
// it ("Always in this workspace") that step does not happen and the file would show up as untracked. Here Walph adds it
// to the repository's PRIVATE exclude (`.git/info/exclude`): it never touches the project `.gitignore` nor the global
// config.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { writeFileAtomic } from '../fs/atomicWrite'
import { gitStatusCode } from '../git/run'

/** Relative to the window folder, as git sees it. */
const LOCAL_SETTINGS_REL = '.claude/settings.local.json'
// Any-folder prefix (`**` + slash) because the open folder may be a subfolder of the repository.
export const EXCLUDE_PATTERN = `**/${LOCAL_SETTINGS_REL}`
const GIT_TIMEOUT_MS = 5000

/** Text to append to the exclude (`''` if the pattern is already there). Pure. */
export function excludeAddition(existing: string, pattern: string = EXCLUDE_PATTERN): string {
  const lines = existing.split(/\r?\n/).map((l) => l.trim())
  if (lines.includes(pattern) || lines.includes(`/${LOCAL_SETTINGS_REL}`) || lines.includes(LOCAL_SETTINGS_REL))
    return ''
  const prefix = existing === '' || existing.endsWith('\n') ? '' : '\n'
  return `${prefix}${pattern}\n`
}

/**
 * Best effort (never throws): if `root` is in a repository and `settings.local.json` is not ignored, appends the
 * pattern to the repository's `info/exclude`.
 */
export async function ensureLocalSettingsIgnored(root: string): Promise<void> {
  try {
    // 0 = already ignored; 1 = not ignored; other (128 = outside a repository, git missing = -1) = nothing to do.
    const check = await gitStatusCode(root, ['check-ignore', '-q', '--', LOCAL_SETTINGS_REL], {
      timeoutMs: GIT_TIMEOUT_MS
    })
    if (check.code !== 1) return
    const where = await gitStatusCode(root, ['rev-parse', '--git-path', 'info/exclude'], { timeoutMs: GIT_TIMEOUT_MS })
    const rel = where.stdout.trim()
    if (where.code !== 0 || rel === '') return
    const file = resolve(root, rel)
    let existing = ''
    try {
      // latin1 preserves any byte: a non-UTF-8 exclude comes back identical.
      existing = await readFile(file, 'latin1')
    } catch (err) {
      // Any error other than "does not exist" (EACCES, EISDIR…) must not turn into a file overwritten with the pattern.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return
    }
    const addition = excludeAddition(existing)
    if (addition === '') return
    await writeFileAtomic(file, Buffer.from(existing + addition, 'latin1'), { mkdirp: true })
  } catch {
    // best effort
  }
}

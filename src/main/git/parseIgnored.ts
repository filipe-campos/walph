import { join } from 'node:path'

/** Entry cap: a huge repo cannot inflate the IPC or the store. */
export const MAX_IGNORED = 5000

/**
 * Output of `git ls-files --others --ignored --exclude-standard --directory -z` (cwd = `base`) → absolute paths
 * (in the window folder path space). Whole folders come collapsed (`node_modules/`); the trailing `/` is stripped.
 * Entries inside an already listed folder are dropped (before the cap, so as not to spend it on redundancy).
 */
export function parseIgnored(out: string, base: string): string[] {
  const entries: string[] = []
  const dirs = new Set<string>()
  for (const raw of out.split('\0')) {
    const entry = raw.replace(/\/+$/, '')
    if (!entry) continue
    entries.push(entry)
    if (raw.endsWith('/')) dirs.add(entry)
  }
  const result: string[] = []
  for (const entry of entries) {
    if (hasListedAncestor(entry, dirs)) continue
    result.push(join(base, entry))
    if (result.length >= MAX_IGNORED) break
  }
  return result
}

function hasListedAncestor(entry: string, dirs: Set<string>): boolean {
  if (dirs.size === 0) return false
  for (let i = entry.indexOf('/'); i !== -1; i = entry.indexOf('/', i + 1)) {
    if (dirs.has(entry.slice(0, i))) return true
  }
  return false
}

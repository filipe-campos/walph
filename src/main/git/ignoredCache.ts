import { git } from './run'
import { parseIgnored } from './parseIgnored'

const IGNORED_TTL_MS = 10_000
const IGNORED_CACHE_MAX = 20
// Per window folder: `ls-files --ignored` does not benefit from fsmonitor/untracked cache, so it does not run on every
// status.
const cache = new Map<string, { value: string[]; at: number; refreshing: boolean }>()

async function listIgnored(folder: string): Promise<string[]> {
  try {
    // cwd = window folder: cost and payload limited to the visible tree (the output is relative to the cwd).
    const out = await git(folder, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'])
    return parseIgnored(out, folder)
  } catch {
    return []
  }
}

/**
 * Ignored files for the explorer to dim them; failing here never brings down the status. Stale → returns the cache
 * and refreshes in the background.
 */
export async function ignoredPaths(folder: string): Promise<string[]> {
  const hit = cache.get(folder)
  if (!hit) {
    const value = await listIgnored(folder)
    if (cache.size >= IGNORED_CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(folder, { value, at: Date.now(), refreshing: false })
    return value
  }
  if (Date.now() - hit.at > IGNORED_TTL_MS && !hit.refreshing) {
    hit.refreshing = true
    void listIgnored(folder).then((value) => {
      const cur = cache.get(folder)
      if (cur) Object.assign(cur, { value, at: Date.now(), refreshing: false })
    })
  }
  return hit.value
}

export function forgetIgnored(folder: string): void {
  cache.delete(folder)
}

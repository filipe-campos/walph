/**
 * Repository root cache per open folder. The root only changes if the `.git` appears/disappears, which is rare: a short
 * TTL avoids a `rev-parse` on every status/log/baseline without hiding `git init` for long. Whoever knows the state
 * changed (init, clone, git failure) calls `invalidate`. "Not a repository" has a much smaller TTL (the folder may
 * become one).
 */
export function createRepoTopCache(
  find: (root: string) => Promise<string>,
  options: { ttlMs?: number; negativeTtlMs?: number; now?: () => number } = {}
) {
  const { ttlMs = 30_000, negativeTtlMs = 2_000, now = Date.now } = options
  const entries = new Map<string, { promise: Promise<string>; at: number; failed: boolean }>()

  return {
    get(root: string): Promise<string> {
      const hit = entries.get(root)
      if (hit && now() - hit.at < (hit.failed ? negativeTtlMs : ttlMs)) return hit.promise
      const entry = { promise: find(root), at: now(), failed: false }
      entries.set(root, entry)
      entry.promise.catch(() => {
        entry.failed = true
        entry.at = now()
      })
      return entry.promise
    },
    invalidate(root?: string): void {
      if (root === undefined) entries.clear()
      else entries.delete(root)
    }
  }
}

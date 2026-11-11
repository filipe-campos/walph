/**
 * Shared cache with single execution: calls with the same key within `maxAgeMs` share a result, and concurrent
 * ones share the same process. Each call says how old a result it accepts (background polling tolerates older data
 * than the open screen). A failure is not cached. `invalidate` drops the result and makes whatever is still in flight
 * stop counting (an action that changed the state cannot be followed by a list older than it).
 */
export function createSharedCache<T>(now: () => number = Date.now) {
  const entries = new Map<string, { promise: Promise<T>; at: number }>()

  return {
    get(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key)
      if (hit && now() - hit.at <= maxAgeMs) return hit.promise
      const entry = { promise: load(), at: now() }
      entries.set(key, entry)
      entry.promise.catch(() => {
        if (entries.get(key) === entry) entries.delete(key)
      })
      return entry.promise
    },
    invalidate(key?: string): void {
      if (key === undefined) entries.clear()
      else entries.delete(key)
    }
  }
}

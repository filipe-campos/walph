const MAX_RELOADS = 3
const RELOAD_WINDOW_MS = 30_000

/** Automatic reloads per key: a renderer that dies in a loop stays dead instead of reloading forever. */
export function createReloadLimiter<K extends object>(now: () => number = Date.now): { allow(key: K): boolean } {
  const reloads = new WeakMap<K, number[]>()
  return {
    allow(key) {
      const at = now()
      const recent = (reloads.get(key) ?? []).filter((t) => at - t < RELOAD_WINDOW_MS)
      if (recent.length >= MAX_RELOADS) return false
      reloads.set(key, [...recent, at])
      return true
    }
  }
}

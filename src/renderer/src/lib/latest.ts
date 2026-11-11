// Discards stale async responses: each request takes a token and only the last one still counts.

export interface Latest {
  /** Opens a new request and invalidates the previous ones. */
  next(): number
  /** Token of the last opened (or invalidated) request. */
  current(): number
  isCurrent(token: number): boolean
  /** Invalidates what is in flight without opening a new request. */
  invalidate(): void
}

export function createLatest(): Latest {
  let seq = 0
  return {
    next: () => ++seq,
    current: () => seq,
    isCurrent: (token) => token === seq,
    invalidate: () => {
      seq++
    }
  }
}

export interface LatestByKey<K> {
  next(key: K): number
  isCurrent(key: K, token: number): boolean
  /** Forgets the key: any token of it, old or future from a previous `next`, becomes stale. */
  forget(key: K): void
  /** Forgets all keys at once. */
  clear(): void
}

/**
 * Requests that only trample each other within the same key (tab, id…). The tokens come from a single counter: after
 * `forget(k)` an old token of `k` never becomes valid again, even if a new request for the key is opened.
 */
export function createLatestByKey<K>(): LatestByKey<K> {
  const tokens = new Map<K, number>()
  let seq = 0
  return {
    next(key) {
      const token = ++seq
      tokens.set(key, token)
      return token
    },
    isCurrent: (key, token) => tokens.get(key) === token,
    forget: (key) => {
      tokens.delete(key)
    },
    clear: () => tokens.clear()
  }
}

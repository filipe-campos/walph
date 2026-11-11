export interface Batcher<T> {
  push(item: T): void
  /** Delivers what is pending now and cancels the timer. */
  flush(): void
  /** Discards what is pending and cancels the timer; `push` after that is ignored. */
  dispose(): void
}

/** Collects items and delivers them at once, at most every `ms` (the timer starts at the first item of the burst). */
export function createBatcher<T>(ms: number, deliver: (items: T[]) => void): Batcher<T> {
  let pending: T[] = []
  let timer: NodeJS.Timeout | null = null
  let disposed = false
  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending.length === 0) return
    const items = pending
    pending = []
    deliver(items)
  }
  return {
    push(item) {
      if (disposed) return
      pending.push(item)
      timer ??= setTimeout(flush, ms)
    },
    flush,
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      pending = []
    }
  }
}

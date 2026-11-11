// Serial promise queues: each task starts after the previous one finished (successfully or not).

/**
 * Runs the tasks one at a time, in call order. The promise returned by `run` resolves/rejects with the result of the
 * task itself; a task failure never breaks the queue (the next one runs normally).
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(job: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(job)
    // The tail swallows the error: whoever awaits the result already gets it in `result`.
    this.tail = result.catch(() => undefined)
    return result
  }
}

/**
 * One serial queue per key (e.g. a file): different keys run in parallel. A key's chain is removed from the map when
 * it becomes idle, so the map does not grow with the number of keys seen.
 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>()

  run<T>(key: string, job: () => T | Promise<T>): Promise<T> {
    const result = (this.tails.get(key) ?? Promise.resolve()).then(job)
    const tail: Promise<unknown> = result.then(
      () => undefined,
      () => undefined
    )
    this.tails.set(key, tail)
    // Only prune if nobody queued afterwards (the tail is still ours).
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return result
  }

  /** Keys with a pending or running task (for tests). */
  get size(): number {
    return this.tails.size
  }
}

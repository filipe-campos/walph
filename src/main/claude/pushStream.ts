// Async queue used as the SDK streaming input: `query()` consumes the iterable and the user messages come in with
// `push` when the renderer sends them. `end()` closes the input (the CLI gets EOF and exits on its own).

export class PushStream<T> implements AsyncIterable<T> {
  private readonly queue: T[] = []
  private waiters: { resolve(result: IteratorResult<T>): void; reject(reason: Error): void }[] = []
  private done = false
  private failure: { error: Error } | null = null

  push(value: T): void {
    if (this.done) return
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve({ value, done: false })
    else this.queue.push(value)
  }

  end(): void {
    this.done = true
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) waiter.resolve({ value: undefined, done: true })
  }

  /** Closes the input with an error: what was already queued comes out first, then the consumer gets the rejection. */
  fail(error: Error): void {
    if (this.done) return
    this.failure = { error }
    this.done = true
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) waiter.reject(error)
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift() as T, done: false })
        if (this.failure) return Promise.reject(this.failure.error)
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return new Promise<IteratorResult<T>>((resolve, reject) => this.waiters.push({ resolve, reject }))
      },
      return: () => {
        this.end()
        return Promise.resolve({ value: undefined, done: true })
      }
    }
  }
}

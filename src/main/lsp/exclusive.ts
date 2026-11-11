import { CancellationTokenSource, type CancellationToken } from 'vscode-jsonrpc/node'

/** In-flight requests that a new one with the same key cancels (fast typing: completion, hover, symbols). */
export class ExclusiveRequests {
  private readonly inFlight = new Map<string, CancellationTokenSource>()

  /**
   * Cancels the previous request of `key` and runs `fn` with the new one's token. Whoever needs to know if it was
   * cancelled reads `token.isCancellationRequested` INSIDE `fn`: afterwards, the source's `dispose` cancels it too.
   */
  async withExclusive<R>(key: string, fn: (token: CancellationToken) => Promise<R>): Promise<R> {
    this.inFlight.get(key)?.cancel()
    const source = new CancellationTokenSource()
    this.inFlight.set(key, source)
    try {
      return await fn(source.token)
    } finally {
      if (this.inFlight.get(key) === source) this.inFlight.delete(key)
      source.dispose()
    }
  }

  cancelAll(): void {
    for (const source of this.inFlight.values()) source.cancel()
    this.inFlight.clear()
  }
}

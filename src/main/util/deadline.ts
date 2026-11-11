// Deadlines over promises: the timer is always cleared, whatever the outcome.

export const TIMEOUT = Symbol('timeout')

export interface DeadlineOptions {
  /**
   * Aborting rejects (with `signal.reason` if it is an `Error`, otherwise with an `AbortError`) and clears the timer.
   */
  signal?: AbortSignal
}

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')

function race<T, R>(
  promise: Promise<T>,
  ms: number,
  onTimeout: (resolve: (value: R) => void, reject: (reason: Error) => void) => void,
  options: DeadlineOptions
): Promise<T | R> {
  return new Promise<T | R>((resolve, reject) => {
    const { signal } = options
    if (signal?.aborted) return reject(abortReason(signal))
    const cleanup = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      cleanup()
      if (signal) reject(abortReason(signal))
    }
    const timer = setTimeout(() => {
      cleanup()
      onTimeout(resolve, reject)
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
    void promise.then(resolve, reject).finally(cleanup)
  })
}

/**
 * Resolves with the value of `promise`, or with `TIMEOUT` if `ms` elapses first. A rejection of `promise` is passed on.
 */
export function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  options: DeadlineOptions = {}
): Promise<T | typeof TIMEOUT> {
  return race<T, typeof TIMEOUT>(promise, ms, (resolve) => resolve(TIMEOUT), options)
}

/** Like `withDeadline`, but missing the deadline rejects with the error from `makeError` (called only in that case). */
export function rejectAfter<T>(
  promise: Promise<T>,
  ms: number,
  makeError: () => Error,
  options: DeadlineOptions = {}
): Promise<T> {
  return race<T, never>(promise, ms, (_resolve, reject) => reject(makeError()), options)
}

/**
 * Coalescing of identical calls: one run at a time. Whoever arrives during the run does not fire another right away
 * (the state may have changed after it started): they all share ONE new run, started when the current one
 * ends. Refresh bursts become at most two runs, and the last result wins.
 */
export function createSingleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null
  let queued: Promise<T> | null = null

  const launch = (): Promise<T> => {
    const p = run()
    const clear = (): void => {
      if (inflight === p) inflight = null
    }
    p.then(clear, clear)
    inflight = p
    return p
  }

  const noop = (): void => undefined
  return () => {
    if (!inflight) return launch()
    queued ??= inflight.then(noop, noop).then(() => {
      queued = null
      return launch()
    })
    return queued
  }
}

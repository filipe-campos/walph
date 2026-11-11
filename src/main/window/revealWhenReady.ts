const REVEAL_TIMEOUT_MS = 1500

interface Revealable {
  once(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}

/**
 * Calls `reveal` once when the view finishes loading (or fails, is destroyed, or exceeds `timeoutMs`), so a newly
 * created view is not shown still blank. Returns the cancellation: releases the listeners without calling `reveal`.
 */
export function revealWhenReady(wc: Revealable, reveal: () => void, timeoutMs = REVEAL_TIMEOUT_MS): () => void {
  const events = ['did-finish-load', 'did-fail-load', 'destroyed'] as const
  let done = false
  const cancel = (): void => {
    if (done) return
    done = true
    clearTimeout(timer)
    for (const event of events) wc.removeListener(event, fire)
  }
  const fire = (): void => {
    if (done) return
    cancel()
    reveal()
  }
  const timer = setTimeout(fire, timeoutMs)
  for (const event of events) wc.once(event, fire)
  return cancel
}

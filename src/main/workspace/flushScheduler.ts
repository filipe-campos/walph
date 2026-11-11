/**
 * Schedules sending an accumulated batch. `delay()` is queried on every scheduling (active workspace: short; inactive:
 * long, so the hidden renderer is not woken up). `flushNow` brings the pending send forward (on activation) without
 * dropping anything.
 */
export function createFlushScheduler(flush: () => void, delay: () => number) {
  let timer: NodeJS.Timeout | null = null
  let pending = false

  const run = (): void => {
    timer = null
    pending = false
    flush()
  }

  return {
    /** There are accumulated events; ensures a timer. Already scheduled = keeps it (does not push the deadline). */
    schedule(): void {
      pending = true
      timer ??= setTimeout(run, delay())
    },
    /** Sends whatever is pending right away. */
    flushNow(): void {
      if (!pending) return
      if (timer) clearTimeout(timer)
      run()
    },
    /** Drops the timer and whatever was pending (the watcher was closed). */
    cancel(): void {
      if (timer) clearTimeout(timer)
      timer = null
      pending = false
    }
  }
}

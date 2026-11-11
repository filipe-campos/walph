/** `auto` = automatic panel start (may be reused by whoever wants a new conversation); `user` = the rest. */
type StartKind = 'auto' | 'user'

export interface StartQueue<T> {
  /**
   * Puts `job` at the end of the queue; with an empty queue it starts right away (synchronous). A `key` equal to that
   * of an unfinished job returns its promise instead of queuing another.
   */
  run(job: () => Promise<T>, options?: { kind?: StartKind; key?: string }): Promise<T>
  /** The most recent unfinished job of `kind` (running or waiting). */
  latest(kind: StartKind): Promise<T> | null
  /** There is an unfinished job with `key`. */
  has(key: string): boolean
  readonly busy: boolean
}

interface Entry<T> {
  job: () => Promise<T>
  kind: StartKind
  key: string | undefined
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

/**
 * FIFO queue of one job at a time. `onBusyChange` notifies only on the edges (empty ↔ busy), never between two
 * consecutive jobs.
 */
export function createStartQueue<T>(onBusyChange: (busy: boolean) => void = () => {}): StartQueue<T> {
  const waiting: Entry<T>[] = []
  let running: Entry<T> | null = null

  const pending = (): Entry<T>[] => (running ? [running, ...waiting] : [...waiting])
  // A notifier that throws must not leave the queue busy forever nor a waiter of a job without an answer.
  const notify = (busy: boolean): void => {
    try {
      onBusyChange(busy)
    } catch (err) {
      queueMicrotask(() => {
        throw err
      })
    }
  }

  function next(): void {
    const wasBusy = running !== null
    const entry = waiting.shift() ?? null
    running = entry
    if (!entry) return notify(false)
    if (!wasBusy) notify(true)
    let result: Promise<T>
    try {
      result = entry.job()
    } catch (err) {
      result = Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
    // The next one starts before whoever awaited this one resumes: nobody sees the queue empty between two jobs.
    result.then(
      (value) => {
        next()
        entry.resolve(value)
      },
      (err: unknown) => {
        next()
        entry.reject(err)
      }
    )
  }

  return {
    run(job, options = {}) {
      const same = options.key === undefined ? undefined : pending().find((e) => e.key === options.key)
      if (same) return same.promise
      let resolve!: (value: T) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      waiting.push({ job, kind: options.kind ?? 'user', key: options.key, promise, resolve, reject })
      if (!running) next()
      return promise
    },
    latest(kind) {
      return pending().findLast((e) => e.kind === kind)?.promise ?? null
    },
    has(key) {
      return pending().some((e) => e.key === key)
    },
    get busy() {
      return running !== null
    }
  }
}

export interface AutoStartInput {
  /** The workspaces list already arrived (before it, it is unknown whether the view is active). */
  known: boolean
  viewActive: boolean
  visible: boolean
  prevVisible: boolean
  hasRoot: boolean
  conversations: number
}

/**
 * Opening the panel without conversations starts one, but only in an active and known view; opened otherwise, the start
 * is deferred (`deferred`) until the view becomes active. Closing the panel or getting a conversation cancels the
 * deferral.
 */
export function decideAutoStart(input: AutoStartInput, deferred: boolean): { start: boolean; deferred: boolean } {
  const { known, viewActive, visible, prevVisible, hasRoot, conversations } = input
  let next = deferred
  if (visible && !prevVisible && (!known || !viewActive)) next = true
  const start = known && viewActive && visible && (!prevVisible || next) && hasRoot && conversations === 0
  if (start || !visible || conversations > 0) next = false
  return { start, deferred: next }
}

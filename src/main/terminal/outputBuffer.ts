/** Above this the batch goes out immediately, without waiting for the timer. */
export const MAX_CHUNK_CHARS = 64 * 1024
/** Unacknowledged above this: the pty is paused until the renderer catches up. */
export const HIGH_WATERMARK = 1024 * 1024
export const LOW_WATERMARK = 256 * 1024
/** Paused without any ack for this long: the renderer is not keeping up (hidden, busy); the pty runs again. */
export const PAUSE_WATCHDOG_MS = 2000

export interface OutputHooks {
  send(data: string): void
  pause(): void
  resume(): void
  /** Batching window (ms), read on every schedule: short for a visible terminal, long for a hidden one. */
  interval(): number
  now?(): number
  /** Only visible terminals can be paused; hidden ones only batch (their renderer runs slowly). */
  canPause?(): boolean
}

/**
 * Output of ONE pty towards the renderer: batches chunks into few IPC messages and controls the flow.
 * The first chunk after a silence goes out immediately (typing echo without delay); what arrives in a burst waits for
 * the rest of the window. The units are characters (`string.length`) on both sides of the `ack`.
 */
export class TerminalOutput {
  private queue: string[] = []
  private queued = 0
  private timer: NodeJS.Timeout | null = null
  private lastFlush = -Infinity
  private unacked = 0
  private paused = false
  private watchdog: NodeJS.Timeout | null = null

  constructor(private readonly hooks: OutputHooks) {}

  push(data: string): void {
    if (data === '') return
    this.queue.push(data)
    this.queued += data.length
    if (this.queued >= MAX_CHUNK_CHARS) return this.flush()
    if (this.timer) return
    const now = (this.hooks.now ?? Date.now)()
    const wait = this.hooks.interval() - (now - this.lastFlush)
    if (wait <= 0) this.flush()
    else this.timer = setTimeout(() => this.flush(), wait)
  }

  /** Sends what is queued now (before announcing that the process exited, so the tail is not lost). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.queue.length === 0) return
    const data = this.queue.join('')
    this.queue = []
    this.queued = 0
    this.lastFlush = (this.hooks.now ?? Date.now)()
    this.unacked += data.length
    this.hooks.send(data)
    if (!this.paused && this.unacked > HIGH_WATERMARK && (this.hooks.canPause?.() ?? true)) {
      this.paused = true
      this.hooks.pause()
      this.armWatchdog()
    }
  }

  /** The renderer delivered `chars` characters to xterm. */
  ack(chars: number): void {
    this.unacked = Math.max(0, this.unacked - chars)
    if (this.paused && this.unacked <= LOW_WATERMARK) this.reset()
    else if (this.paused) this.armWatchdog()
  }

  /** Resets the count and resumes the pty if it was paused (reload, hidden terminal, watchdog). */
  reset(): void {
    this.unacked = 0
    this.clearWatchdog()
    if (this.paused) {
      this.paused = false
      this.hooks.resume()
    }
  }

  private armWatchdog(): void {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => this.reset(), PAUSE_WATCHDOG_MS)
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  dispose(): void {
    this.clearWatchdog()
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.queue = []
    this.queued = 0
  }
}

import type { DockerStatsSample } from '@shared/types'
import type { GroupProcess } from '../process/spawnGroup'
import { CpuHistory, StatsFrameParser } from './parseStats'

export const STATS_IDLE_MS = 250
export const STATS_RETRY_MS = 5000

export interface StatsStreamHooks {
  /** Resolves the executable; `false` = nothing to run (no Docker, dead view). */
  ready(): Promise<boolean>
  spawn(): GroupProcess
  emit(samples: DockerStatsSample[]): void
  /** There is no (longer a) process nor a retry: the subscription can be redone by a later `start`. */
  released(): void
}

/** Continuous `docker stats` of ONE subscription: frames at the end of each update and a retry if the process dies. */
export class StatsStream {
  private stopped = false
  private live: GroupProcess | null = null
  private idle: NodeJS.Timeout | undefined
  private retry: NodeJS.Timeout | undefined

  constructor(private readonly hooks: StatsStreamHooks) {}

  start(): void {
    void this.launch()
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.idle)
    clearTimeout(this.retry)
    this.live?.kill()
  }

  private async launch(): Promise<void> {
    // Without Docker the screen shows the error through `info`/`list`; releasing allows a `start` after the fix.
    if (!(await this.hooks.ready())) return this.hooks.released()
    if (this.stopped) return
    const parser = new StatsFrameParser()
    const history = new CpuHistory()
    const emit = (frame: ReturnType<StatsFrameParser['flush']>): void => {
      if (frame && !this.stopped) this.hooks.emit(history.apply(frame))
    }
    let live: GroupProcess
    try {
      live = this.hooks.spawn()
    } catch {
      return this.hooks.released()
    }
    this.live = live
    let ended = false
    const onEnd = (): void => {
      if (ended) return
      ended = true
      clearTimeout(this.idle)
      if (this.stopped) return
      // Daemon restarted or Docker closed: retry while the screen is open.
      this.retry = setTimeout(() => void this.launch(), STATS_RETRY_MS)
    }
    live.child.stdout?.setEncoding('utf8')
    live.child.stdout?.on('data', (chunk: string) => {
      for (const frame of parser.feed(chunk)) emit(frame)
      clearTimeout(this.idle)
      // `docker stats` only closes a frame when the next one starts: with no data for a moment, deliver what already
      // arrived.
      this.idle = setTimeout(() => emit(parser.flush()), STATS_IDLE_MS)
    })
    live.child.stderr?.resume()
    live.child.once('close', onEnd)
    live.child.once('error', onEnd)
  }
}

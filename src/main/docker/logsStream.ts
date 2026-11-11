import type { DockerLogLine } from '@shared/types'
import type { GroupProcess } from '../process/spawnGroup'
import { createLineSplitter } from '../util/lineSplitter'
import { classifyDockerFailure } from './errors'
import { parseLogLine } from './parseLogs'

export const LOGS_BATCH_MS = 50
/** Max lines per message and per tick: the excess waits for the next tick, never dropped. */
export const LOGS_BATCH_MAX = 500
/** Queue above this: docker is paused (main's throughput limit, no renderer ack) until the queue drops to `LOW`. */
export const LOGS_HIGH_WATERMARK = 5000
export const LOGS_LOW_WATERMARK = 1000
const STDERR_TAIL = 4096

export interface LogsStreamHooks {
  spawn(): GroupProcess
  emit(lines: DockerLogLine[]): void
  /** Exited on its own (container stopped or docker failed); `error` already translated. Not fired after `stop()`. */
  end(error: string | null): void
}

/** `docker logs -f` of ONE container: groups lines into batches per tick and pauses docker if consumption lags. */
export class LogsStream {
  private stopped = false
  private live: GroupProcess | null = null
  private pending: DockerLogLine[] = []
  private timer: NodeJS.Timeout | undefined
  private paused = false

  constructor(private readonly hooks: LogsStreamHooks) {}

  start(): void {
    const live = this.hooks.spawn()
    this.live = live
    const out = createLineSplitter()
    const err = createLineSplitter()
    let stderrTail = ''
    live.child.stdout?.setEncoding('utf8')
    live.child.stderr?.setEncoding('utf8')
    live.child.stdout?.on('data', (chunk: string) => this.push(out.feed(chunk), 'stdout'))
    live.child.stderr?.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL)
      this.push(err.feed(chunk), 'stderr')
    })
    let ended = false
    const finish = (code: number | null, spawnError: Error | null): void => {
      if (ended) return
      ended = true
      if (this.stopped) return
      this.push(out.flush(), 'stdout')
      this.push(err.flush(), 'stderr')
      this.drain()
      let error: string | null = null
      if (spawnError)
        error = classifyDockerFailure({
          code: (spawnError as NodeJS.ErrnoException).code,
          message: spawnError.message
        }).message
      else if (code !== 0) error = classifyDockerFailure({ stderr: stderrTail }).message
      this.hooks.end(error)
    }
    live.child.once('close', (code) => finish(code, null))
    live.child.once('error', (e) => finish(null, e))
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
    this.timer = undefined
    this.pending = []
    this.live?.kill()
    // A paused pipe never reads up to EOF: without destroying it, the descriptors would stay open.
    this.live?.child.stdout?.destroy()
    this.live?.child.stderr?.destroy()
  }

  private push(lines: string[], stream: DockerLogLine['stream']): void {
    if (this.stopped) return
    for (const raw of lines) this.pending.push(parseLogLine(raw, stream))
    if (!this.paused && this.pending.length > LOGS_HIGH_WATERMARK) this.setPaused(true)
    if (this.pending.length > 0) this.timer ??= setTimeout(() => this.tick(), LOGS_BATCH_MS)
  }

  private tick(): void {
    this.timer = undefined
    this.sendBatch()
    if (this.paused && this.pending.length <= LOGS_LOW_WATERMARK) this.setPaused(false)
    if (this.pending.length > 0) this.timer = setTimeout(() => this.tick(), LOGS_BATCH_MS)
  }

  private drain(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    while (this.pending.length > 0) this.sendBatch()
  }

  private sendBatch(): void {
    const lines = this.pending.splice(0, LOGS_BATCH_MAX)
    if (lines.length > 0 && !this.stopped) this.hooks.emit(lines)
  }

  private setPaused(paused: boolean): void {
    this.paused = paused
    for (const stream of [this.live?.child.stdout, this.live?.child.stderr]) {
      if (paused) stream?.pause()
      else stream?.resume()
    }
  }
}

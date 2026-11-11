import type { WebContents } from 'electron'
import { send } from '../window/send'
import { LogsStream } from './logsStream'
import { resolveContainerRef } from './refs'
import { specFor, spawnLive } from './run'
import { StatsStream } from './statsStream'
import { stopLogsOf, viewOf } from './viewState'

/** Subscribes to the view's `docker stats` (only one per view). */
export function startStats(sender: WebContents): void {
  const v = viewOf(sender)
  if (v.stats) return
  let spec: Awaited<ReturnType<typeof specFor>>
  const stream: StatsStream = new StatsStream({
    ready: async () => {
      try {
        spec = await specFor(sender)
      } catch {
        return false
      }
      return !sender.isDestroyed()
    },
    spawn: () => spawnLive(spec, ['stats', '--format', '{{json .}}']),
    emit: (samples) => send(sender, 'docker:stats', samples),
    released: () => {
      if (v.stats === stream) v.stats = null
    }
  })
  v.stats = stream
  stream.start()
}

/** Follows the container logs; returns the `seq` that identifies this follow's batches. */
export async function followLogs(sender: WebContents, ref: unknown): Promise<number> {
  const v = viewOf(sender)
  const id = resolveContainerRef(ref, v.ps)
  stopLogsOf(sender)
  const seq = ++v.logSeq
  const spec = await specFor(sender)
  // Another follow (or stop) arrived while the executable was being resolved.
  if (v.logSeq !== seq || sender.isDestroyed()) return seq
  const stream: LogsStream = new LogsStream({
    spawn: () => spawnLive(spec, ['logs', '-f', '--timestamps', '--tail', '500', '--', id]),
    emit: (lines) => send(sender, 'docker:logs', { seq, lines }),
    end: (error) => {
      if (v.logs === stream) v.logs = null
      send(sender, 'docker:logsEnd', { seq, error })
    }
  })
  stream.start()
  v.logs = stream
  return seq
}

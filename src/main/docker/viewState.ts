import type { WebContents } from 'electron'
import { onViewReset } from '../window/viewLifecycle'
import type { LogsStream } from './logsStream'
import type { PsContainer } from './parsePs'
import type { StatsStream } from './statsStream'

/** View (webContents) state: last `ps` (validates names and finds the compose labels) and the continuous processes. */
export interface ViewState {
  ps: PsContainer[]
  stats: StatsStream | null
  logs: LogsStream | null
  logSeq: number
}

const views = new WeakMap<WebContents, ViewState>()

export function viewOf(sender: WebContents): ViewState {
  let v = views.get(sender)
  if (!v) {
    v = { ps: [], stats: null, logs: null, logSeq: 0 }
    views.set(sender, v)
    // Reload or the renderer dying (`onViewReset`): the xterms/screens go away.
    onViewReset(sender, 'docker', () => stopAll(sender))
  }
  return v
}

export function stopStatsOf(sender: WebContents): void {
  const v = views.get(sender)
  if (!v) return
  const stream = v.stats
  v.stats = null
  stream?.stop()
}

export function stopLogsOf(sender: WebContents): void {
  const v = views.get(sender)
  if (!v) return
  // Always invalidates the `seq`: a follow still resolving the executable cannot be born after the stop.
  v.logSeq++
  const stream = v.logs
  v.logs = null
  stream?.stop()
}

function stopAll(sender: WebContents): void {
  stopStatsOf(sender)
  stopLogsOf(sender)
}

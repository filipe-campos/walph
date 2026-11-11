import type { WebContents } from 'electron'
import type { IpcEvents } from '@shared/ipc'

/**
 * `webContents.send` for an `IpcEvents` channel: the payload is that of the preload listeners. Ignores a destroyed
 * view.
 */
export function send<C extends keyof IpcEvents>(wc: WebContents, channel: C, ...payload: IpcEvents[C]): void {
  if (wc.isDestroyed()) return
  wc.send(channel, ...payload)
}

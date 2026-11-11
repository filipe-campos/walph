// Typed helpers over `ipcMain` (map in `shared/ipc.ts`). The handlers still receive
// `unknown` (validation at the boundary is theirs): the compiler only checks channel name, arity and return type.
// They are also the IPC trust and error boundary: only a workspace's main frame talks to main, and what
// reaches the renderer is a `UserError` (translated message) or the generic unexpected error text.
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { t } from '@shared/i18n'
import type { IpcInvoke, IpcSend } from '@shared/ipc'
import { UserError } from '../errors'
import { createLog } from '../log'
import { isTrustedSender } from '../window/trustedSenders'

const log = createLog('ipc')

/** Every argument arrives from the renderer as `unknown`; keeps the contract's arity (and optionality). */
type Unknowns<A extends unknown[]> = { [K in keyof A]: unknown }

/** Passes `UserError` through; any other failure is logged with the channel and becomes the generic translated text. */
function toUserError(channel: string, err: unknown): UserError {
  if (err instanceof UserError) return err
  log.error(channel, err)
  const detail = err instanceof Error ? err.message : String(err)
  return new UserError(t().common.unexpectedError(detail), { cause: err })
}

/**
 * Same rule as `toUserError` for a promise rejection, changing the error itself: Electron serializes its
 * `${name}: ${message}`, and returning another promise would delay the reply by a tick (events the handler emitted
 * would arrive before it).
 */
function exposeRejection(channel: string, err: unknown): void {
  if (err instanceof UserError) return
  log.error(channel, err)
  if (!(err instanceof Error)) return
  err.message = t().common.unexpectedError(err.message)
  err.name = 'Error'
}

/** `ipcMain.handle` for an `IpcInvoke` channel. */
export function handle<C extends keyof IpcInvoke>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: Unknowns<IpcInvoke[C]['args']>
  ) => IpcInvoke[C]['result'] | Promise<IpcInvoke[C]['result']>
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      log.warn(`${channel}: untrusted sender rejected`)
      throw new UserError(t().common.untrustedSender)
    }
    let result: IpcInvoke[C]['result'] | Promise<IpcInvoke[C]['result']>
    try {
      result = handler(event, ...(args as Unknowns<IpcInvoke[C]['args']>))
    } catch (err) {
      throw toUserError(channel, err)
    }
    if (result instanceof Promise) result.catch((err: unknown) => exposeRejection(channel, err))
    return result
  })
}

/** `ipcMain.on` for an `IpcSend` channel (no reply). */
export function on<C extends keyof IpcSend>(
  channel: C,
  listener: (event: IpcMainEvent, ...args: Unknowns<IpcSend[C]>) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      log.warn(`${channel}: untrusted sender ignored`)
      return
    }
    // No reply to carry the error: an exception here would become the "JavaScript error in the main process" dialog.
    try {
      listener(event, ...(args as Unknowns<IpcSend[C]>))
    } catch (err) {
      log.error(channel, err)
    }
  })
}

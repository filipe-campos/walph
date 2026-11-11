// Test-only helpers: a fake `ipcMain` that keeps the handlers registered by `ipc/typed.ts`, and a fake `webContents`.
// Do not import from product code.
import { EventEmitter } from 'node:events'
import { vi, type Mock } from 'vitest'
import { trustSender } from '../window/trustedSenders'

type IpcFn = (...args: unknown[]) => unknown

interface IpcHarness {
  /** For `vi.mock('electron', () => ({ ...harness.electronMock, <whatever else the module uses> }))`. */
  electronMock: { ipcMain: { handle: (channel: string, fn: IpcFn) => void; on: (channel: string, fn: IpcFn) => void } }
  /**
   * Calls the `ipcMain.handle` handler; rejects (never throws directly) if it throws or the channel is not registered.
   */
  invoke(channel: string, sender: unknown, ...args: unknown[]): Promise<unknown>
  /** Fires the channel's `ipcMain.on` listeners. */
  emit(channel: string, sender: unknown, ...args: unknown[]): void
  /** Channels registered so far, in alphabetical order. */
  registered(): { invoke: string[]; send: string[] }
  /** Forgets the registrations (between one `register*Handlers()` and the next). */
  reset(): void
}

/** Event from a trusted sender (main frame of a workspace), as `ipcMain` delivers it. */
function trustedEvent(sender: unknown): { sender: unknown; senderFrame: unknown } {
  if (typeof sender !== 'object' || sender === null) return { sender, senderFrame: null }
  const wc = sender as { mainFrame?: unknown }
  wc.mainFrame ??= { routingId: 1 }
  trustSender(sender as Parameters<typeof trustSender>[0])
  return { sender, senderFrame: wc.mainFrame }
}

export function createIpcHarness(): IpcHarness {
  const invokeHandlers = new Map<string, IpcFn>()
  const sendListeners = new Map<string, IpcFn[]>()
  return {
    electronMock: {
      ipcMain: {
        handle: (channel, fn) => {
          // Like the real ipcMain: registering the same channel twice breaks app startup.
          if (invokeHandlers.has(channel)) throw new Error(`Duplicate handler for ${channel}`)
          invokeHandlers.set(channel, fn)
        },
        on: (channel, fn) => void sendListeners.set(channel, [...(sendListeners.get(channel) ?? []), fn])
      }
    },
    invoke: (channel, sender, ...args) =>
      Promise.resolve().then(() => {
        const fn = invokeHandlers.get(channel)
        if (!fn) throw new Error(`No handler registered for ${channel}`)
        return fn(trustedEvent(sender), ...args)
      }),
    emit: (channel, sender, ...args) => {
      const listeners = sendListeners.get(channel)
      if (!listeners) throw new Error(`No listener registered for ${channel}`)
      for (const fn of listeners) fn(trustedEvent(sender), ...args)
    },
    registered: () => ({
      invoke: [...invokeHandlers.keys()].sort(),
      send: [...sendListeners.keys()].sort()
    }),
    reset: () => {
      invokeHandlers.clear()
      sendListeners.clear()
    }
  }
}

function spyOnEmitter(emitter: EventEmitter): void {
  vi.spyOn(emitter, 'on')
  vi.spyOn(emitter, 'once')
  vi.spyOn(emitter, 'emit')
}

/** `EventEmitter` with the spies main code uses on a `WebContents` (e.g. `onViewReset`). */
export class FakeWebContents extends EventEmitter {
  send: Mock<(channel: string, ...payload: unknown[]) => void> = vi.fn()
  isDestroyed: Mock<() => boolean> = vi.fn(() => false)

  constructor() {
    super()
    spyOnEmitter(this)
  }
}

export function fakeWebContents(): FakeWebContents {
  return new FakeWebContents()
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcEvents, IpcInvoke, IpcSend } from '@shared/ipc'
import { UserError } from '../errors'
import { trustSender } from '../window/trustedSenders'

type Raw = (event: unknown, ...args: unknown[]) => unknown
const { invokeHandlers, sendListeners, logError, logWarn } = vi.hoisted(() => ({
  invokeHandlers: new Map<string, Raw>(),
  sendListeners: new Map<string, Raw>(),
  logError: vi.fn(),
  logWarn: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Raw) => invokeHandlers.set(channel, fn),
    on: (channel: string, fn: Raw) => sendListeners.set(channel, fn)
  }
}))
vi.mock('../log', () => ({ createLog: () => ({ error: logError, warn: logWarn }) }))

import { handle, on } from './typed'

/** How Electron's `ipcMain.handle` calls the handler: inside an `async` function. */
const invoke = async (channel: string, event: unknown): Promise<unknown> => invokeHandlers.get(channel)!(event)

function eventFrom(trusted: boolean, subframe = false): { sender: unknown; senderFrame: unknown } {
  const mainFrame = { routingId: 1 }
  const sender = { mainFrame }
  if (trusted) trustSender(sender as never)
  return { sender, senderFrame: subframe ? { routingId: 2 } : mainFrame }
}

// Types-only test: the `@ts-expect-error` fails in `pnpm typecheck` if the compiler stops catching the error.
function typeChecks(): void {
  // nonexistent channel
  // @ts-expect-error renamed channel
  handle('git:statuss', () => [])
  // return type different from the contract
  // @ts-expect-error `fs:exists` returns boolean, not string
  handle('fs:exists', () => 'sim')
  // handler asking for more arguments than the contract has
  // @ts-expect-error `recent:list` takes no arguments
  handle('recent:list', (_e, _a: unknown) => [])
  // @ts-expect-error `update:install` is send, not invoke
  handle('update:install', () => undefined)
  // @ts-expect-error `fs:readDir` is invoke, not send
  on('fs:readDir', () => undefined)
  // correct
  handle('fs:exists', async () => true)
  handle('recent:remove', () => undefined)
  // @ts-expect-error `recent:remove` is void: returns no value
  handle('recent:remove', () => 123)
  on('terminal:kill', () => undefined)
}

describe('IPC channel map', () => {
  it('compiles (the expected errors are in the @ts-expect-error lines)', () => {
    expect(typeof typeChecks).toBe('function')
    const keys: (keyof IpcInvoke | keyof IpcSend | keyof IpcEvents)[] = ['fs:readDir']
    expect(keys).toHaveLength(1)
  })
})

describe('handle error boundary', () => {
  beforeEach(() => {
    invokeHandlers.clear()
    logError.mockClear()
  })

  it('passes UserError through as is, without logging', async () => {
    const own = new UserError('translated message')
    handle('fs:exists', () => Promise.reject(own))
    await expect(invoke('fs:exists', eventFrom(true))).rejects.toBe(own)
    expect(logError).not.toHaveBeenCalled()
  })

  it('logs a plain Error thrown synchronously with the channel and swaps it for the generic text', async () => {
    const raw = new Error("ENOENT: no such file, open '/x'")
    handle('fs:exists', () => {
      throw raw
    })
    const err = await invoke('fs:exists', eventFrom(true)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UserError)
    expect((err as Error).message).toBe(`Erro inesperado: ${raw.message}`)
    expect(logError).toHaveBeenCalledWith('fs:exists', raw)
  })

  it('on a plain Error rejection returns the same promise, with the generic message in the error', async () => {
    const raw = new TypeError('boom')
    const pending = Promise.reject(raw)
    handle('fs:exists', () => pending)
    const returned = invokeHandlers.get('fs:exists')!(eventFrom(true))
    // The same promise: the reply gains no tick of delay relative to the events the handler emitted.
    expect(returned).toBe(pending)
    await expect(returned).rejects.toBe(raw)
    expect(raw.message).toBe('Erro inesperado: boom')
    expect(String(raw)).toBe('Error: Erro inesperado: boom')
    expect(logError).toHaveBeenCalledWith('fs:exists', raw)
  })

  it('returns the handler result', async () => {
    handle('fs:exists', () => true)
    await expect(invoke('fs:exists', eventFrom(true))).resolves.toBe(true)
  })
})

describe('trusted sender', () => {
  beforeEach(() => {
    invokeHandlers.clear()
    sendListeners.clear()
    logWarn.mockClear()
  })

  it('handle rejects foreign webContents and subframes without calling the handler', async () => {
    const spy = vi.fn(() => true)
    handle('fs:exists', spy)
    for (const event of [eventFrom(false), eventFrom(true, true), { ...eventFrom(true), senderFrame: null }]) {
      await expect(invoke('fs:exists', event)).rejects.toThrow('Origem da chamada não autorizada.')
    }
    expect(spy).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledTimes(3)
  })

  it('on drops the message from an untrusted sender and logs a warning', () => {
    const spy = vi.fn()
    on('terminal:kill', spy)
    sendListeners.get('terminal:kill')!(eventFrom(false), 't1')
    sendListeners.get('terminal:kill')!(eventFrom(true, true), 't1')
    expect(spy).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledTimes(2)
    sendListeners.get('terminal:kill')!(eventFrom(true), 't1')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

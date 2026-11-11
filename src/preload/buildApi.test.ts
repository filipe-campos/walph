import { describe, expect, it, vi } from 'vitest'
import { event, invoke, send } from '@shared/ipcSpec'
import { buildApi, type RendererIpc } from './buildApi'

type Listener = (event: unknown, ...args: unknown[]) => void

function fakeIpc(): RendererIpc & { listeners: Map<string, Listener[]> } {
  const listeners = new Map<string, Listener[]>()
  return {
    listeners,
    invoke: vi.fn(async (channel: string, ...args: unknown[]) => ({ channel, args })),
    send: vi.fn(),
    on: vi.fn((channel: string, listener: Listener) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.set(
        channel,
        (listeners.get(channel) ?? []).filter((l) => l !== listener)
      )
    })
  }
}

const spec = {
  onTop: event('app:top'),
  git: { status: invoke('git:status'), cancel: send('git:cancel'), onProgress: event('git:progress') }
}
interface TestApi {
  onTop(cb: (...args: unknown[]) => void): () => void
  git: {
    status(...args: unknown[]): Promise<unknown>
    cancel(...args: unknown[]): void
    onProgress(cb: (...args: unknown[]) => void): () => void
  }
}
const built = (ipc: RendererIpc): TestApi => buildApi(spec, ipc) as unknown as TestApi

describe('buildApi', () => {
  it('keeps the nested shape of the spec', () => {
    const api = built(fakeIpc())
    expect(Object.keys(api)).toEqual(['onTop', 'git'])
    expect(Object.keys(api.git)).toEqual(['status', 'cancel', 'onProgress'])
  })

  it('invoke forwards the arguments to the channel and returns the reply', async () => {
    const ipc = fakeIpc()
    await expect(built(ipc).git.status('/repo', 1)).resolves.toEqual({ channel: 'git:status', args: ['/repo', 1] })
    expect(ipc.invoke).toHaveBeenCalledWith('git:status', '/repo', 1)
  })

  it('send forwards the arguments without waiting for a reply', () => {
    const ipc = fakeIpc()
    expect(built(ipc).git.cancel('a', 2)).toBeUndefined()
    expect(ipc.send).toHaveBeenCalledWith('git:cancel', 'a', 2)
  })

  it('event subscribes to the channel, delivers only the arguments and returns the unsubscribe', () => {
    const ipc = fakeIpc()
    const cb = vi.fn()
    const off = built(ipc).git.onProgress(cb)

    expect(ipc.on).toHaveBeenCalledWith('git:progress', expect.any(Function))
    const listener = ipc.listeners.get('git:progress')![0]
    listener({ sender: 'x' }, 'p', 3)
    expect(cb).toHaveBeenCalledWith('p', 3)

    off()
    expect(ipc.removeListener).toHaveBeenCalledWith('git:progress', listener)
    expect(ipc.listeners.get('git:progress')).toEqual([])
  })

  it('subscriptions to the same channel unsubscribe independently', () => {
    const ipc = fakeIpc()
    const a = vi.fn()
    const b = vi.fn()
    const offA = built(ipc).onTop(a)
    built(ipc).onTop(b)
    offA()
    for (const l of ipc.listeners.get('app:top')!) l({}, 1)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith(1)
  })
})

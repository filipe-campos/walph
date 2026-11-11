import type { WebContents } from 'electron'
import type * as ViewDelivery from './viewDelivery'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent: Array<[string, unknown]> = []

vi.mock('./send', () => ({
  send: (_wc: unknown, channel: string, payload: unknown) => sent.push([channel, payload])
}))
vi.mock('./evictionGuards', () => ({ registerEvictionGuard: vi.fn() }))
vi.mock('./windowState', () => ({ workspaceOf: () => null }))

const crashed = new WeakMap<object, () => void>()
const fakeWc = (destroyed = false): WebContents => {
  const wc = { isDestroyed: () => destroyed, on: (_event: string, cb: () => void) => crashed.set(wc, cb) }
  return wc as unknown as WebContents
}

describe('delivery of commands and open requests', () => {
  let mod: typeof ViewDelivery

  beforeEach(async () => {
    sent.length = 0
    vi.resetModules()
    mod = await import('./viewDelivery')
  })

  it('loading view: keeps the command and delivers it when the renderer is ready', () => {
    const wc = fakeWc()
    mod.deliverCommand(wc, 'workbench.openSettings')
    expect(sent).toEqual([])
    mod.flushQueuedCommand(wc)
    expect(sent).toEqual([['app:command', 'workbench.openSettings']])
  })

  it('ready view: sends right away and leaves nothing queued', () => {
    const wc = fakeWc()
    mod.flushQueuedCommand(wc)
    mod.deliverCommand(wc, 'workbench.openSettings')
    expect(sent).toEqual([['app:command', 'workbench.openSettings']])
    mod.flushQueuedCommand(wc)
    expect(sent).toHaveLength(1)
  })

  it('reloading the view queues again', () => {
    const wc = fakeWc()
    mod.flushQueuedCommand(wc)
    mod.viewNavigated(wc)
    mod.deliverCommand(wc, 'workbench.openSettings')
    expect(sent).toEqual([])
  })

  it('an open folder request follows the same rule', () => {
    const wc = fakeWc()
    mod.deliverOpenRequest(wc, '/r/a')
    expect(sent).toEqual([])
    mod.flushQueuedCommand(wc)
    expect(sent).toEqual([['workspace:openRequested', '/r/a']])
    mod.deliverOpenRequest(wc, '/r/b')
    expect(sent[1]).toEqual(['workspace:openRequested', '/r/b'])
  })

  it('a destroyed view neither receives nor queues', () => {
    const wc = fakeWc(true)
    mod.deliverCommand(wc, 'workbench.openSettings')
    mod.deliverOpenRequest(wc, '/r/a')
    mod.flushQueuedCommand(fakeWc())
    expect(sent).toEqual([])
  })

  it('a renderer that dies before becoming ready discards the queue', () => {
    const wc = fakeWc()
    mod.deliverCommand(wc, 'workbench.openSettings')
    mod.deliverOpenRequest(wc, '/r/a')
    crashed.get(wc)!()
    mod.flushQueuedCommand(wc)
    expect(sent).toEqual([])
  })
})

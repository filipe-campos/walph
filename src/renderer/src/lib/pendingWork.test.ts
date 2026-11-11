import { describe, expect, it } from 'vitest'
import { trackPending } from './pendingWork'

const pending = (): string | undefined => document.documentElement.dataset.pending

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('trackPending', () => {
  it('lists the pending kinds and removes the attribute when everything ends', async () => {
    const a = deferred()
    const b = deferred()
    const c = deferred()
    const all = [trackPending('disk', a.promise), trackPending('disk', b.promise), trackPending('baseline', c.promise)]
    expect(pending()).toBe('disk baseline')
    a.resolve()
    await all[0]
    expect(pending()).toBe('disk baseline')
    b.resolve()
    await all[1]
    expect(pending()).toBe('baseline')
    c.resolve()
    await all[2]
    expect(pending()).toBeUndefined()
  })

  it('a failure also releases and the rejection reaches whoever was waiting', async () => {
    const d = deferred()
    const tracked = trackPending('reopen', d.promise)
    expect(pending()).toBe('reopen')
    d.reject(new Error('falhou'))
    await expect(tracked).rejects.toThrow('falhou')
    expect(pending()).toBeUndefined()
  })
})

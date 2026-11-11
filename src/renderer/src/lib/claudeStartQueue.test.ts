import { describe, expect, it, vi } from 'vitest'
import { createStartQueue, decideAutoStart, type AutoStartInput } from './claudeStartQueue'

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createStartQueue', () => {
  it('with an empty queue the job starts right away (synchronous)', () => {
    const q = createStartQueue<number>()
    const job = vi.fn(() => Promise.resolve(1))
    void q.run(job)
    expect(job).toHaveBeenCalledTimes(1)
    expect(q.busy).toBe(true)
  })

  it('runs one job at a time, in order, and returns the result of each', async () => {
    const q = createStartQueue<string>()
    const first = deferred<string>()
    const order: string[] = []
    const a = q.run(() => (order.push('a'), first.promise))
    const b = q.run(() => (order.push('b'), Promise.resolve('B')))
    expect(order).toEqual(['a'])
    first.resolve('A')
    expect(await a).toBe('A')
    expect(await b).toBe('B')
    expect(order).toEqual(['a', 'b'])
    expect(q.busy).toBe(false)
  })

  it('a failure (rejection or synchronous throw) reaches the caller and does not stall the queue', async () => {
    const q = createStartQueue<number>()
    const a = q.run(() => Promise.reject(new Error('x')))
    const b = q.run(() => {
      throw new Error('y')
    })
    const c = q.run(() => Promise.resolve(3))
    await expect(a).rejects.toThrow('x')
    await expect(b).rejects.toThrow('y')
    expect(await c).toBe(3)
  })

  it('notifies only on the empty ↔ busy edges, never between two consecutive jobs', async () => {
    const changes: boolean[] = []
    const q = createStartQueue<number>((busy) => changes.push(busy))
    const a = q.run(() => Promise.resolve(1))
    const b = q.run(() => Promise.resolve(2))
    await Promise.all([a, b])
    expect(changes).toEqual([true, false])
  })

  it('a notifier that throws stalls neither the queue nor the waiters (the error is rethrown separately)', async () => {
    const rethrown: unknown[] = []
    vi.stubGlobal('queueMicrotask', (cb: () => void) => {
      try {
        cb()
      } catch (err) {
        rethrown.push(err)
      }
    })
    try {
      const q = createStartQueue<number>(() => {
        throw new Error('aviso')
      })
      const a = q.run(() => Promise.resolve(1))
      const b = q.run(() => Promise.resolve(2))
      expect(await a).toBe(1)
      expect(await b).toBe(2)
      expect(q.busy).toBe(false)
      expect(rethrown).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('whoever awaited a job already sees the next one started when it resumes', async () => {
    const q = createStartQueue<number>()
    const next = vi.fn(() => new Promise<number>(() => {}))
    const a = q.run(() => Promise.resolve(1))
    void q.run(next)
    await a
    expect(next).toHaveBeenCalledTimes(1)
    expect(q.busy).toBe(true)
  })

  it('the same key still pending returns the same promise without queuing another job', async () => {
    const q = createStartQueue<number>()
    const gate = deferred<number>()
    const job = vi.fn(() => gate.promise)
    const a = q.run(job, { key: 'k' })
    const b = q.run(() => Promise.resolve(9), { key: 'k' })
    expect(b).toBe(a)
    expect(q.has('k')).toBe(true)
    gate.resolve(5)
    expect(await b).toBe(5)
    expect(q.has('k')).toBe(false)
    expect(await q.run(() => Promise.resolve(6), { key: 'k' })).toBe(6)
    expect(job).toHaveBeenCalledTimes(1)
  })

  it('the key also applies to a job still waiting its turn', () => {
    const q = createStartQueue<number>()
    void q.run(() => new Promise<number>(() => {}))
    const a = q.run(() => Promise.resolve(1), { key: 'k' })
    expect(q.run(() => Promise.resolve(2), { key: 'k' })).toBe(a)
  })

  it('latest returns the most recent unfinished job of the kind', async () => {
    const q = createStartQueue<number>()
    const gate = deferred<number>()
    expect(q.latest('auto')).toBeNull()
    const auto = q.run(() => gate.promise, { kind: 'auto' })
    void q.run(() => Promise.resolve(2))
    expect(q.latest('auto')).toBe(auto)
    expect(q.latest('user')).not.toBeNull()
    gate.resolve(1)
    await auto
    expect(q.latest('auto')).toBeNull()
  })
})

describe('decideAutoStart', () => {
  const base: AutoStartInput = {
    known: true,
    viewActive: true,
    visible: true,
    prevVisible: false,
    hasRoot: true,
    conversations: 0
  }

  it('panel just opened in an active view and without conversations: starts', () => {
    expect(decideAutoStart(base, false)).toEqual({ start: true, deferred: false })
  })

  it('panel was already open: does not start (no pending deferral)', () => {
    expect(decideAutoStart({ ...base, prevVisible: true }, false)).toEqual({ start: false, deferred: false })
  })

  it.each([
    ['view escondida', { viewActive: false }],
    ['unknown workspace list', { known: false }]
  ])('opened with %s: defers', (_, patch) => {
    expect(decideAutoStart({ ...base, ...patch }, false)).toEqual({ start: false, deferred: true })
  })

  it('deferred and the view becomes active with the panel still open: starts and clears the deferral', () => {
    expect(decideAutoStart({ ...base, prevVisible: true }, true)).toEqual({ start: true, deferred: false })
  })

  it('closing the panel or getting a conversation cancels the deferral', () => {
    expect(decideAutoStart({ ...base, visible: false, viewActive: false }, true).deferred).toBe(false)
    expect(decideAutoStart({ ...base, viewActive: false, conversations: 1 }, true).deferred).toBe(false)
  })

  it('without a folder or with conversations it does not start', () => {
    expect(decideAutoStart({ ...base, hasRoot: false }, false).start).toBe(false)
    expect(decideAutoStart({ ...base, conversations: 1 }, false).start).toBe(false)
  })
})

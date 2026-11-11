import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { onViewDestroyed, onViewReset, viewEpoch } from './viewLifecycle'

const fakeWc = (): EventEmitter & never => new EventEmitter() as never

describe('onViewReset', () => {
  it('runs the callbacks on did-navigate, render-process-gone and destroyed', () => {
    const wc = fakeWc()
    const cb = vi.fn()
    onViewReset(wc, 'a', cb)
    ;(wc as EventEmitter).emit('did-navigate')
    ;(wc as EventEmitter).emit('render-process-gone')
    ;(wc as EventEmitter).emit('destroyed')
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('is idempotent per key and uses a single listener per event', () => {
    const wc = fakeWc() as unknown as EventEmitter
    const first = vi.fn()
    const second = vi.fn()
    const other = vi.fn()
    onViewReset(wc as never, 'a', first)
    onViewReset(wc as never, 'a', second)
    onViewReset(wc as never, 'b', other)
    wc.emit('did-navigate')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(other).toHaveBeenCalledTimes(1)
    expect(wc.listenerCount('did-navigate')).toBe(1)
    expect(wc.listenerCount('render-process-gone')).toBe(1)
    expect(wc.listenerCount('destroyed')).toBe(1)
  })

  it('a callback that throws does not stop the others', () => {
    const wc = fakeWc() as unknown as EventEmitter
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ok = vi.fn()
    onViewReset(wc as never, 'bad', () => {
      throw new Error('x')
    })
    onViewReset(wc as never, 'ok', ok)
    wc.emit('destroyed')
    expect(ok).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('the epoch advances before the callbacks and is 0 for an unknown view', () => {
    const wc = fakeWc() as unknown as EventEmitter
    expect(viewEpoch(wc as never)).toBe(0)
    const seen: number[] = []
    onViewReset(wc as never, 'a', () => seen.push(viewEpoch(wc as never)))
    wc.emit('did-navigate')
    wc.emit('did-navigate')
    expect(seen).toEqual([1, 2])
    expect(viewEpoch(wc as never)).toBe(2)
  })
})

describe('onViewDestroyed', () => {
  it('runs only on destroyed, once, and ignores reload and renderer crash', () => {
    const wc = fakeWc() as unknown as EventEmitter
    const cb = vi.fn()
    onViewDestroyed(wc as never, 'a', cb)
    wc.emit('did-navigate')
    wc.emit('render-process-gone')
    expect(cb).not.toHaveBeenCalled()
    wc.emit('destroyed')
    wc.emit('destroyed')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('is idempotent per key and uses a single listener per view', () => {
    const wc = fakeWc() as unknown as EventEmitter
    const first = vi.fn()
    const second = vi.fn()
    const other = vi.fn()
    onViewDestroyed(wc as never, 'a', first)
    onViewDestroyed(wc as never, 'a', second)
    onViewDestroyed(wc as never, 'b', other)
    expect(wc.listenerCount('destroyed')).toBe(1)
    wc.emit('destroyed')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('a callback that throws does not stop the others', () => {
    const wc = fakeWc() as unknown as EventEmitter
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ok = vi.fn()
    onViewDestroyed(wc as never, 'bad', () => {
      throw new Error('x')
    })
    onViewDestroyed(wc as never, 'ok', ok)
    wc.emit('destroyed')
    expect(ok).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it("the cancellation removes only that call's callback", () => {
    const wc = fakeWc() as unknown as EventEmitter
    const first = vi.fn()
    const second = vi.fn()
    const other = vi.fn()
    onViewDestroyed(wc as never, 'a', first)
    const offSecond = onViewDestroyed(wc as never, 'a', second)
    const offOther = onViewDestroyed(wc as never, 'b', other)
    offSecond()
    offOther()
    wc.emit('destroyed')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(other).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmitter } from './emitter'

describe('createEmitter', () => {
  afterEach(() => vi.restoreAllMocks())

  it('delivers the arguments to every listener', () => {
    const emitter = createEmitter<[string, number]>('t')
    const a = vi.fn()
    const b = vi.fn()
    emitter.on(a)
    emitter.on(b)
    emitter.emit('x', 1)
    expect(a).toHaveBeenCalledWith('x', 1)
    expect(b).toHaveBeenCalledWith('x', 1)
  })

  it('the returned unsubscribe removes only that listener', () => {
    const emitter = createEmitter('t')
    const a = vi.fn()
    const b = vi.fn()
    const off = emitter.on(a)
    emitter.on(b)
    off()
    emitter.emit()
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('a listener that throws is logged and stops neither the others nor the emitter', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const emitter = createEmitter('t')
    const ok = vi.fn()
    emitter.on(() => {
      throw new Error('x')
    })
    emitter.on(ok)
    expect(() => emitter.emit()).not.toThrow()
    expect(ok).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('a listener can unsubscribe during emit without skipping the next one', () => {
    const emitter = createEmitter('t')
    const next = vi.fn()
    const off = emitter.on(() => off())
    emitter.on(next)
    emitter.emit()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('a listener removed by another during the same emit is not called', () => {
    const emitter = createEmitter('t')
    const removed = vi.fn()
    let offRemoved = (): void => undefined
    emitter.on(() => offRemoved())
    offRemoved = emitter.on(removed)
    emitter.emit()
    expect(removed).not.toHaveBeenCalled()
  })
})

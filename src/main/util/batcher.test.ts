import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatcher } from './batcher'

describe('createBatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('delivers the burst at once when the deadline expires', () => {
    const deliver = vi.fn()
    const b = createBatcher<number>(100, deliver)
    b.push(1)
    vi.advanceTimersByTime(60)
    b.push(2)
    vi.advanceTimersByTime(39)
    expect(deliver).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(deliver).toHaveBeenCalledOnce()
    expect(deliver).toHaveBeenCalledWith([1, 2])
  })

  it('flush delivers what is pending right away and cancels the timer', () => {
    const deliver = vi.fn()
    const b = createBatcher<number>(100, deliver)
    b.push(1)
    b.flush()
    expect(deliver).toHaveBeenCalledWith([1])
    vi.advanceTimersByTime(500)
    expect(deliver).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('flush with nothing pending delivers nothing', () => {
    const deliver = vi.fn()
    createBatcher<number>(100, deliver).flush()
    expect(deliver).not.toHaveBeenCalled()
  })

  it('a new burst after the delivery opens another batch', () => {
    const deliver = vi.fn()
    const b = createBatcher<number>(100, deliver)
    b.push(1)
    vi.advanceTimersByTime(100)
    b.push(2)
    vi.advanceTimersByTime(100)
    expect(deliver.mock.calls).toEqual([[[1]], [[2]]])
  })

  it('dispose discards what is pending, clears the timer and ignores new items', () => {
    const deliver = vi.fn()
    const b = createBatcher<number>(100, deliver)
    b.push(1)
    b.dispose()
    b.push(2)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(500)
    expect(deliver).not.toHaveBeenCalled()
  })
})

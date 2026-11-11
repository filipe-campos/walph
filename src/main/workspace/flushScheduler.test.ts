import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFlushScheduler } from './flushScheduler'

describe('createFlushScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('groups several schedule calls into a single flush after the delay', () => {
    const flush = vi.fn()
    const s = createFlushScheduler(flush, () => 150)
    s.schedule()
    vi.advanceTimersByTime(100)
    s.schedule()
    vi.advanceTimersByTime(49)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('uses the delay current at scheduling time (inactive = long window)', () => {
    let delay = 2000
    const flush = vi.fn()
    const s = createFlushScheduler(flush, () => delay)
    s.schedule()
    vi.advanceTimersByTime(1999)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(flush).toHaveBeenCalledTimes(1)
    delay = 150
    s.schedule()
    vi.advanceTimersByTime(150)
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('flushNow sends the pending batch right away, without repeating later', () => {
    const flush = vi.fn()
    const s = createFlushScheduler(flush, () => 2000)
    s.schedule()
    s.flushNow()
    expect(flush).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('flushNow with nothing pending does nothing; cancel drops it', () => {
    const flush = vi.fn()
    const s = createFlushScheduler(flush, () => 10)
    s.flushNow()
    s.schedule()
    s.cancel()
    vi.advanceTimersByTime(100)
    expect(flush).not.toHaveBeenCalled()
  })
})

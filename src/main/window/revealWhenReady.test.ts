import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealWhenReady } from './revealWhenReady'

describe('revealWhenReady', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    const wc = new EventEmitter()
    const reveal = vi.fn()
    const cancel = revealWhenReady(wc, reveal, 1000)
    return { wc, reveal, cancel }
  }

  it.each(['did-finish-load', 'did-fail-load', 'destroyed'])(
    'reveals once on %s and releases the listeners',
    (event) => {
      const { wc, reveal } = setup()
      wc.emit(event)
      wc.emit('did-finish-load')
      vi.advanceTimersByTime(5000)
      expect(reveal).toHaveBeenCalledTimes(1)
      expect(wc.eventNames()).toEqual([])
    }
  )

  it('reveals on timeout if the view never finishes loading', () => {
    const { wc, reveal } = setup()
    vi.advanceTimersByTime(999)
    expect(reveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(wc.eventNames()).toEqual([])
  })

  it('cancelling does not reveal and leaves no listener or timer', () => {
    const { wc, reveal, cancel } = setup()
    cancel()
    wc.emit('did-finish-load')
    vi.advanceTimersByTime(5000)
    expect(reveal).not.toHaveBeenCalled()
    expect(wc.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})

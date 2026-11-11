import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIGH_WATERMARK, LOW_WATERMARK, MAX_CHUNK_CHARS, PAUSE_WATCHDOG_MS, TerminalOutput } from './outputBuffer'

describe('TerminalOutput', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup(interval = 16, canPause: () => boolean = () => true) {
    const sent: string[] = []
    const pause = vi.fn()
    const resume = vi.fn()
    const out = new TerminalOutput({
      send: (d) => sent.push(d),
      pause,
      resume,
      interval: () => interval,
      now: Date.now,
      canPause
    })
    return { out, sent, pause, resume }
  }

  it('the first chunk after silence goes out immediately; the following burst is batched', () => {
    const { out, sent } = setup()
    vi.setSystemTime(1000)
    out.push('a')
    expect(sent).toEqual(['a'])
    out.push('b')
    out.push('c')
    expect(sent).toEqual(['a'])
    vi.advanceTimersByTime(16)
    expect(sent).toEqual(['a', 'bc'])
  })

  it('a large batch goes out without waiting for the timer', () => {
    const { out, sent } = setup()
    vi.setSystemTime(1000)
    out.push('x')
    out.push('y'.repeat(MAX_CHUNK_CHARS))
    expect(sent).toHaveLength(2)
    expect(sent[1]).toHaveLength(MAX_CHUNK_CHARS)
  })

  it('larger window for a hidden terminal', () => {
    const { out, sent } = setup(100)
    vi.setSystemTime(1000)
    out.push('a')
    out.push('b')
    vi.advanceTimersByTime(99)
    expect(sent).toEqual(['a'])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual(['a', 'b'])
  })

  it('flush sends what is queued early and dispose discards it', () => {
    const { out, sent } = setup()
    vi.setSystemTime(1000)
    out.push('a')
    out.push('b')
    out.flush()
    expect(sent).toEqual(['a', 'b'])
    out.push('c')
    out.dispose()
    vi.advanceTimersByTime(1000)
    expect(sent).toEqual(['a', 'b'])
  })

  it('pauses the pty above the high watermark and resumes below the low one', () => {
    const { out, pause, resume } = setup()
    vi.setSystemTime(1000)
    const chunk = 'z'.repeat(MAX_CHUNK_CHARS)
    const chunks = Math.ceil(HIGH_WATERMARK / MAX_CHUNK_CHARS) + 1
    for (let i = 0; i < chunks; i++) out.push(chunk)
    expect(pause).toHaveBeenCalledTimes(1)
    out.ack(chunks * MAX_CHUNK_CHARS - LOW_WATERMARK - 1)
    expect(resume).not.toHaveBeenCalled()
    out.ack(1)
    expect(resume).toHaveBeenCalledTimes(1)
    // An excess ack neither makes the counter negative nor resumes twice.
    out.ack(10_000_000)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  function overflow(out: TerminalOutput): void {
    const chunk = 'z'.repeat(MAX_CHUNK_CHARS)
    for (let i = 0; i < Math.ceil(HIGH_WATERMARK / MAX_CHUNK_CHARS) + 1; i++) out.push(chunk)
  }

  it('a hidden terminal is never paused, only batched', () => {
    const { out, pause, sent } = setup(16, () => false)
    vi.setSystemTime(1000)
    overflow(out)
    expect(sent.length).toBeGreaterThan(0)
    expect(pause).not.toHaveBeenCalled()
  })

  it('the watchdog resumes the paused pty without an ack and resets the count', () => {
    const { out, pause, resume } = setup()
    vi.setSystemTime(1000)
    overflow(out)
    expect(pause).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(PAUSE_WATCHDOG_MS - 1)
    expect(resume).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(resume).toHaveBeenCalledTimes(1)
    // Count reset: filling up again pauses again.
    overflow(out)
    expect(pause).toHaveBeenCalledTimes(2)
  })

  it('a partial ack rearms the watchdog', () => {
    const { out, resume } = setup()
    vi.setSystemTime(1000)
    overflow(out)
    vi.advanceTimersByTime(PAUSE_WATCHDOG_MS - 100)
    out.ack(1000)
    vi.advanceTimersByTime(PAUSE_WATCHDOG_MS - 100)
    expect(resume).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('reset resumes the pty and dispose cancels the watchdog', () => {
    const { out, resume } = setup()
    vi.setSystemTime(1000)
    overflow(out)
    out.reset()
    expect(resume).toHaveBeenCalledTimes(1)
    overflow(out)
    out.dispose()
    vi.advanceTimersByTime(PAUSE_WATCHDOG_MS * 2)
    expect(resume).toHaveBeenCalledTimes(1)
  })
})

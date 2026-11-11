import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DockerLogLine } from '@shared/types'
import { fakeGroupProcess, type FakeGroupProcess } from '../testing/fakeGroupProcess'
import { LOGS_BATCH_MAX, LOGS_BATCH_MS, LOGS_HIGH_WATERMARK, LOGS_LOW_WATERMARK, LogsStream } from './logsStream'

const lines = (n: number, from = 0): string => Array.from({ length: n }, (_, i) => `line ${from + i}`).join('\n') + '\n'

describe('LogsStream', () => {
  let fake: FakeGroupProcess
  let batches: DockerLogLine[][]
  let ends: Array<string | null>
  let stream: LogsStream

  beforeEach(() => {
    vi.useFakeTimers()
    fake = fakeGroupProcess()
    batches = []
    ends = []
    stream = new LogsStream({
      spawn: () => fake.proc,
      emit: (l) => batches.push(l),
      end: (e) => ends.push(e)
    })
    stream.start()
  })

  afterEach(() => vi.useRealTimers())

  const texts = (): string[] => batches.flat().map((l) => l.text)

  it('groups what arrives within the window into one batch', () => {
    fake.stdout.emit('data', 'a\nb\n')
    fake.stderr.emit('data', 'c\n')
    expect(batches).toEqual([])
    vi.advanceTimersByTime(LOGS_BATCH_MS)
    expect(batches).toHaveLength(1)
    expect(batches[0].map((l) => [l.text, l.stream])).toEqual([
      ['a', 'stdout'],
      ['b', 'stdout'],
      ['c', 'stderr']
    ])
  })

  it('caps lines per tick and delivers the excess in the following ticks, without losing any', () => {
    const total = LOGS_BATCH_MAX * 2 + 100
    fake.stdout.emit('data', lines(total))
    vi.advanceTimersByTime(LOGS_BATCH_MS)
    expect(batches.map((b) => b.length)).toEqual([LOGS_BATCH_MAX])
    vi.advanceTimersByTime(LOGS_BATCH_MS)
    expect(batches.map((b) => b.length)).toEqual([LOGS_BATCH_MAX, LOGS_BATCH_MAX])
    vi.advanceTimersByTime(LOGS_BATCH_MS)
    expect(texts()).toEqual(Array.from({ length: total }, (_, i) => `line ${i}`))
    vi.advanceTimersByTime(LOGS_BATCH_MS * 5)
    expect(batches).toHaveLength(3)
  })

  it('pauses docker above the high mark and resumes when the queue drops below the low mark', () => {
    fake.stdout.emit('data', lines(LOGS_HIGH_WATERMARK))
    expect(fake.stdout.paused).toBe(false)
    fake.stdout.emit('data', lines(1, LOGS_HIGH_WATERMARK))
    expect(fake.stdout.paused).toBe(true)
    expect(fake.stderr.paused).toBe(true)

    let ticks = 0
    while (fake.stdout.paused) {
      vi.advanceTimersByTime(LOGS_BATCH_MS)
      ticks++
      expect(ticks).toBeLessThan(100)
    }
    const queued = LOGS_HIGH_WATERMARK + 1 - ticks * LOGS_BATCH_MAX
    expect(queued).toBeLessThanOrEqual(LOGS_LOW_WATERMARK)
    expect(queued + LOGS_BATCH_MAX).toBeGreaterThan(LOGS_LOW_WATERMARK)
    expect(fake.stderr.paused).toBe(false)

    vi.advanceTimersByTime(LOGS_BATCH_MS * 20)
    expect(batches.flat()).toHaveLength(LOGS_HIGH_WATERMARK + 1)
  })

  it('on exit, delivers the line without a newline and the whole queue before signalling the end', () => {
    const order: string[] = []
    batches = []
    stream = new LogsStream({
      spawn: () => fake.proc,
      emit: (l) => order.push(`lines:${l.length}`),
      end: (e) => order.push(`end:${e}`)
    })
    fake.child.removeAllListeners()
    stream.start()
    fake.stdout.emit('data', lines(LOGS_BATCH_MAX + 10) + 'rest')
    fake.child.emit('close', 0)
    expect(order).toEqual([`lines:${LOGS_BATCH_MAX}`, 'lines:11', 'end:null'])
  })

  it('exit with a non-zero code ends with the translated cause from stderr', () => {
    fake.stderr.emit('data', 'Error response from daemon: No such container: x\n')
    fake.child.emit('close', 1)
    expect(ends).toHaveLength(1)
    expect(ends[0]).toEqual(expect.any(String))
    expect(ends[0]).not.toBe('')
  })

  it('spawn error ends only once', () => {
    fake.child.emit('error', Object.assign(new Error('boom'), { code: 'ENOENT' }))
    fake.child.emit('close', null)
    expect(ends).toHaveLength(1)
    expect(ends[0]).not.toBeNull()
  })

  it('stop kills the process, drops the queue and signals neither end nor batches', () => {
    fake.stdout.emit('data', lines(10))
    stream.stop()
    expect(fake.kill).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LOGS_BATCH_MS * 4)
    fake.child.emit('close', 143)
    expect(batches).toEqual([])
    expect(ends).toEqual([])
  })

  it('stop with docker paused destroys the pipes and retained chunks do not rearm the tick', () => {
    fake.stdout.emit('data', lines(LOGS_HIGH_WATERMARK + 1))
    expect(fake.stdout.paused).toBe(true)
    fake.stdout.emit('data', lines(10))
    stream.stop()
    expect(fake.stdout.destroy).toHaveBeenCalledTimes(1)
    expect(fake.stderr.destroy).toHaveBeenCalledTimes(1)
    fake.stdout.resume()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(LOGS_BATCH_MS * 4)
    expect(batches).toEqual([])
  })
})

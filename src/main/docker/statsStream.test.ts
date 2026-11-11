import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DockerStatsSample } from '@shared/types'
import { fakeGroupProcess, type FakeGroupProcess } from '../testing/fakeGroupProcess'
import { STATS_IDLE_MS, STATS_RETRY_MS, StatsStream } from './statsStream'

const CLEAR = '\x1b[2J\x1b[H'
const row = (id: string): string =>
  JSON.stringify({
    BlockIO: '0B / 0B',
    CPUPerc: '1.00%',
    Container: id,
    ID: id,
    MemPerc: '2.00%',
    MemUsage: '10MiB / 1GiB',
    Name: id,
    NetIO: '0B / 0B',
    PIDs: '1'
  })

describe('StatsStream', () => {
  let procs: FakeGroupProcess[]
  let frames: DockerStatsSample[][]
  let released: number
  let ready: boolean
  let stream: StatsStream

  beforeEach(() => {
    vi.useFakeTimers()
    procs = []
    frames = []
    released = 0
    ready = true
    stream = new StatsStream({
      ready: () => Promise.resolve(ready),
      spawn: () => {
        const p = fakeGroupProcess()
        procs.push(p)
        return p.proc
      },
      emit: (s) => frames.push(s),
      released: () => released++
    })
  })

  afterEach(() => vi.useRealTimers())

  it('delivers the frame in progress after a moment without data', async () => {
    stream.start()
    await vi.advanceTimersByTimeAsync(0)
    procs[0].stdout.emit('data', `${CLEAR}${row('aaaaaaaaaaaa')}\n`)
    expect(frames).toEqual([])
    vi.advanceTimersByTime(STATS_IDLE_MS)
    expect(frames).toHaveLength(1)
    expect(frames[0][0]).toMatchObject({ id: 'aaaaaaaaaaaa', cpuHistory: [1] })
  })

  it('a process that dies is relaunched after the interval', async () => {
    stream.start()
    await vi.advanceTimersByTimeAsync(0)
    procs[0].child.emit('close', 1)
    await vi.advanceTimersByTimeAsync(STATS_RETRY_MS - 1)
    expect(procs).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(procs).toHaveLength(2)
  })

  it('stop kills the process and cancels the retry', async () => {
    stream.start()
    await vi.advanceTimersByTimeAsync(0)
    procs[0].child.emit('close', 1)
    stream.stop()
    await vi.advanceTimersByTimeAsync(STATS_RETRY_MS * 2)
    expect(procs).toHaveLength(1)
  })

  it('stop during executable resolution never creates the process', async () => {
    stream.start()
    stream.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(procs).toHaveLength(0)
  })

  it('stop kills the live process and silences pending frames', async () => {
    stream.start()
    await vi.advanceTimersByTimeAsync(0)
    procs[0].stdout.emit('data', `${CLEAR}${row('aaaaaaaaaaaa')}\n`)
    stream.stop()
    vi.advanceTimersByTime(STATS_IDLE_MS * 2)
    expect(procs[0].kill).toHaveBeenCalledTimes(1)
    expect(frames).toEqual([])
  })

  it('without an executable, releases the subscription instead of insisting', async () => {
    ready = false
    stream.start()
    await vi.advanceTimersByTimeAsync(STATS_RETRY_MS * 2)
    expect(released).toBe(1)
    expect(procs).toHaveLength(0)
  })

  it('failure to create the process releases the subscription', async () => {
    stream = new StatsStream({
      ready: () => Promise.resolve(true),
      spawn: () => {
        throw new Error('spawn')
      },
      emit: () => undefined,
      released: () => released++
    })
    stream.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(released).toBe(1)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../test/fakeApi'

type DataCb = (id: string, data: string) => void

describe('terminalBus', () => {
  let emit: DataCb
  const ack = vi.fn()

  async function load() {
    vi.resetModules()
    emit = installFakeApi({ terminal: { ack } }).emit.terminal.onData
    return import('./terminalBus')
  }

  beforeEach(() => {
    vi.useFakeTimers()
    ack.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('data buffered without a listener is acked right away (batched) and delivered on connect', async () => {
    const bus = await load()
    emit('t1', 'abc')
    emit('t1', 'de')
    vi.advanceTimersByTime(16)
    expect(ack).toHaveBeenCalledExactlyOnceWith('t1', 5)
    const got: string[] = []
    bus.attachTerminalAcked('t1', (d, done) => {
      got.push(d)
      done()
    })
    expect(got).toEqual(['abc', 'de'])
    // What was buffered is not acked again.
    vi.advanceTimersByTime(100)
    expect(ack).toHaveBeenCalledTimes(1)
  })

  it('with a listener, only acks when done is called', async () => {
    const bus = await load()
    let done: (() => void) | undefined
    bus.attachTerminalAcked('t1', (_d, cb) => (done = cb))
    emit('t1', 'xyz')
    vi.advanceTimersByTime(100)
    expect(ack).not.toHaveBeenCalled()
    done?.()
    vi.advanceTimersByTime(16)
    expect(ack).toHaveBeenCalledExactlyOnceWith('t1', 3)
  })

  it('simple attachTerminal acks on return', async () => {
    const bus = await load()
    bus.attachTerminal('t1', () => undefined)
    emit('t1', '1234')
    vi.advanceTimersByTime(16)
    expect(ack).toHaveBeenCalledExactlyOnceWith('t1', 4)
  })

  it('forgetTerminal drops pending acks and the buffer', async () => {
    const bus = await load()
    emit('t1', 'abc')
    bus.forgetTerminal('t1')
    vi.advanceTimersByTime(100)
    expect(ack).not.toHaveBeenCalled()
    const got: string[] = []
    bus.attachTerminal('t1', (d) => got.push(d))
    expect(got).toEqual([])
  })

  it('the buffer without a listener is capped at ~5 MB dropping the oldest', async () => {
    const bus = await load()
    const chunk = 'a'.repeat(1024 * 1024)
    for (let i = 0; i < 8; i++) emit('t1', chunk)
    let total = 0
    bus.attachTerminal('t1', (d) => (total += d.length))
    expect(total).toBeLessThanOrEqual(5 * 1024 * 1024)
    expect(total).toBeGreaterThan(0)
  })

  it('empty data does not produce an ack', async () => {
    const bus = await load()
    bus.attachTerminal('t1', () => undefined)
    emit('t1', '')
    vi.advanceTimersByTime(100)
    expect(ack).not.toHaveBeenCalled()
  })

  it('acks of different terminals go out in the same window, one message per terminal', async () => {
    const bus = await load()
    bus.attachTerminal('t1', () => undefined)
    emit('t1', 'ab')
    emit('t2', 'xyz')
    emit('t1', 'c')
    vi.advanceTimersByTime(16)
    expect(ack).toHaveBeenCalledTimes(2)
    expect(ack).toHaveBeenCalledWith('t1', 3)
    expect(ack).toHaveBeenCalledWith('t2', 3)
  })

  it('cancelling an old listener does not remove the one that replaced it', async () => {
    const bus = await load()
    const first: string[] = []
    const second: string[] = []
    const offFirst = bus.attachTerminal('t1', (d) => first.push(d))
    bus.attachTerminal('t1', (d) => second.push(d))
    offFirst()
    emit('t1', 'x')
    expect(first).toEqual([])
    expect(second).toEqual(['x'])
  })

  it('after cancelling the listener, the output is buffered again for the next one', async () => {
    const bus = await load()
    const off = bus.attachTerminal('t1', () => undefined)
    off()
    emit('t1', 'guardado')
    const got: string[] = []
    bus.attachTerminal('t1', (d) => got.push(d))
    expect(got).toEqual(['guardado'])
  })

  it('a single chunk larger than the cap is kept (only the oldest is dropped)', async () => {
    const bus = await load()
    emit('t1', 'a'.repeat(6 * 1024 * 1024))
    let total = 0
    bus.attachTerminal('t1', (d) => (total += d.length))
    expect(total).toBe(6 * 1024 * 1024)
  })

  it('onTerminalEnter notifies only when the input has Enter and can be cancelled', async () => {
    const bus = await load()
    const seen: string[] = []
    const off = bus.onTerminalEnter((id) => seen.push(id))
    bus.notifyTerminalInput('t1', 'ls')
    bus.notifyTerminalInput('t1', 'ls\r')
    bus.notifyTerminalInput('t2', '\r')
    off()
    bus.notifyTerminalInput('t3', '\r')
    expect(seen).toEqual(['t1', 't2'])
  })
})

import { describe, expect, it } from 'vitest'
import { deferred } from '../testing/deferred'
import { KeyedSerialQueue, SerialQueue } from './serialQueue'

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('SerialQueue', () => {
  it('runs one task at a time, in order', async () => {
    const q = new SerialQueue()
    const log: string[] = []
    const gate = deferred()
    const a = q.run(async () => {
      log.push('a:start')
      await gate.promise
      log.push('a:end')
      return 1
    })
    const b = q.run(async () => {
      log.push('b')
      return 2
    })
    await tick()
    expect(log).toEqual(['a:start'])
    gate.resolve()
    expect(await Promise.all([a, b])).toEqual([1, 2])
    expect(log).toEqual(['a:start', 'a:end', 'b'])
  })

  it('the failure reaches the caller and does not break the queue', async () => {
    const q = new SerialQueue()
    const a = q.run(() => Promise.reject(new Error('failed')))
    const b = q.run(async () => 'ok')
    await expect(a).rejects.toThrow('failed')
    await expect(b).resolves.toBe('ok')
    await expect(q.run(async () => 'after')).resolves.toBe('after')
  })
})

describe('KeyedSerialQueue', () => {
  it('serializes within a key and keeps different keys independent', async () => {
    const q = new KeyedSerialQueue()
    const log: string[] = []
    const gate = deferred()
    const a1 = q.run('a', async () => {
      await gate.promise
      log.push('a1')
    })
    const a2 = q.run('a', async () => void log.push('a2'))
    await q.run('b', async () => void log.push('b'))
    expect(log).toEqual(['b'])
    gate.resolve()
    await Promise.all([a1, a2])
    expect(log).toEqual(['b', 'a1', 'a2'])
  })

  it('a task error does not break the key chain', async () => {
    const q = new KeyedSerialQueue()
    const a = q.run('k', () => Promise.reject(new Error('x')))
    const b = q.run('k', async () => 'ok')
    await expect(a).rejects.toThrow('x')
    await expect(b).resolves.toBe('ok')
  })

  it('prunes the idle chain, but keeps it while a task is pending', async () => {
    const q = new KeyedSerialQueue()
    const gate = deferred()
    const a = q.run('k', () => gate.promise)
    const b = q.run('k', async () => undefined)
    q.run('fail', () => Promise.reject(new Error('x'))).catch(() => undefined)
    expect(q.size).toBe(2)
    gate.resolve()
    await Promise.all([a, b])
    await tick()
    expect(q.size).toBe(0)
  })
})

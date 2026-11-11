import { describe, expect, it } from 'vitest'
import { PushStream } from './pushStream'

describe('PushStream', () => {
  it('delivers what was pushed before and after consumption, in order', async () => {
    const s = new PushStream<number>()
    s.push(1)
    const it = s[Symbol.asyncIterator]()
    expect(await it.next()).toEqual({ value: 1, done: false })
    const pending = it.next()
    s.push(2)
    expect(await pending).toEqual({ value: 2, done: false })
  })

  it('end() releases waiters and drops later pushes', async () => {
    const s = new PushStream<number>()
    const it = s[Symbol.asyncIterator]()
    const pending = it.next()
    s.end()
    expect((await pending).done).toBe(true)
    s.push(3)
    expect((await it.next()).done).toBe(true)
  })

  it('return() closes the queue', async () => {
    const s = new PushStream<number>()
    const it = s[Symbol.asyncIterator]()
    await it.return?.()
    s.push(1)
    expect((await it.next()).done).toBe(true)
  })

  it('fail() delivers what was already queued and then rejects', async () => {
    const s = new PushStream<number>()
    s.push(1)
    s.fail(new Error('crashed'))
    s.push(2)
    const it = s[Symbol.asyncIterator]()
    expect(await it.next()).toEqual({ value: 1, done: false })
    await expect(it.next()).rejects.toThrow('crashed')
    await expect(it.next()).rejects.toThrow('crashed')
  })

  it('fail() rejects existing waiters', async () => {
    const s = new PushStream<number>()
    const it = s[Symbol.asyncIterator]()
    const pending = it.next()
    s.fail(new Error('crashed'))
    await expect(pending).rejects.toThrow('crashed')
  })

  it('fail() after end() does nothing', async () => {
    const s = new PushStream<number>()
    s.end()
    s.fail(new Error('late'))
    expect((await s[Symbol.asyncIterator]().next()).done).toBe(true)
  })
})

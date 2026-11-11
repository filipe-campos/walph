import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rejectAfter, TIMEOUT, withDeadline } from './deadline'

const reason = new Error('stopped')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('withDeadline', () => {
  it('resolves with the value and clears the timer', async () => {
    await expect(withDeadline(Promise.resolve(7), 1000)).resolves.toBe(7)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns TIMEOUT when the deadline passes first', async () => {
    const result = withDeadline(new Promise<number>(() => undefined), 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(result).resolves.toBe(TIMEOUT)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes on the rejection and clears the timer', async () => {
    await expect(withDeadline(Promise.reject(new Error('x')), 1000)).rejects.toThrow('x')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts with the signal reason and clears the timer', async () => {
    const controller = new AbortController()
    const result = withDeadline(new Promise<number>(() => undefined), 1000, { signal: controller.signal })
    const assertion = expect(result).rejects.toBe(reason)
    controller.abort(reason)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a reason that is not an Error becomes AbortError', async () => {
    const controller = new AbortController()
    const result = withDeadline(new Promise<number>(() => undefined), 1000, { signal: controller.signal })
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort('text')
    await assertion
  })

  it('rejects immediately with an already aborted signal, without arming a timer', async () => {
    const signal = AbortSignal.abort(reason)
    await expect(withDeadline(Promise.resolve(1), 1000, { signal })).rejects.toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('rejectAfter', () => {
  it('resolves with the value and does not create the error', async () => {
    const makeError = vi.fn(() => new Error('deadline'))
    await expect(rejectAfter(Promise.resolve('ok'), 1000, makeError)).resolves.toBe('ok')
    expect(makeError).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with the makeError error at the deadline', async () => {
    const result = rejectAfter(new Promise<number>(() => undefined), 500, () => new Error('deadline'))
    const assertion = expect(result).rejects.toThrow('deadline')
    await vi.advanceTimersByTimeAsync(500)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes on the original rejection and clears the timer', async () => {
    await expect(rejectAfter(Promise.reject(new Error('failure')), 1000, () => new Error('deadline'))).rejects.toThrow(
      'failure'
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts and clears the timer', async () => {
    const controller = new AbortController()
    const result = rejectAfter(new Promise<number>(() => undefined), 1000, () => new Error('deadline'), {
      signal: controller.signal
    })
    const assertion = expect(result).rejects.toBe(reason)
    controller.abort(reason)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
})

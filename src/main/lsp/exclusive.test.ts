import { describe, expect, it } from 'vitest'
import { ExclusiveRequests } from './exclusive'

const gate = () => {
  let open!: () => void
  const promise = new Promise<void>((resolve) => (open = resolve))
  return { promise, open }
}

describe('ExclusiveRequests', () => {
  it('a new request with the same key cancels the previous in-flight one', async () => {
    const ex = new ExclusiveRequests()
    const first = gate()
    const seen: boolean[] = []
    const a = ex.withExclusive('hover', async (token) => {
      await first.promise
      seen.push(token.isCancellationRequested)
      return 'a'
    })
    const b = ex.withExclusive('hover', async (token) => {
      seen.push(token.isCancellationRequested)
      return 'b'
    })
    first.open()
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    expect(seen).toEqual([false, true])
  })

  it('different keys do not cancel each other', async () => {
    const ex = new ExclusiveRequests()
    const hold = gate()
    const a = ex.withExclusive('hover', async (token) => {
      await hold.promise
      return token.isCancellationRequested
    })
    await ex.withExclusive('completion', async () => undefined)
    hold.open()
    expect(await a).toBe(false)
  })

  it('the fn error propagates and the key stays free for the next one', async () => {
    const ex = new ExclusiveRequests()
    await expect(ex.withExclusive('k', () => Promise.reject(new Error('failed')))).rejects.toThrow('failed')
    expect(await ex.withExclusive('k', async (token) => token.isCancellationRequested)).toBe(false)
  })

  it('cancelAll cancels every in-flight request', async () => {
    const ex = new ExclusiveRequests()
    const hold = gate()
    const a = ex.withExclusive('hover', async (token) => {
      await hold.promise
      return token.isCancellationRequested
    })
    ex.cancelAll()
    hold.open()
    expect(await a).toBe(true)
  })
})

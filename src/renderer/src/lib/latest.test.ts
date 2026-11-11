import { describe, expect, it } from 'vitest'
import { createLatest, createLatestByKey } from './latest'

describe('createLatest', () => {
  it('only the last token counts', () => {
    const latest = createLatest()
    const a = latest.next()
    expect(latest.isCurrent(a)).toBe(true)
    const b = latest.next()
    expect(latest.isCurrent(a)).toBe(false)
    expect(latest.isCurrent(b)).toBe(true)
  })

  it('invalidate drops what is in flight without opening a request', () => {
    const latest = createLatest()
    const a = latest.next()
    latest.invalidate()
    expect(latest.isCurrent(a)).toBe(false)
    expect(latest.next()).toBeGreaterThan(a)
  })

  it('current follows the last token', () => {
    const latest = createLatest()
    expect(latest.current()).toBe(0)
    const a = latest.next()
    expect(latest.current()).toBe(a)
    latest.invalidate()
    expect(latest.isCurrent(a)).toBe(false)
    expect(latest.isCurrent(latest.current())).toBe(true)
  })
})

describe('createLatestByKey', () => {
  it('keys do not trample each other', () => {
    const latest = createLatestByKey<string>()
    const a = latest.next('a')
    const b = latest.next('b')
    expect(latest.isCurrent('a', a)).toBe(true)
    expect(latest.isCurrent('b', b)).toBe(true)
    latest.next('a')
    expect(latest.isCurrent('a', a)).toBe(false)
    expect(latest.isCurrent('b', b)).toBe(true)
  })

  it('forget makes the key tokens stale', () => {
    const latest = createLatestByKey<string>()
    const a = latest.next('a')
    latest.forget('a')
    expect(latest.isCurrent('a', a)).toBe(false)
    expect(latest.isCurrent('a', 0)).toBe(false)
    expect(latest.isCurrent('never', 1)).toBe(false)
  })

  it('clear makes the tokens of all keys stale', () => {
    const latest = createLatestByKey<string>()
    const a = latest.next('a')
    const b = latest.next('b')
    latest.clear()
    expect(latest.isCurrent('a', a)).toBe(false)
    expect(latest.isCurrent('b', b)).toBe(false)
  })

  it('after forget an old token does not become valid again with a new request for the key', () => {
    const latest = createLatestByKey<string>()
    const old = latest.next('a')
    latest.forget('a')
    const fresh = latest.next('a')
    expect(fresh).not.toBe(old)
    expect(latest.isCurrent('a', old)).toBe(false)
    expect(latest.isCurrent('a', fresh)).toBe(true)
  })
})

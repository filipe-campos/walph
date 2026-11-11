import { describe, expect, it } from 'vitest'
import { bool, int, oneOf, record } from './args'

describe('int', () => {
  it('accepts integers within the range', () => {
    expect(int(0, { min: 0 }, 'x')).toBe(0)
    expect(int(5, { min: 1, max: 5 }, 'x')).toBe(5)
  })

  it.each([-1, 1.5, NaN, '1', null, undefined, 101])('rejects %j', (value) => {
    expect(() => int(value, { min: 0, max: 100 }, 'bad')).toThrow('bad')
  })
})

describe('oneOf', () => {
  it('returns the allowed value and rejects the rest', () => {
    expect(oneOf('a', ['a', 'b'], 'x')).toBe('a')
    expect(() => oneOf('c', ['a', 'b'], 'bad')).toThrow('bad')
    expect(() => oneOf(undefined, ['a'], 'bad')).toThrow('bad')
  })
})

describe('bool', () => {
  it('only true is true', () => {
    expect(bool(true)).toBe(true)
    for (const value of [1, 'true', null, undefined, {}]) expect(bool(value)).toBe(false)
  })
})

describe('record', () => {
  it('returns objects and replaces the rest with {}', () => {
    const o = { a: 1 }
    expect(record(o)).toBe(o)
    for (const value of [null, undefined, 3, 'x', []]) expect(record(value)).toEqual({})
  })
})

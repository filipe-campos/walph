import { describe, expect, it } from 'vitest'
import { isFiniteNumber, isNonEmptyString, isRecord } from './guards'

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(Object.create(null))).toBe(true)
  })

  it('rejects arrays, null and primitives', () => {
    expect(isRecord([])).toBe(false)
    expect(isRecord([{ a: 1 }])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(1)).toBe(false)
    expect(isRecord(() => 1)).toBe(false)
    expect(isRecord('a')).toBe(false)
  })
})

describe('isNonEmptyString', () => {
  it('accepts strings with content, including only spaces', () => {
    expect(isNonEmptyString('a')).toBe(true)
    expect(isNonEmptyString(' ')).toBe(true)
  })

  it('rejects empty and non-strings', () => {
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString(null)).toBe(false)
    expect(isNonEmptyString(undefined)).toBe(false)
    expect(isNonEmptyString(1)).toBe(false)
    expect(isNonEmptyString(['a'])).toBe(false)
  })
})

describe('isFiniteNumber', () => {
  it('accepts finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(-1.5)).toBe(true)
  })

  it('rejects NaN, infinities and non-numbers', () => {
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
    expect(isFiniteNumber(-Infinity)).toBe(false)
    expect(isFiniteNumber('1')).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
  })
})

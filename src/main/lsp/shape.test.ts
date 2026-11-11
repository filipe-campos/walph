import { describe, expect, it } from 'vitest'
import { asPosition, asRange, asTextEdit, asTextEdits, asTextEditsStrict, isNonNegInt, malformedEdit } from './shape'

const pos = (line: number, character: number) => ({ line, character })
const edit = (newText = 'x') => ({ range: { start: pos(0, 0), end: pos(0, 1) }, newText })

describe('isNonNegInt', () => {
  it.each([0, 1, 42])('accepts %s', (n) => expect(isNonNegInt(n)).toBe(true))
  it.each([-1, 1.5, NaN, Infinity, '1', null])('refuses %s', (n) => expect(isNonNegInt(n)).toBe(false))
})

describe('asPosition', () => {
  it('returns only line and character', () => {
    expect(asPosition({ line: 2, character: 3, extra: 1 })).toEqual(pos(2, 3))
  })
  it.each([
    null,
    {},
    { line: 1 },
    { line: -1, character: 0 },
    { line: 1, character: 0.5 },
    { line: '1', character: 0 }
  ])('refuses %j', (v) => expect(asPosition(v)).toBeNull())
})

describe('asRange', () => {
  it('validates start and end', () => {
    expect(asRange({ start: pos(0, 0), end: pos(1, 2) })).toEqual({ start: pos(0, 0), end: pos(1, 2) })
  })
  it('refuses when one of the sides is missing or invalid', () => {
    expect(asRange({ start: pos(0, 0) })).toBeNull()
    expect(asRange({ start: pos(0, 0), end: { line: -1, character: 0 } })).toBeNull()
    expect(asRange('x')).toBeNull()
  })
})

describe('asTextEdit', () => {
  it('accepts an empty newText and drops extra fields (annotationId)', () => {
    expect(asTextEdit({ ...edit(''), annotationId: 'a' })).toEqual(edit(''))
  })
  it('refuses a non-string newText or an invalid range', () => {
    expect(asTextEdit({ ...edit(), newText: 1 })).toBeNull()
    expect(asTextEdit({ newText: 'x', range: null })).toBeNull()
    expect(asTextEdit(null)).toBeNull()
  })
})

describe('asTextEdits', () => {
  it('drops malformed items keeping the order of the rest', () => {
    expect(asTextEdits([edit('a'), { bad: true }, edit('b')])).toEqual([edit('a'), edit('b')])
  })
  it('a non-array becomes an empty list', () => {
    expect(asTextEdits(null)).toEqual([])
    expect(asTextEdits({})).toEqual([])
  })
})

describe('asTextEditsStrict', () => {
  it('returns all when valid', () => {
    expect(asTextEditsStrict([edit('a'), edit('b')])).toEqual([edit('a'), edit('b')])
    expect(asTextEditsStrict([])).toEqual([])
  })
  it('throws on the first malformed edit', () => {
    expect(() => asTextEditsStrict([edit(), { newText: 'x' }])).toThrow(malformedEdit())
  })
  it('throws if it is not an array', () => {
    expect(() => asTextEditsStrict(undefined)).toThrow(malformedEdit())
  })
})

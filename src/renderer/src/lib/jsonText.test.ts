import { describe, expect, it } from 'vitest'
import { jsonText } from './jsonText'

describe('jsonText', () => {
  it('serializes common values, with or without indentation', () => {
    expect(jsonText({ a: 1 })).toBe('{"a":1}')
    expect(jsonText({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
    expect(jsonText('x')).toBe('"x"')
  })

  it('returns empty for what JSON does not represent', () => {
    expect(jsonText(undefined)).toBe('')
    expect(jsonText(() => 1)).toBe('')
    expect(jsonText(Symbol('s'))).toBe('')
  })

  it('does not throw for cycles or BigInt', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(jsonText(cyclic)).toBe('[object Object]')
    expect(jsonText(10n)).toBe('10')
  })
})

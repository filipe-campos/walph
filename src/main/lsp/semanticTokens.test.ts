import { describe, expect, it } from 'vitest'
import { applySemanticEdits, decodeSemanticTokens, normalizeSemanticTokens, parseTokenData } from './semanticTokens'

const legend = { types: ['variable', 'function', ''], modifiers: ['readonly', 'static'], delta: true }

describe('decodeSemanticTokens', () => {
  it('converts relative positions into absolute ones', () => {
    // Line 0 col 2; same line +4 = col 6; two lines below, col 1.
    const data = [0, 2, 3, 0, 1, 0, 4, 5, 1, 0, 2, 1, 2, 0, 3]
    expect(decodeSemanticTokens(data, 2)).toEqual([0, 2, 3, 0, 1, 0, 6, 5, 1, 0, 2, 1, 2, 0, 3])
  })

  it('skips empty tokens or tokens with a type outside the legend without losing the position', () => {
    const data = [0, 2, 0, 0, 0, 0, 3, 2, 7, 0, 0, 1, 4, 1, 0]
    expect(decodeSemanticTokens(data, 2)).toEqual([0, 6, 4, 1, 0])
  })
})

describe('parseTokenData', () => {
  it('accepts only non-negative integers in groups of 5', () => {
    expect(parseTokenData([0, 0, 1, 0, 0])).toEqual([0, 0, 1, 0, 0])
    expect(parseTokenData([0, 0, 1, 0])).toBeNull()
    expect(parseTokenData([0, 0, -1, 0, 0])).toBeNull()
    expect(parseTokenData([0, 0, 1.5, 0, 0])).toBeNull()
    expect(parseTokenData('x')).toBeNull()
  })
})

describe('applySemanticEdits', () => {
  const prev = [0, 0, 1, 0, 0, 1, 0, 2, 1, 0]

  it('applies the edits over the original array, in any order', () => {
    const edits = [
      { start: 5, deleteCount: 5, data: [2, 0, 3, 1, 0] },
      { start: 0, deleteCount: 0, data: [0, 0, 9, 0, 0] }
    ]
    expect(applySemanticEdits(prev, edits)).toEqual([0, 0, 9, 0, 0, 0, 0, 1, 0, 0, 2, 0, 3, 1, 0])
    expect(applySemanticEdits(prev, [{ start: 0, deleteCount: 5 }])).toEqual([1, 0, 2, 1, 0])
  })

  it('refuses overlapping edits, edits outside the array or that break the groups of 5', () => {
    const overlapping = [
      { start: 0, deleteCount: 6 },
      { start: 5, deleteCount: 0 }
    ]
    expect(applySemanticEdits(prev, overlapping)).toBeNull()
    expect(applySemanticEdits(prev, [{ start: 8, deleteCount: 5 }])).toBeNull()
    expect(applySemanticEdits(prev, [{ start: 0, deleteCount: 1 }])).toBeNull()
    expect(applySemanticEdits(prev, [{ start: 0, deleteCount: 0, data: [-1, 0, 0, 0, 0] }])).toBeNull()
    expect(applySemanticEdits(prev, 'x')).toBeNull()
  })
})

describe('normalizeSemanticTokens', () => {
  it('full answer: tokens decoded with the legend and the cache with the resultId', () => {
    const result = normalizeSemanticTokens({ resultId: 'r1', data: [1, 2, 3, 1, 2] }, legend, null)
    expect(result.tokens).toEqual({ types: legend.types, modifiers: legend.modifiers, data: [1, 2, 3, 1, 2] })
    expect(result.cache).toEqual({ resultId: 'r1', data: [1, 2, 3, 1, 2] })
  })

  it('a delta without a base, malformed or without resultId leaves no cache', () => {
    expect(normalizeSemanticTokens({ edits: [] }, legend, null)).toEqual({ tokens: null, cache: null })
    expect(normalizeSemanticTokens({ data: [1] }, legend, null)).toEqual({ tokens: null, cache: null })
    expect(normalizeSemanticTokens({ data: [0, 0, 1, 0, 0] }, legend, null).cache).toBeNull()
    expect(normalizeSemanticTokens(null, legend, null)).toEqual({ tokens: null, cache: null })
    const unchanged = normalizeSemanticTokens({ resultId: 'r2', edits: [] }, legend, [0, 0, 1, 0, 0])
    expect(unchanged.tokens?.data).toEqual([0, 0, 1, 0, 0])
  })
})

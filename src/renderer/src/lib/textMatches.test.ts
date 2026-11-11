import { describe, expect, it } from 'vitest'
import { findTextMatches, MAX_TEXT_MATCHES } from './textMatches'

describe('findTextMatches', () => {
  it('finds matches inside a span', () => {
    const m = findTextMatches(['foo bar foo'], 'foo', false)
    expect(m.map((x) => [x.start.offset, x.end.offset])).toEqual([
      [0, 3],
      [8, 11]
    ])
  })

  it('ignores case by default and respects it when asked', () => {
    expect(findTextMatches(['Foo FOO foo'], 'foo', false)).toHaveLength(3)
    expect(findTextMatches(['Foo FOO foo'], 'foo', true)).toHaveLength(1)
  })

  it('treats the query as literal text', () => {
    expect(findTextMatches(['a.b axb'], 'a.b', false)).toHaveLength(1)
    expect(findTextMatches(['(x)'], '(x)', false)).toHaveLength(1)
  })

  it('crosses neighboring spans', () => {
    const [m] = findTextMatches(['the ex', 'ample'], 'example', false)
    expect(m.start).toEqual({ segment: 0, offset: 4 })
    expect(m.end).toEqual({ segment: 1, offset: 5 })
  })

  it('an end at the boundary stays in the previous span', () => {
    const [m] = findTextMatches(['ab', 'cd'], 'ab', false)
    expect(m.end).toEqual({ segment: 0, offset: 2 })
  })

  it('an empty query or no spans finds nothing', () => {
    expect(findTextMatches(['abc'], '', false)).toEqual([])
    expect(findTextMatches([], 'a', false)).toEqual([])
  })

  it('skips empty spans', () => {
    const [m] = findTextMatches(['a', '', 'b'], 'ab', false)
    expect(m.start).toEqual({ segment: 0, offset: 0 })
    expect(m.end).toEqual({ segment: 2, offset: 1 })
  })

  it('caps the total', () => {
    expect(findTextMatches(['a'.repeat(MAX_TEXT_MATCHES + 50)], 'a', false)).toHaveLength(MAX_TEXT_MATCHES)
  })
})

describe('findTextMatches with many spans', () => {
  it('maps several matches spread across spans correctly', () => {
    const segments = Array.from({ length: 500 }, (_, i) => (i % 2 ? 'ab ' : 'xab'))
    const matches = findTextMatches(segments, 'ab', true)
    expect(matches).toHaveLength(500)
    expect(matches[0].start).toEqual({ segment: 0, offset: 1 })
    expect(matches[499].start).toEqual({ segment: 499, offset: 0 })
    expect(matches[499].end).toEqual({ segment: 499, offset: 2 })
  })
})

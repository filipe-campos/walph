import { describe, expect, it } from 'vitest'
import { whitespaceRanges } from './renderWhitespace'
import { mergeRulers } from './rulers'

describe('whitespaceRanges', () => {
  const line = '  a b  c\t '

  it('all: every run of spaces or tabs', () => {
    expect(whitespaceRanges(line, 'all')).toEqual([
      [0, 2],
      [3, 4],
      [5, 7],
      [8, 10]
    ])
  })

  it('boundary: hides only the single space between words', () => {
    expect(whitespaceRanges(line, 'boundary')).toEqual([
      [0, 2],
      [5, 7],
      [8, 10]
    ])
    expect(whitespaceRanges('a\tb', 'boundary')).toEqual([[1, 2]])
  })

  it('trailing: only the end of the line (including a whitespace-only line)', () => {
    expect(whitespaceRanges(line, 'trailing')).toEqual([[8, 10]])
    expect(whitespaceRanges('   ', 'trailing')).toEqual([[0, 3]])
    expect(whitespaceRanges('a b', 'trailing')).toEqual([])
  })
})

describe('mergeRulers', () => {
  it('merges the columns without repeating, in order', () => {
    expect(mergeRulers([120, 80], [80, 100])).toEqual([80, 100, 120])
    expect(mergeRulers([], [])).toEqual([])
  })
})

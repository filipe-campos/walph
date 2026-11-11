import { describe, expect, it } from 'vitest'
import { createLineSplitter } from './lineSplitter'

describe('createLineSplitter', () => {
  it('keeps the chunk without a line break', () => {
    const s = createLineSplitter()
    expect(s.feed('a\nb')).toEqual(['a'])
    expect(s.feed('c\n')).toEqual(['bc'])
    expect(s.feed('rest')).toEqual([])
    expect(s.flush()).toEqual(['rest'])
    expect(s.flush()).toEqual([])
  })

  it('joins lines split at any chunk boundary', () => {
    const s = createLineSplitter()
    const out = [...'one\ntwo\nthree\n'].flatMap((c) => s.feed(c))
    expect(out).toEqual(['one', 'two', 'three'])
  })

  it('accepts CRLF, even with the \\r and the \\n in different chunks', () => {
    const s = createLineSplitter()
    expect(s.feed('a\r\nb\r')).toEqual(['a'])
    expect(s.feed('\nc')).toEqual(['b'])
    expect(s.flush()).toEqual(['c'])
  })

  it('preserves empty lines between breaks', () => {
    expect(createLineSplitter().feed('a\n\nb\n')).toEqual(['a', '', 'b'])
  })

  it('emits the pending chunk when it exceeds the limit', () => {
    const s = createLineSplitter(5)
    expect(s.feed('abc')).toEqual([])
    expect(s.feed('defg')).toEqual(['abcdefg'])
    expect(s.flush()).toEqual([])
  })

  it('does not count a chunk that fits the limit as overflow', () => {
    const s = createLineSplitter(5)
    expect(s.feed('abcde')).toEqual([])
    expect(s.flush()).toEqual(['abcde'])
  })
})

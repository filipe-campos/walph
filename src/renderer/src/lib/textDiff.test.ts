import { describe, expect, it } from 'vitest'
import { changedRange } from './textDiff'

function apply(oldText: string, newText: string): string {
  const c = changedRange(oldText, newText)
  return c ? oldText.slice(0, c.from) + c.insert + oldText.slice(c.to) : oldText
}

describe('changedRange', () => {
  it('returns null for equal texts', () => {
    expect(changedRange('abc', 'abc')).toBeNull()
  })
  it('isolates the changed middle', () => {
    expect(changedRange('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' })
    expect(changedRange('one two three', 'one 2 three')).toEqual({ from: 4, to: 7, insert: '2' })
  })
  it('covers insertion at the end, removal and full replacement', () => {
    expect(changedRange('abc', 'abcdef')).toEqual({ from: 3, to: 3, insert: 'def' })
    expect(changedRange('abcdef', 'abc')).toEqual({ from: 3, to: 6, insert: '' })
    expect(changedRange('abc', 'xyz')).toEqual({ from: 0, to: 3, insert: 'xyz' })
    expect(changedRange('', 'novo')).toEqual({ from: 0, to: 0, insert: 'novo' })
  })
  it('does not overlap prefix and suffix on repetitions', () => {
    expect(apply('aaa', 'aaaa')).toBe('aaaa')
    expect(apply('aaaa', 'aa')).toBe('aa')
  })
  it('reproduces the new text in varied cases', () => {
    const cases: [string, string][] = [
      ['a\nb\nc', 'a\nX\nc'],
      ['', ''],
      ['x', ''],
      ['abcabc', 'abcXabc']
    ]
    for (const [a, b] of cases) expect(apply(a, b)).toBe(b)
  })
  it('does not split surrogate pairs', () => {
    const c = changedRange('a😀b', 'a😁b')!
    expect(apply('a😀b', 'a😁b')).toBe('a😁b')
    expect(c.from).toBe(1)
    expect(c.to).toBe(3)
  })
})

describe('changedRange with multibyte UTF-8 and CRLF', () => {
  it('does not split the pair when only the first surrogate differs (common suffix)', () => {
    const a = `a${String.fromCodePoint(0x1f600)}b`
    const b = `a${String.fromCodePoint(0x1fe00)}b`
    const c = changedRange(a, b)!
    expect(c).toEqual({ from: 1, to: 3, insert: String.fromCodePoint(0x1fe00) })
    expect(apply(a, b)).toBe(b)
  })
  it('inserting an emoji in the middle of accented text', () => {
    const a = 'ação e reação'
    const b = 'ação 😀 e reação'
    expect(apply(a, b)).toBe(b)
    expect(changedRange(a, b)).toEqual({ from: 5, to: 5, insert: '😀 ' })
  })
  it('keeps CRLF in the inserted span', () => {
    const a = 'a\r\nb\r\nc'
    const b = 'a\r\nX\r\nY\r\nb\r\nc'
    expect(apply(a, b)).toBe(b)
  })
  it('removing all the text', () => {
    expect(changedRange('abc', '')).toEqual({ from: 0, to: 3, insert: '' })
  })
})

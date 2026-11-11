import { describe, expect, it } from 'vitest'
import { applyChanges, offsetAt } from './applyChanges'

const change = (sl: number, sc: number, el: number, ec: number, text: string) => ({
  range: { start: { line: sl, character: sc }, end: { line: el, character: ec } },
  text
})

describe('offsetAt', () => {
  it('converts line/character and clamps to the ends', () => {
    const text = 'ab\ncde\n'
    expect(offsetAt(text, { line: 1, character: 1 })).toBe(4)
    expect(offsetAt(text, { line: 0, character: 99 })).toBe(2)
    expect(offsetAt(text, { line: 99, character: 0 })).toBe(text.length)
  })
})

describe('applyChanges', () => {
  it('inserts, replaces and deletes', () => {
    expect(applyChanges('hello', [change(0, 5, 0, 5, '!')])).toBe('hello!')
    expect(applyChanges('hello', [change(0, 0, 0, 1, 'J')])).toBe('Jello')
    expect(applyChanges('hello', [change(0, 1, 0, 4, '')])).toBe('ho')
  })

  it('multi-line changes', () => {
    expect(applyChanges('a\nb\nc', [change(0, 1, 2, 0, 'X\nY')])).toBe('aX\nYc')
    expect(applyChanges('a\nb', [change(1, 1, 1, 1, '\nc\nd')])).toBe('a\nb\nc\nd')
  })

  it('applies in sequence, each one over the result of the previous', () => {
    expect(applyChanges('abc', [change(0, 0, 0, 0, 'xx'), change(0, 2, 0, 3, 'Z')])).toBe('xxZbc')
  })

  it('counts in UTF-16 units (emoji = 2)', () => {
    const text = 'a😀b'
    expect(applyChanges(text, [change(0, 3, 0, 4, 'X')])).toBe('a😀X')
    expect(applyChanges(text, [change(0, 1, 0, 3, '')])).toBe('ab')
    expect(applyChanges('é\n😀😀', [change(1, 2, 1, 4, 'x')])).toBe('é\n😀x')
  })

  it('replaces the whole document', () => {
    expect(applyChanges('a\nb', [change(0, 0, 9, 9, 'new')])).toBe('new')
  })
})

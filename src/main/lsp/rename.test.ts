import { describe, expect, it } from 'vitest'
import { normalizePrepareRename, textInRange, wordAt } from './rename'

const r = (l: number, a: number, b: number) => ({ start: { line: l, character: a }, end: { line: l, character: b } })
const text = 'const fooBar = 1\nlet é_ç = fooBar'

describe('textInRange / wordAt', () => {
  it('single-line and multi-line span', () => {
    expect(textInRange(text, r(0, 6, 12))).toBe('fooBar')
    expect(textInRange(text, { start: { line: 0, character: 15 }, end: { line: 1, character: 3 } })).toBe('1\nlet')
    expect(textInRange(text, r(9, 0, 1))).toBe('')
  })

  it('word under the cursor, including at the edges and with accents', () => {
    expect(wordAt(text, { line: 0, character: 8 })).toEqual(r(0, 6, 12))
    expect(wordAt(text, { line: 0, character: 12 })).toEqual(r(0, 6, 12))
    expect(wordAt(text, { line: 1, character: 5 })).toEqual(r(1, 4, 7))
    expect(wordAt(text, { line: 0, character: 5 })).toEqual(r(0, 0, 5))
    expect(wordAt(text, { line: 0, character: 13 })).toBeNull()
    expect(wordAt(text, { line: 7, character: 0 })).toBeNull()
  })
})

describe('normalizePrepareRename', () => {
  const pos = { line: 0, character: 8 }
  it('a plain Range uses the mirror text as the placeholder', () => {
    expect(normalizePrepareRename(r(0, 6, 12), text, pos)).toEqual({ range: r(0, 6, 12), placeholder: 'fooBar' })
  })
  it('{ range, placeholder }', () => {
    expect(normalizePrepareRename({ range: r(0, 6, 12), placeholder: 'x' }, text, pos)).toEqual({
      range: r(0, 6, 12),
      placeholder: 'x'
    })
  })
  it('defaultBehavior uses the word', () => {
    expect(normalizePrepareRename({ defaultBehavior: true }, text, pos)).toEqual({
      range: r(0, 6, 12),
      placeholder: 'fooBar'
    })
  })
  it('null and invalid', () => {
    expect(normalizePrepareRename(null, text, pos)).toBeNull()
    expect(normalizePrepareRename({ range: 3 }, text, pos)).toBeNull()
  })
})

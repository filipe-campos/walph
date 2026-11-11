import { describe, expect, it } from 'vitest'
import { flattenControl, hasControl, stripAnsi, stripControl } from './controlChars'

describe('stripAnsi', () => {
  it('removes colors and cursor movements', () => {
    expect(stripAnsi('\u001b[31mred\u001b[0m')).toBe('red')
    expect(stripAnsi('\u001b[2J\u001b[Hok')).toBe('ok')
    expect(stripAnsi('\u001b[?25lok\u001b[?25h')).toBe('ok')
    expect(stripAnsi('a\u001b[1;38;5;196mb')).toBe('ab')
  })

  it('removes CSI with a final byte outside the letters', () => {
    expect(stripAnsi('a\u001b[3~b')).toBe('ab')
    expect(stripAnsi('a\u001b[1 qb')).toBe('ab')
  })

  it('removes OSC terminated by BEL or ST', () => {
    expect(stripAnsi('\u001b]8;;http://x\u0007link\u001b]8;;\u0007')).toBe('link')
    expect(stripAnsi('\u001b]0;title\u001b\\text')).toBe('text')
  })

  it('keeps text without escapes', () => {
    expect(stripAnsi('plain [31m text')).toBe('plain [31m text')
  })
})

describe('hasControl', () => {
  it('detects C0, DEL, C1 and unicode separators', () => {
    for (const c of ['\u0000', '\n', '\u001f', '\u007f', '\u0085', '\u009f', ' ', ' ']) {
      expect(hasControl(`a${c}b`)).toBe(true)
    }
  })

  it('accepts plain text, including space and unicode', () => {
    expect(hasControl('olá mundo — 日本')).toBe(false)
    expect(hasControl('')).toBe(false)
  })
})

describe('stripControl', () => {
  it('removes all control characters by default', () => {
    expect(stripControl('a\u0000b\nc\td\u007fe\u0085f g')).toBe('abcdefg')
  })

  it('with keepNewlines keeps \\n and \\t and normalizes \\r', () => {
    expect(stripControl('a\r\nb\rc\td\u0000e\u007f', { keepNewlines: true })).toBe('a\nb\nc\tde')
  })

  it('with keepNewlines still removes C1 and unicode separators', () => {
    expect(stripControl('a\u0085b c', { keepNewlines: true })).toBe('abc')
  })
})

describe('flattenControl', () => {
  it('replaces each run of control characters with a space', () => {
    expect(flattenControl('a\n\nb\u0000\tc')).toBe('a b c')
  })

  it('does not trim or merge spaces', () => {
    expect(flattenControl('\na  b\n')).toBe(' a  b ')
  })
})

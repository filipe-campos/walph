import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { byteToCharOffset, parseRgLine } from './parseRipgrep'

interface Sub {
  start: number
  end: number
}

function matchEvent(relPath: string, lineText: string, lineNumber: number, subs: Sub[]): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: relPath },
      lines: { text: lineText },
      line_number: lineNumber,
      absolute_offset: 0,
      submatches: subs.map((s) => ({ match: { text: '' }, ...s }))
    }
  })
}

/** UTF-8 byte offsets of `needle` inside `hay`, as ripgrep would report them. */
function byteRange(hay: string, needle: string): Sub {
  const idx = hay.indexOf(needle)
  const start = Buffer.byteLength(hay.slice(0, idx))
  return { start, end: start + Buffer.byteLength(needle) }
}

describe('byteToCharOffset', () => {
  it('keeps the offset in ASCII text', () => {
    expect(byteToCharOffset('hello', 3)).toBe(3)
  })

  it('converts UTF-8 byte offsets to characters with accents', () => {
    // "ação": a(1) ç(2) ã(2) o(1)
    expect(byteToCharOffset('ação', 0)).toBe(0)
    expect(byteToCharOffset('ação', 1)).toBe(1)
    expect(byteToCharOffset('ação', 3)).toBe(2)
    expect(byteToCharOffset('ação', 5)).toBe(3)
    expect(byteToCharOffset('ação', 6)).toBe(4)
  })

  it('counts an emoji as a surrogate pair (2 UTF-16 units)', () => {
    // "😀" takes 4 bytes and 2 UTF-16 units
    expect(byteToCharOffset('😀x', 4)).toBe(2)
    expect(byteToCharOffset('😀x', 5)).toBe(3)
  })

  it('converts 3-byte CJK characters', () => {
    expect(byteToCharOffset('日本語', 6)).toBe(2)
  })
})

describe('parseRgLine', () => {
  it('ignores a file whose name is not UTF-8 (path.bytes)', () => {
    const ev = JSON.stringify({
      type: 'match',
      data: {
        path: { bytes: 'Zm//LnR4dA==' },
        lines: { text: 'abc\n' },
        line_number: 1,
        submatches: [{ match: { text: 'b' }, start: 1, end: 2 }]
      }
    })
    expect(parseRgLine(ev, '/repo')).toBeNull()
  })

  const root = join('/proj')

  it('returns null for invalid JSON', () => {
    expect(parseRgLine('{this is not json', root)).toBeNull()
    expect(parseRgLine('', root)).toBeNull()
  })

  it.each(['begin', 'end', 'summary', 'context'])('returns null for the %s event', (type) => {
    expect(parseRgLine(JSON.stringify({ type, data: {} }), root)).toBeNull()
  })

  it('returns null for JSON that is not an object', () => {
    expect(parseRgLine('null', root)).toBeNull()
  })

  it('reads an ASCII match with an absolute path', () => {
    const line = 'const foo = 1\n'
    const r = parseRgLine(matchEvent('src/a.ts', line, 7, [byteRange(line, 'foo')]), root)
    expect(r).toEqual({
      path: join(root, 'src/a.ts'),
      matches: [{ line: 7, column: 6, length: 3, text: 'const foo = 1' }]
    })
  })

  it('uses columns in characters when there are accents before the match', () => {
    const line = 'ação: buscar\n'
    const r = parseRgLine(matchEvent('a.txt', line, 1, [byteRange(line, 'buscar')]), root)
    expect(r?.matches).toEqual([{ line: 1, column: 6, length: 6, text: 'ação: buscar' }])
  })

  it('uses length in characters when the match itself has multibyte', () => {
    const line = 'x ação y\n'
    const r = parseRgLine(matchEvent('a.txt', line, 2, [byteRange(line, 'ação')]), root)
    expect(r?.matches[0]).toMatchObject({ column: 2, length: 4 })
  })

  it('uses UTF-16 units for emoji', () => {
    const line = '😀 target\n'
    const r = parseRgLine(matchEvent('e.txt', line, 3, [byteRange(line, 'target')]), root)
    expect(r?.matches[0]).toMatchObject({ column: 3, length: 6 })

    const emoji = parseRgLine(matchEvent('e.txt', line, 3, [byteRange(line, '😀')]), root)
    expect(emoji?.matches[0]).toMatchObject({ column: 0, length: 2 })
  })

  it('strips the CRLF line ending from the text', () => {
    const line = 'abc foo\r\n'
    const r = parseRgLine(matchEvent('w.txt', line, 1, [byteRange(line, 'foo')]), root)
    expect(r?.matches[0]).toEqual({ line: 1, column: 4, length: 3, text: 'abc foo' })
  })

  it('strips the LF line ending from the text', () => {
    const line = 'abc foo\n'
    expect(parseRgLine(matchEvent('w.txt', line, 1, [byteRange(line, 'foo')]), root)?.matches[0].text).toBe('abc foo')
  })

  it('returns one entry per submatch on the same line', () => {
    const line = 'ré foo ré foo\n'
    const first = byteRange(line, 'foo')
    const second = { start: first.start + Buffer.byteLength('foo ré '), end: first.end + Buffer.byteLength('foo ré ') }
    const r = parseRgLine(matchEvent('m.txt', line, 9, [first, second]), root)
    expect(r?.matches).toEqual([
      { line: 9, column: 3, length: 3, text: 'ré foo ré foo' },
      { line: 9, column: 10, length: 3, text: 'ré foo ré foo' }
    ])
  })

  it('accepts a line without text (non-UTF-8 bytes)', () => {
    const ev = JSON.stringify({
      type: 'match',
      data: { path: { text: 'b.bin' }, lines: { bytes: 'AAAA' }, line_number: 1, submatches: [{ start: 0, end: 0 }] }
    })
    expect(parseRgLine(ev, root)?.matches).toEqual([{ line: 1, column: 0, length: 0, text: '' }])
  })
})

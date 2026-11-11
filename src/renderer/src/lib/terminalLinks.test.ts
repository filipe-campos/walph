import { describe, expect, it } from 'vitest'
import { findFileLinks, joinRows, rangeOf, type CellInfo } from './terminalLinks'

const paths = (text: string): string[] => findFileLinks(text).map((l) => text.slice(l.start, l.end))

describe('findFileLinks', () => {
  it('recognizes path:line:column and path:line', () => {
    expect(findFileLinks('src/a.ts:12:5')).toEqual([{ start: 0, end: 13, path: 'src/a.ts', line: 12, column: 5 }])
    expect(findFileLinks('src/a.ts:12')).toEqual([{ start: 0, end: 11, path: 'src/a.ts', line: 12 }])
  })

  it('recognizes the tsc format: path(line,column) and path(line)', () => {
    const text = 'src/main/x.ts(67,3): error TS2739: Type'
    expect(findFileLinks(text)).toEqual([{ start: 0, end: 19, path: 'src/main/x.ts', line: 67, column: 3 }])
    expect(findFileLinks('src/a.ts(12)')).toEqual([{ start: 0, end: 12, path: 'src/a.ts', line: 12 }])
    expect(findFileLinks('a.ts(1, 2)')[0]).toMatchObject({ path: 'a.ts', line: 1, column: 2 })
  })

  it('recognizes the tsc "pretty" format: path:line:column - error TSxxxx', () => {
    const text = 'src/a.ts:12:5 - error TS2322: Type x'
    expect(findFileLinks(text)).toEqual([{ start: 0, end: 13, path: 'src/a.ts', line: 12, column: 5 }])
  })

  it('recognizes several paths on the same line, each with its own suffix', () => {
    const text = 'from src/a.ts(1,2) to src/b.ts:3:4'
    expect(findFileLinks(text).map((l) => [l.path, l.line, l.column])).toEqual([
      ['src/a.ts', 1, 2],
      ['src/b.ts', 3, 4]
    ])
  })

  it('recognizes absolute, ./, ../ and ~/', () => {
    expect(paths('/usr/lib/x.js:1:1')).toEqual(['/usr/lib/x.js:1:1'])
    expect(findFileLinks('./a.ts:3')[0].path).toBe('./a.ts')
    expect(findFileLinks('../b/c.ts:3')[0].path).toBe('../b/c.ts')
    expect(findFileLinks('~/proj/d.ts:3')[0].path).toBe('~/proj/d.ts')
  })

  it('recognizes Windows paths with a drive', () => {
    expect(findFileLinks('C:\\x\\y.ts:3:1')).toEqual([{ start: 0, end: 13, path: 'C:\\x\\y.ts', line: 3, column: 1 }])
    expect(findFileLinks('D:/x/y.ts(3,1)')[0]).toMatchObject({ path: 'D:/x/y.ts', line: 3, column: 1 })
  })

  it('accepts paths in quotes, parentheses and brackets', () => {
    expect(findFileLinks('"src/a.ts"')[0]).toMatchObject({ start: 1, end: 9, path: 'src/a.ts' })
    expect(findFileLinks('at fn (src/a.ts:12:5)')[0]).toMatchObject({ path: 'src/a.ts', line: 12, column: 5 })
    expect(findFileLinks('[src/a.ts:3]')[0]).toMatchObject({ path: 'src/a.ts', line: 3 })
  })

  it('does not include trailing punctuation', () => {
    expect(findFileLinks('see src/a.ts.')[0]).toMatchObject({ path: 'src/a.ts', end: 12 })
    expect(findFileLinks('src/a.ts:')[0]).toMatchObject({ path: 'src/a.ts', end: 8 })
    expect(findFileLinks('src/a.ts:12:')[0]).toMatchObject({ line: 12, end: 11 })
    expect(findFileLinks('src/a.ts, src/b.ts')).toHaveLength(2)
  })

  it('a bare path requires a separator or an extension', () => {
    expect(findFileLinks('error TS2739 foo 1.5 10.0.0.1:8080')).toEqual([])
    expect(findFileLinks('Makefile')).toEqual([])
    expect(findFileLinks('README.md')[0].path).toBe('README.md')
    expect(findFileLinks('src/main')[0].path).toBe('src/main')
    expect(findFileLinks('// / --')).toEqual([])
  })

  it('accepts --option=path', () => {
    expect(findFileLinks('--file=src/a.ts')[0]).toMatchObject({ path: 'src/a.ts', start: 7 })
  })

  it('leaves the URLs to the web-links addon', () => {
    expect(findFileLinks('https://example.com/y.ts')).toEqual([])
    expect(findFileLinks('abra https://x.dev/a/b.ts:3 e src/a.ts')).toEqual([
      expect.objectContaining({ path: 'src/a.ts' })
    ])
    expect(findFileLinks('file:///tmp/a.ts')).toEqual([])
  })

  it('finds several on the same line', () => {
    expect(findFileLinks('src/a.ts:1:2 -> src/b.ts:3:4').map((l) => l.path)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('line 0 becomes 1', () => {
    expect(findFileLinks('a.ts:0:0')[0]).toMatchObject({ line: 1, column: 1 })
  })
})

const row = (text: string): CellInfo[] => [...text].map((chars) => ({ chars, width: 1 }))

describe('joinRows / rangeOf', () => {
  it('maps the text to cells, including across wrapped lines', () => {
    const joined = joinRows([row('ab src/'), row('a.ts:1')])
    expect(joined.text).toBe('ab src/a.ts:1')
    // "src/a.ts:1" takes the end of the 1st line and the whole 2nd
    expect(rangeOf(joined, 3, 13, 5)).toEqual({ start: { x: 4, y: 5 }, end: { x: 6, y: 6 } })
  })

  it('wide characters take two cells', () => {
    const cells: CellInfo[] = [
      { chars: '日', width: 2 },
      { chars: '', width: 0 },
      { chars: 'a', width: 1 },
      { chars: '.', width: 1 },
      { chars: 't', width: 1 }
    ]
    const joined = joinRows([cells])
    expect(joined.text).toBe('日a.t')
    // "a.t" starts at cell 3 (x = 3, from 1) and ends at 5
    expect(rangeOf(joined, 1, 4, 1)).toEqual({ start: { x: 3, y: 1 }, end: { x: 5, y: 1 } })
    expect(rangeOf(joined, 0, 1, 1)).toEqual({ start: { x: 1, y: 1 }, end: { x: 2, y: 1 } })
  })

  it('empty cells become a space and a range outside the text gives null', () => {
    const joined = joinRows([[{ chars: '', width: 1 }, ...row('a')]])
    expect(joined.text).toBe(' a')
    expect(rangeOf(joined, 5, 6, 1)).toBeNull()
  })
})

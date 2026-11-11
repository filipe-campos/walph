import { describe, expect, it } from 'vitest'
import { buildPatch, selectRawLines, splitRawLines } from './rangePatch'

describe('splitRawLines', () => {
  it('keeps the terminator and the last line without a break', () => {
    expect(splitRawLines('a\r\nb\nc')).toEqual(['a\r\n', 'b\n', 'c'])
    expect(splitRawLines('a\n')).toEqual(['a\n'])
    expect(splitRawLines('')).toEqual([])
  })
})

describe('buildPatch', () => {
  it('without a difference returns null', () => {
    expect(buildPatch('a.txt', ['a\n'], ['a\n'])).toBeNull()
  })

  it('hunk with context and headers', () => {
    const old = ['1\n', '2\n', '3\n', '4\n', '5\n']
    const now = ['1\n', '2\n', 'tres\n', '4\n', '5\n']
    expect(buildPatch('dir/a.txt', old, now, 1)).toBe(
      'diff --git a/dir/a.txt b/dir/a.txt\n--- a/dir/a.txt\n+++ b/dir/a.txt\n@@ -2,3 +2,3 @@\n 2\n-3\n+tres\n 4\n'
    )
  })

  it('distant hunks become separate hunks; close ones, a single one', () => {
    const old = Array.from({ length: 20 }, (_, i) => `${i}\n`)
    const far = old.map((l, i) => (i === 1 || i === 15 ? `x${l}` : l))
    expect(buildPatch('a', old, far)?.match(/^@@/gm)).toHaveLength(2)
    const near = old.map((l, i) => (i === 1 || i === 6 ? `x${l}` : l))
    expect(buildPatch('a', old, near)?.match(/^@@/gm)).toHaveLength(1)
  })

  it('marks the missing newline at the end and inserts at the start of an empty file', () => {
    expect(buildPatch('a', ['a\n', 'b'], ['a\n', 'b\n'], 0)).toBe(
      'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -2,1 +2,1 @@\n-b\n\\ No newline at end of file\n+b\n'
    )
    expect(buildPatch('a', [], ['x\n'])).toContain('@@ -0,0 +1,1 @@\n+x\n')
  })

  it('a path with a special character goes quoted and non-ASCII as UTF-8 bytes', () => {
    expect(buildPatch('a"b.txt', [], ['x\n'])).toContain('--- "a/a\\"b.txt"\n')
    const patch = buildPatch('ação.txt', [], ['x\n']) ?? ''
    expect(Buffer.from(patch, 'latin1').toString('utf8')).toContain('+++ b/ação.txt\n')
  })
})

describe('selectRawLines', () => {
  it('CRLF in the working tree with an LF index goes in as LF', () => {
    expect(selectRawLines('a\nb\n', 'a\r\nB\r\nc\r\n', [{ from: 2, to: 2 }], 'apply')).toEqual(['a\n', 'B\n'])
  })

  it('a line without a newline at the end that stops being the last gets a terminator', () => {
    expect(selectRawLines('a\nb', 'a\nb\nc', [{ from: 3, to: 3 }], 'apply').join('')).toBe('a\nb\nc')
  })
})

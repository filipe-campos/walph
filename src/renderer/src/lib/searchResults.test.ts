import { describe, expect, it } from 'vitest'
import type { SearchMatch, SearchResult } from '@shared/types'
import { createReplacer } from '@shared/searchReplace'
import { escapeRegex, pruneReplaced, searchKey, stepCursor } from './searchResults'

const opts = { caseSensitive: true, regex: false, wholeWord: false }
const m = (line: number, column: number, text: string, length = 3): SearchMatch => ({ line, column, length, text })

describe('escapeRegex', () => {
  it('escapes metacharacters', () => {
    expect(escapeRegex('a.b*(c)')).toBe('a\\.b\\*\\(c\\)')
    expect(new RegExp(escapeRegex('x[1]+$')).test('x[1]+$')).toBe(true)
  })
})

describe('searchKey', () => {
  it('changes with the folder, the query and the options', () => {
    expect(searchKey('/a', 'x', opts)).not.toBe(searchKey('/b', 'x', opts))
    expect(searchKey('/a', 'x', opts)).not.toBe(searchKey('/a', 'x', { ...opts, include: '*.ts' }))
  })
})

describe('stepCursor', () => {
  const files = [
    { path: '/a', matches: [m(1, 0, 'foo'), m(2, 0, 'foo')] },
    { path: '/b', matches: [m(1, 0, 'foo')] }
  ]
  it('without a cursor starts at the first/last', () => {
    expect(stepCursor(files, null, 1)).toEqual({ path: '/a', index: 0 })
    expect(stepCursor(files, null, -1)).toEqual({ path: '/b', index: 0 })
  })
  it('moves across files and wraps around', () => {
    expect(stepCursor(files, { path: '/a', index: 1 }, 1)).toEqual({ path: '/b', index: 0 })
    expect(stepCursor(files, { path: '/b', index: 0 }, 1)).toEqual({ path: '/a', index: 0 })
    expect(stepCursor(files, { path: '/a', index: 0 }, -1)).toEqual({ path: '/b', index: 0 })
  })
  it('an invalid cursor is treated as absent; without results returns null', () => {
    expect(stepCursor(files, { path: '/zzz', index: 0 }, 1)).toEqual({ path: '/a', index: 0 })
    expect(stepCursor([], null, 1)).toBeNull()
  })
})

describe('pruneReplaced', () => {
  const replacer = createReplacer('foo', 'barbaz', opts)!
  const result = (): SearchResult => ({
    totalMatches: 4,
    truncated: false,
    files: [
      { path: '/a', matches: [m(1, 0, 'foo x foo'), m(1, 6, 'foo x foo'), m(3, 2, 'a foo')] },
      { path: '/b', matches: [m(1, 0, 'foo')] }
    ]
  })

  it('removes the replaced ones and shifts the remaining ones on the same line', () => {
    const out = pruneReplaced(result(), new Map([['/a', new Set([0])]]), replacer)
    expect(out.totalMatches).toBe(3)
    expect(out.files[0].matches).toEqual([m(1, 9, 'barbaz x foo'), m(3, 2, 'a foo')])
    expect(out.files[1]).toEqual(result().files[1])
  })

  it('a file without remaining matches disappears', () => {
    const out = pruneReplaced(result(), new Map([['/b', new Set([0])]]), replacer)
    expect(out.files.map((f) => f.path)).toEqual(['/a'])
    expect(out.totalMatches).toBe(3)
  })

  it('replacing all of a line updates the total', () => {
    const out = pruneReplaced(result(), new Map([['/a', new Set([0, 1, 2])]]), replacer)
    expect(out.files.map((f) => f.path)).toEqual(['/b'])
    expect(out.totalMatches).toBe(1)
  })

  it('replacing the second does not shift the first, but updates the text', () => {
    const out = pruneReplaced(result(), new Map([['/a', new Set([1])]]), replacer)
    expect(out.files[0].matches[0]).toEqual(m(1, 0, 'foo x barbaz'))
  })

  it('keeps the match if the replacer does not reproduce it', () => {
    const out = pruneReplaced(result(), new Map([['/b', new Set([0])]]), () => null)
    expect(out.files).toHaveLength(2)
    expect(out.totalMatches).toBe(4)
  })

  it('drops a remaining match that overlapped a replacement', () => {
    const r: SearchResult = {
      totalMatches: 2,
      truncated: false,
      files: [{ path: '/a', matches: [m(1, 0, 'foofoo', 3), m(1, 2, 'foofoo', 3)] }]
    }
    const out = pruneReplaced(r, new Map([['/a', new Set([0])]]), replacer)
    expect(out.files).toEqual([])
    expect(out.totalMatches).toBe(0)
  })

  it('several edits before the match, of different sizes, shift the column by the sum', () => {
    const text = 'foo foo foo foo'
    const r: SearchResult = {
      totalMatches: 4,
      truncated: false,
      files: [{ path: '/a', matches: [m(1, 0, text), m(1, 4, text), m(1, 8, text), m(1, 12, text)] }]
    }
    // Replaces the first two (+3 each): the third and the fourth move by 6.
    const out = pruneReplaced(r, new Map([['/a', new Set([0, 1])]]), replacer)
    expect(out.totalMatches).toBe(2)
    expect(out.files[0].matches.map((x) => x.column)).toEqual([14, 18])
    expect(out.files[0].matches[0].text).toBe('barbaz barbaz foo foo')
    // With a replacer that shortens (foo -> x), the shift is negative and adds up per edit.
    const shrink = createReplacer('foo', 'x', opts)!
    const out2 = pruneReplaced(r, new Map([['/a', new Set([0, 2])]]), shrink)
    expect(out2.files[0].matches.map((x) => x.column)).toEqual([2, 8])
    expect(out2.files[0].matches[0].text).toBe('x foo x foo')
  })
})

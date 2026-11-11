import { describe, expect, it } from 'vitest'
import { mergeScopes, stickyLines, type Scope } from './stickyScroll'

// class (1–30) > method (3–20) > if (5–10); another function (22–28) inside the class.
const scopes: Scope[] = [
  { header: 1, end: 30 },
  { header: 3, end: 20 },
  { header: 5, end: 10 },
  { header: 22, end: 28 }
]
const at = (line: number): Scope[] => scopes.filter((s) => s.header < line && s.end >= line)

describe('stickyLines', () => {
  it('nothing to pin at the top of the file', () => {
    expect(stickyLines(at, 1, 5)).toEqual([])
  })

  it('headers from the outside in, considering the lines the strip covers', () => {
    // Top at line 2: only the class encloses; with it pinned the probed line becomes 3, which is the method header
    // itself.
    expect(stickyLines(at, 2, 5)).toEqual([1])
    // Top at 4: the strip covers 4 and 5; at 6 class, method and if already apply.
    expect(stickyLines(at, 4, 5)).toEqual([1, 3, 5])
  })

  it('respects the maximum', () => {
    expect(stickyLines(at, 6, 2)).toEqual([1, 3])
    expect(stickyLines(at, 6, 0)).toEqual([])
  })

  it('a scope leaves when its last line reaches the line it would take', () => {
    // Top at 8: the if (5–10) would take the 3rd pinned line (line 10), where it ends.
    expect(stickyLines(at, 8, 5)).toEqual([1, 3])
    expect(stickyLines(at, 23, 5)).toEqual([1, 22])
    expect(stickyLines(at, 29, 5)).toEqual([1])
  })
})

describe('mergeScopes', () => {
  it('one scope per header (the longest), in order', () => {
    expect(
      mergeScopes([
        { header: 5, end: 9 },
        { header: 1, end: 30 },
        { header: 5, end: 12 }
      ])
    ).toEqual([
      { header: 1, end: 30 },
      { header: 5, end: 12 }
    ])
  })
})

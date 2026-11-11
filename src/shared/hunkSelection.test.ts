import { describe, expect, it } from 'vitest'
import { diffLines } from './lineDiff'
import { hunkAtLine, hunkRange, hunksInRanges, mapRangesToOld, selectLines, type LineRange } from './hunkSelection'

const OLD = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
// b→B (modified), d2 comes in after d, f goes away, h→H and i comes in at the end.
const NEW = ['a', 'B', 'c', 'd', 'd2', 'e', 'g', 'H', 'i']
const hunks = diffLines(OLD, NEW)

const apply = (ranges: LineRange[]): string[] => selectLines(OLD, NEW, hunks, ranges, 'apply')
const revert = (ranges: LineRange[]): string[] => selectLines(OLD, NEW, hunks, ranges, 'revert')

describe('selectLines', () => {
  it('no selection: apply returns the old one and revert, the new one', () => {
    expect(apply([])).toEqual(OLD)
    expect(revert([])).toEqual(NEW)
  })

  it('everything selected: apply returns the new one and revert, the old one', () => {
    const all = [{ from: 1, to: NEW.length }]
    expect(apply(all)).toEqual(NEW)
    expect(revert(all)).toEqual(OLD)
  })

  it('applies only the selected hunk', () => {
    expect(apply([{ from: 2, to: 2 }])).toEqual(['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h'])
    expect(apply([{ from: 5, to: 5 }])).toEqual(['a', 'b', 'c', 'd', 'd2', 'e', 'f', 'g', 'h'])
  })

  it('a pure removal is selected by the line after the block', () => {
    // f left before g (line 7 of the new one).
    expect(apply([{ from: 7, to: 7 }])).toEqual(['a', 'b', 'c', 'd', 'e', 'g', 'h'])
    expect(revert([{ from: 7, to: 7 }])).toEqual(['a', 'B', 'c', 'd', 'd2', 'e', 'f', 'g', 'H', 'i'])
  })

  it('partial selection inside a hunk with a replacement and an insertion', () => {
    // Hunk h→H + i: only line i.
    expect(apply([{ from: 9, to: 9 }])).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
    // Only the h→H replacement.
    expect(apply([{ from: 8, to: 8 }])).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'H'])
    expect(revert([{ from: 9, to: 9 }])).toEqual(['a', 'B', 'c', 'd', 'd2', 'e', 'g', 'H'])
  })

  it('apply and revert are complementary', () => {
    const ranges = [{ from: 2, to: 5 }]
    const applied = apply(ranges)
    // Reverting the rest from the new one gives the same result.
    const rest = selectLines(OLD, NEW, hunks, [{ from: 6, to: NEW.length }], 'revert')
    expect(rest).toEqual(applied)
  })

  it('extra removed lines go only with the last new line of the hunk', () => {
    const old = ['x', '1', '2', '3', 'y']
    const now = ['x', 'one', 'y']
    const h = diffLines(old, now)
    expect(selectLines(old, now, h, [{ from: 2, to: 2 }], 'apply')).toEqual(['x', 'one', 'y'])
    expect(selectLines(old, now, h, [{ from: 3, to: 3 }], 'apply')).toEqual(old)
  })
})

describe('hunkRange / hunkAtLine / hunksInRanges', () => {
  it('covers the new lines or the removal anchor', () => {
    const ranges = hunks.map((h) => hunkRange(h, NEW.length))
    expect(ranges).toEqual([
      { from: 2, to: 2 },
      { from: 5, to: 5 },
      { from: 7, to: 7 },
      { from: 8, to: 9 }
    ])
  })

  it('a removal at the end of the file sits on the last line', () => {
    const h = diffLines(['a', 'b'], ['a'])
    expect(hunkRange(h[0], 1)).toEqual({ from: 1, to: 1 })
  })

  it('finds the hunk of a line and the ones touched by ranges', () => {
    expect(hunkAtLine(hunks, 9, NEW.length)).toBe(hunks[3])
    expect(hunkAtLine(hunks, 1, NEW.length)).toBeUndefined()
    expect(hunksInRanges(hunks, [{ from: 1, to: 5 }], NEW.length)).toEqual([hunks[0], hunks[1]])
  })
})

describe('mapRangesToOld', () => {
  it('an equal line goes to its counterpart and a hunk to its old lines', () => {
    // c (line 3 in both); g is 7 in the new and 7 in the old; e is 6 in the new and 5 in the old.
    expect(mapRangesToOld(hunks, [{ from: 3, to: 3 }])).toEqual([{ from: 3, to: 3 }])
    expect(mapRangesToOld(hunks, [{ from: 6, to: 6 }])).toEqual([{ from: 5, to: 5 }])
    expect(mapRangesToOld(hunks, [{ from: 8, to: 9 }])).toEqual([{ from: 8, to: 8 }])
  })

  it('a range with only inserted lines disappears', () => {
    expect(mapRangesToOld(hunks, [{ from: 5, to: 5 }])).toEqual([])
  })
})

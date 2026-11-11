import { describe, expect, it } from 'vitest'
import { diffLines } from '@shared/lineDiff'
import { MAX_GUTTER_LINES, gutterMarks } from './gitGutter'
import { splitLines } from './textFormat'

const lines = (text: string): string[] => text.split('\n')

describe('diffLines', () => {
  it('equal texts have no hunks', () => {
    expect(diffLines(['a', 'b'], ['a', 'b'])).toEqual([])
    expect(diffLines([], [])).toEqual([])
  })

  it('insertion, removal and replacement', () => {
    expect(diffLines(['a', 'c'], ['a', 'b', 'c'])).toEqual([{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 1 }])
    expect(diffLines(['a', 'b', 'c'], ['a', 'c'])).toEqual([{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 0 }])
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }
    ])
  })

  it('separate edits become separate hunks', () => {
    const base = ['1', '2', '3', '4', '5', '6', '7']
    const doc = ['1', 'dois', '3', '4', '5', '6', '7', '8']
    expect(diffLines(base, doc)).toEqual([
      { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 },
      { oldStart: 7, oldCount: 0, newStart: 7, newCount: 1 }
    ])
  })

  it('finds the minimum even with repeated lines', () => {
    const hunks = diffLines(['a', 'a', 'a'], ['a', 'a', 'a', 'a'])
    expect(hunks).toHaveLength(1)
    expect(hunks[0].newCount - hunks[0].oldCount).toBe(1)
  })

  it('a huge distance becomes a single block instead of hanging', () => {
    const base = Array.from({ length: 2000 }, (_, i) => `a${i}`)
    const doc = Array.from({ length: 2000 }, (_, i) => `b${i}`)
    expect(diffLines(base, doc)).toEqual([{ oldStart: 0, oldCount: 2000, newStart: 0, newCount: 2000 }])
  })
})

describe('gutterMarks', () => {
  it('without a baseline (file outside the index) there are no marks', () => {
    expect(gutterMarks(null, lines('a\nb'))).toEqual([])
  })

  it('a document equal to the base has no marks', () => {
    expect(gutterMarks(lines('a\nb\n'), lines('a\nb\n'))).toEqual([])
  })

  it('new lines are added', () => {
    expect(gutterMarks(lines('a\nd'), lines('a\nb\nc\nd'))).toEqual([
      { line: 2, kind: 'added' },
      { line: 3, kind: 'added' }
    ])
  })

  it('a changed line is modified', () => {
    expect(gutterMarks(lines('a\nb\nc'), lines('a\nB\nc'))).toEqual([{ line: 2, kind: 'modified' }])
  })

  it('replacing 1 line with 3 marks the first as modified and the others as added', () => {
    expect(gutterMarks(lines('a\nb\nz'), lines('a\nb1\nb2\nb3\nz'))).toEqual([
      { line: 2, kind: 'modified' },
      { line: 3, kind: 'added' },
      { line: 4, kind: 'added' }
    ])
  })

  it('replacing 3 lines with 1 marks only the remaining line as modified', () => {
    expect(gutterMarks(lines('a\nb\nc\nd\nz'), lines('a\nX\nz'))).toEqual([{ line: 2, kind: 'modified' }])
  })

  it('a removal marks the line after the removed block', () => {
    expect(gutterMarks(lines('a\nb\nc\nd'), lines('a\nd'))).toEqual([{ line: 2, kind: 'deleted' }])
  })

  it('a removal at the start marks the first line', () => {
    expect(gutterMarks(lines('a\nb\nc'), lines('b\nc'))).toEqual([{ line: 1, kind: 'deleted' }])
  })

  it('a removal at the end marks the last line', () => {
    expect(gutterMarks(lines('a\nb\nc'), lines('a'))).toEqual([{ line: 1, kind: 'deleted' }])
  })

  it('emptying the file marks the only remaining line', () => {
    expect(gutterMarks(lines('a\nb'), [''])).toEqual([{ line: 1, kind: 'modified' }])
    expect(gutterMarks(lines('a\nb'), [])).toEqual([])
  })

  it('combines several hunks in order', () => {
    const base = lines('1\n2\n3\n4\n5\n6')
    const doc = lines('1\n2x\n3\n5\n6\n7')
    expect(gutterMarks(base, doc)).toEqual([
      { line: 2, kind: 'modified' },
      { line: 4, kind: 'deleted' },
      { line: 6, kind: 'added' }
    ])
  })

  it('a new file with an empty index: everything is added', () => {
    expect(gutterMarks([''], lines('a\nb'))).toEqual([
      { line: 1, kind: 'modified' },
      { line: 2, kind: 'added' }
    ])
  })
})

describe('gutterMarks: position of the changes', () => {
  it('line added at the start, in the middle and at the end', () => {
    expect(gutterMarks(lines('b\nc'), lines('a\nb\nc'))).toEqual([{ line: 1, kind: 'added' }])
    expect(gutterMarks(lines('a\nc'), lines('a\nb\nc'))).toEqual([{ line: 2, kind: 'added' }])
    expect(gutterMarks(lines('a\nb'), lines('a\nb\nc'))).toEqual([{ line: 3, kind: 'added' }])
  })

  it('line modified at the start and at the end', () => {
    expect(gutterMarks(lines('a\nb\nc'), lines('A\nb\nc'))).toEqual([{ line: 1, kind: 'modified' }])
    expect(gutterMarks(lines('a\nb\nc'), lines('a\nb\nC'))).toEqual([{ line: 3, kind: 'modified' }])
  })

  it('several consecutive modified lines', () => {
    expect(gutterMarks(lines('a\nb\nc\nd'), lines('a\nB\nC\nd'))).toEqual([
      { line: 2, kind: 'modified' },
      { line: 3, kind: 'modified' }
    ])
  })

  it('a removal in the middle of several lines marks a single line', () => {
    expect(gutterMarks(lines('a\nb\nc\nd\ne'), lines('a\ne'))).toEqual([{ line: 2, kind: 'deleted' }])
  })

  it('removing everything but the last line marks the first', () => {
    expect(gutterMarks(lines('a\nb\nc'), lines('c'))).toEqual([{ line: 1, kind: 'deleted' }])
  })

  it('a replacement hunk followed by a distant removal produces independent marks', () => {
    const base = lines('1\n2\n3\n4\n5\n6\n7\n8')
    const doc = lines('1\nX\n3\n4\n5\n6\n8')
    expect(gutterMarks(base, doc)).toEqual([
      { line: 2, kind: 'modified' },
      { line: 7, kind: 'deleted' }
    ])
  })

  it('duplicated lines: inserting a copy marks exactly one line', () => {
    const marks = gutterMarks(lines('x\nx\ny'), lines('x\nx\nx\ny'))
    expect(marks).toHaveLength(1)
    expect(marks[0].kind).toBe('added')
  })

  it('the marks come sorted by line, without repeating lines', () => {
    const base = lines('a\nb\nc\nd\ne\nf\ng')
    const doc = lines('a\nB\nc\nf\ng\nh\ni')
    const marks = gutterMarks(base, doc)
    const nums = marks.map((m) => m.line)
    expect(nums).toEqual([...new Set(nums)].sort((x, y) => x - y))
    expect(marks.every((m) => m.line >= 1 && m.line <= doc.length)).toBe(true)
  })
})

describe('gutterMarks: line ending and final newline', () => {
  it('CRLF base and LF document (normalized by splitLines) have no marks', () => {
    expect(gutterMarks(splitLines('a\r\nb\r\nc\r\n'), splitLines('a\nb\nc\n'))).toEqual([])
  })

  it('CRLF base: only the line actually changed is marked', () => {
    expect(gutterMarks(splitLines('a\r\nb\r\nc'), splitLines('a\nB\nc'))).toEqual([{ line: 2, kind: 'modified' }])
  })

  it('a lone CR also splits lines, as in CodeMirror', () => {
    expect(gutterMarks(splitLines('a\rb'), splitLines('a\nb'))).toEqual([])
  })

  it('lines with a leftover \\r (not normalized) are different', () => {
    expect(gutterMarks(['a\r', 'b'], ['a', 'b'])).toEqual([{ line: 1, kind: 'modified' }])
  })

  it('removing the final newline marks the last line as removed', () => {
    expect(gutterMarks(splitLines('a\nb\n'), splitLines('a\nb'))).toEqual([{ line: 2, kind: 'deleted' }])
  })

  it('adding the final newline marks the new empty line as added', () => {
    expect(gutterMarks(splitLines('a\nb'), splitLines('a\nb\n'))).toEqual([{ line: 3, kind: 'added' }])
  })

  it('identical text with a final newline has no marks', () => {
    expect(gutterMarks(splitLines('a\nb\n'), splitLines('a\nb\n'))).toEqual([])
  })
})

describe('gutterMarks: empty base and limits', () => {
  it('empty base and empty document have no marks', () => {
    expect(gutterMarks(splitLines(''), splitLines(''))).toEqual([])
  })

  it('empty base and a document with text: first line modified, the rest added', () => {
    expect(gutterMarks(splitLines(''), splitLines('a\nb\nc'))).toEqual([
      { line: 1, kind: 'modified' },
      { line: 2, kind: 'added' },
      { line: 3, kind: 'added' }
    ])
  })

  it('base with text and an emptied document: single line modified', () => {
    expect(gutterMarks(splitLines('a\nb'), splitLines(''))).toEqual([{ line: 1, kind: 'modified' }])
  })

  it('files above the line limit are not computed', () => {
    const big = Array.from({ length: MAX_GUTTER_LINES + 1 }, (_, i) => `l${i}`)
    expect(gutterMarks(big, ['x'])).toEqual([])
    expect(gutterMarks(['x'], big)).toEqual([])
  })
})

describe('diffLines: extra cases', () => {
  it('a replacement at the start and at the end becomes two hunks', () => {
    const hunks = diffLines(['a', 'm', 'z'], ['A', 'm', 'Z'])
    expect(hunks).toEqual([
      { oldStart: 0, oldCount: 1, newStart: 0, newCount: 1 },
      { oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }
    ])
  })

  it('empty base: everything inserted; empty document: everything removed', () => {
    expect(diffLines([], ['a', 'b'])).toEqual([{ oldStart: 0, oldCount: 0, newStart: 0, newCount: 2 }])
    expect(diffLines(['a', 'b'], [])).toEqual([{ oldStart: 0, oldCount: 2, newStart: 0, newCount: 0 }])
  })

  it('the hunks applied to the base reproduce the document', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const doc = ['a', 'x', 'c', 'e', 'f', 'f2', 'g', 'h']
    const out: string[] = []
    let pos = 0
    for (const h of diffLines(base, doc)) {
      out.push(...base.slice(pos, h.oldStart), ...doc.slice(h.newStart, h.newStart + h.newCount))
      pos = h.oldStart + h.oldCount
    }
    out.push(...base.slice(pos))
    expect(out).toEqual(doc)
  })
})

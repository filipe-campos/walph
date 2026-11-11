import { describe, expect, it } from 'vitest'
import { hasConflictMarkers, parseConflicts, resolveConflict } from './mergeConflicts'

const lines = (text: string): string[] => text.split('\n')

const TWO_WAY = lines(`before
<<<<<<< HEAD
ours 1
ours 2
=======
theirs
>>>>>>> feature
middle
<<<<<<< HEAD
a
=======
>>>>>>> other
end`)

const DIFF3 = lines(`<<<<<<< ours
x
||||||| base
original
=======
y
>>>>>>> theirs`)

describe('parseConflicts', () => {
  it('finds the blocks with labels', () => {
    expect(parseConflicts(TWO_WAY)).toEqual([
      { start: 1, base: null, separator: 4, end: 6, currentLabel: 'HEAD', incomingLabel: 'feature' },
      { start: 8, base: null, separator: 10, end: 11, currentLabel: 'HEAD', incomingLabel: 'other' }
    ])
  })

  it('diff3 style marks the base', () => {
    expect(parseConflicts(DIFF3)).toEqual([
      { start: 0, base: 2, separator: 4, end: 6, currentLabel: 'ours', incomingLabel: 'theirs' }
    ])
  })

  it('ignores an incomplete block and markers that do not start the line or have more characters', () => {
    expect(parseConflicts(lines('<<<<<<< a\nx\n=======\ny'))).toEqual([])
    expect(parseConflicts(lines(' <<<<<<< a\n=======\n>>>>>>> b'))).toEqual([])
    expect(parseConflicts(lines('<<<<<<<< a\n=======\n>>>>>>> b'))).toEqual([])
  })

  it('a start inside another starts over from it', () => {
    const found = parseConflicts(lines('<<<<<<< a\nx\n<<<<<<< b\ny\n=======\nz\n>>>>>>> c'))
    expect(found).toEqual([{ start: 2, base: null, separator: 4, end: 6, currentLabel: 'b', incomingLabel: 'c' }])
  })

  it('accepts CRLF and a marker without a label', () => {
    expect(parseConflicts(['<<<<<<<\r', 'a\r', '=======\r', 'b\r', '>>>>>>>\r'])).toHaveLength(1)
  })
})

describe('resolveConflict', () => {
  const [first, second] = parseConflicts(TWO_WAY)

  it('current, incoming and both', () => {
    expect(resolveConflict(TWO_WAY, first, 'current')).toEqual(['ours 1', 'ours 2'])
    expect(resolveConflict(TWO_WAY, first, 'incoming')).toEqual(['theirs'])
    expect(resolveConflict(TWO_WAY, first, 'both')).toEqual(['ours 1', 'ours 2', 'theirs'])
    expect(resolveConflict(TWO_WAY, second, 'incoming')).toEqual([])
  })

  it('the diff3 base goes into no choice', () => {
    const [conflict] = parseConflicts(DIFF3)
    expect(resolveConflict(DIFF3, conflict, 'both')).toEqual(['x', 'y'])
  })
})

describe('hasConflictMarkers', () => {
  it('only with a complete block', () => {
    expect(hasConflictMarkers(TWO_WAY.join('\n'))).toBe(true)
    expect(hasConflictMarkers('no conflict\n=======\n')).toBe(false)
  })
})

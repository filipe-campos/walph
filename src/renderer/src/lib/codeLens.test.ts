import { describe, expect, it } from 'vitest'
import { groupByLine, indentColumns } from './codeLens'

describe('indentColumns', () => {
  it('counts spaces and tabs up to the next stop', () => {
    expect(indentColumns('    x', 4)).toBe(4)
    expect(indentColumns('\tx', 4)).toBe(4)
    expect(indentColumns('  \tx', 4)).toBe(4)
    expect(indentColumns('\t  x', 2)).toBe(4)
    expect(indentColumns('x  ', 4)).toBe(0)
    expect(indentColumns('', 4)).toBe(0)
  })
})

describe('groupByLine', () => {
  it('groups in line order and keeps the order within each line', () => {
    const items = [
      { line: 5, id: 'a' },
      { line: 2, id: 'b' },
      { line: 5, id: 'c' }
    ]
    expect(groupByLine(items, (i) => i.line).map((g) => [g.line, g.items.map((i) => i.id)])).toEqual([
      [2, ['b']],
      [5, ['a', 'c']]
    ])
  })
})

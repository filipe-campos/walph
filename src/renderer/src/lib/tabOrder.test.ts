import { describe, expect, it } from 'vitest'
import { dropIndex, moveItem, nextActiveAfterClose } from './tabOrder'

describe('dropIndex', () => {
  it('dropping before/after a tab on the right', () => {
    expect(dropIndex(0, 2, 'before')).toBe(1)
    expect(dropIndex(0, 2, 'after')).toBe(2)
  })
  it('dropping before/after a tab on the left', () => {
    expect(dropIndex(3, 1, 'before')).toBe(1)
    expect(dropIndex(3, 1, 'after')).toBe(2)
  })
  it('dropping next to itself does not change the position', () => {
    expect(dropIndex(2, 2, 'before')).toBe(2)
    expect(dropIndex(2, 2, 'after')).toBe(2)
  })
})

describe('moveItem', () => {
  it('moves to the final index', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('ignores an invalid source index', () => {
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

describe('dropIndex and moveItem together', () => {
  it('dropping after the right neighbor swaps the two', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, dropIndex(0, 1, 'after'))).toEqual(['b', 'a', 'c'])
  })
  it('dropping before the left neighbor swaps the two', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 2, dropIndex(2, 1, 'before'))).toEqual(['a', 'c', 'b'])
  })
  it('dropping after the last goes to the end', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, dropIndex(0, 2, 'after'))).toEqual(['b', 'c', 'a'])
  })
  it('dropping before the first goes to the start', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 2, dropIndex(2, 0, 'before'))).toEqual(['c', 'a', 'b'])
  })
})

describe('moveItem in edge cases', () => {
  it('does not change the original list', () => {
    const list = ['a', 'b', 'c']
    moveItem(list, 0, 2)
    expect(list).toEqual(['a', 'b', 'c'])
  })
  it('clamps the target to the list range', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b'])
  })
  it('empty list and same position', () => {
    expect(moveItem([], 0, 0)).toEqual([])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})

describe('nextActiveAfterClose', () => {
  const tabs = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  it('keeps the active one when it is not closed', () => {
    expect(nextActiveAfterClose(tabs, 'b', new Set(['c']))).toBe('b')
  })
  it('passes to the remaining neighbor on the right', () => {
    expect(nextActiveAfterClose(tabs, 'b', new Set(['b', 'c']))).toBe('d')
  })
  it('with nobody on the right, uses the last remaining one', () => {
    expect(nextActiveAfterClose(tabs, 'd', new Set(['d']))).toBe('c')
  })
  it('returns null when nothing remains', () => {
    expect(nextActiveAfterClose(tabs, 'a', new Set(['a', 'b', 'c', 'd']))).toBeNull()
  })
})

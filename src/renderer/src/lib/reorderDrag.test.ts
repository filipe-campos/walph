import { describe, expect, it } from 'vitest'
import { dragOffsets, dragTargetIndex, gridOffsets, gridTargetIndex } from './reorderDrag'

describe('reorderDrag', () => {
  it('dragTargetIndex counts the centers of the other tabs on the left', () => {
    const mids = [50, 150, 250, 350]
    expect(dragTargetIndex(mids, 1, 0)).toBe(0)
    expect(dragTargetIndex(mids, 1, 100)).toBe(1)
    expect(dragTargetIndex(mids, 1, 260)).toBe(2)
    expect(dragTargetIndex(mids, 1, 999)).toBe(3)
    expect(dragTargetIndex(mids, 0, 120)).toBe(0)
  })

  it('dragOffsets makes way between source and target', () => {
    expect(dragOffsets(4, 0, 2, 10)).toEqual([20, -10, -10, 0])
    expect(dragOffsets(4, 3, 1, 10)).toEqual([0, 10, 10, -20])
    expect(dragOffsets(3, 1, 1, 10)).toEqual([0, 0, 0])
  })

  const grid = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 10, y: 40 },
    { x: 40, y: 40 }
  ]

  it('gridTargetIndex picks the nearest slot, on any row', () => {
    expect(gridTargetIndex(grid, { x: 12, y: 8 })).toBe(0)
    expect(gridTargetIndex(grid, { x: 38, y: 12 })).toBe(1)
    expect(gridTargetIndex(grid, { x: 8, y: 50 })).toBe(2)
    expect(gridTargetIndex(grid, { x: 99, y: 99 })).toBe(3)
  })

  it('gridOffsets takes each item to the center of the new slot, even when wrapping lines', () => {
    expect(gridOffsets(grid, 0, 2)).toEqual([
      { x: 0, y: 30 },
      { x: -30, y: 0 },
      { x: 30, y: -30 },
      { x: 0, y: 0 }
    ])
    expect(gridOffsets(grid, 3, 3).every((o) => o.x === 0 && o.y === 0)).toBe(true)
  })
})

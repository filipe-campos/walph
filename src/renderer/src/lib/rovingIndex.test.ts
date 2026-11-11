import { describe, expect, it } from 'vitest'
import { rovingTarget } from './rovingIndex'

describe('rovingTarget', () => {
  it('horizontal arrows wrap around', () => {
    expect(rovingTarget('ArrowRight', 2, 3)).toBe(0)
    expect(rovingTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(rovingTarget('ArrowRight', 0, 3)).toBe(1)
  })

  it('only the requested orientation responds', () => {
    expect(rovingTarget('ArrowDown', 0, 3, 'horizontal')).toBeNull()
    expect(rovingTarget('ArrowDown', 0, 3, 'vertical')).toBe(1)
    expect(rovingTarget('ArrowLeft', 0, 3, 'vertical')).toBeNull()
    expect(rovingTarget('ArrowUp', 1, 3, 'both')).toBe(0)
    expect(rovingTarget('ArrowRight', 1, 3, 'both')).toBe(2)
  })

  it('Home and End go to the ends', () => {
    expect(rovingTarget('Home', 2, 4)).toBe(0)
    expect(rovingTarget('End', 0, 4)).toBe(3)
  })

  it('skips disabled items', () => {
    const off = (i: number): boolean => i === 1
    expect(rovingTarget('ArrowRight', 0, 3, 'horizontal', off)).toBe(2)
    expect(rovingTarget('ArrowLeft', 2, 3, 'horizontal', off)).toBe(0)
    expect(rovingTarget('Home', 1, 3, 'horizontal', (i) => i === 0)).toBe(1)
    expect(rovingTarget('End', 0, 3, 'horizontal', (i) => i === 2)).toBe(1)
  })

  it('ignores other keys and groups without an enabled item', () => {
    expect(rovingTarget('a', 0, 3)).toBeNull()
    expect(rovingTarget('ArrowRight', 0, 0)).toBeNull()
    expect(rovingTarget('ArrowRight', 0, 2, 'horizontal', () => true)).toBeNull()
  })
})

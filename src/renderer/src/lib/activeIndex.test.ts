import { describe, expect, it } from 'vitest'
import { activeTarget } from './activeIndex'

describe('activeTarget', () => {
  it('arrows stop at the ends without wrap', () => {
    expect(activeTarget('ArrowDown', 2, 3)).toBe(2)
    expect(activeTarget('ArrowUp', 0, 3)).toBe(0)
    expect(activeTarget('ArrowDown', 0, 3)).toBe(1)
  })

  it('arrows wrap around with wrap', () => {
    expect(activeTarget('ArrowDown', 2, 3, { wrap: true })).toBe(0)
    expect(activeTarget('ArrowUp', 0, 3, { wrap: true })).toBe(2)
  })

  it('PageUp and PageDown move one page and stop at the ends', () => {
    expect(activeTarget('PageDown', 0, 30, { pageSize: 10 })).toBe(10)
    expect(activeTarget('PageDown', 25, 30, { pageSize: 10 })).toBe(29)
    expect(activeTarget('PageUp', 4, 30, { pageSize: 10 })).toBe(0)
    expect(activeTarget('PageDown', 0, 30, { wrap: true })).toBe(10)
  })

  it('Home and End only apply outside text fields', () => {
    expect(activeTarget('Home', 3, 5)).toBeNull()
    expect(activeTarget('End', 3, 5)).toBeNull()
    expect(activeTarget('Home', 3, 5, { homeEnd: true })).toBe(0)
    expect(activeTarget('End', 3, 5, { homeEnd: true })).toBe(4)
  })

  it('empty list and other keys are not handled', () => {
    expect(activeTarget('ArrowDown', 0, 0, { wrap: true })).toBeNull()
    expect(activeTarget('Enter', 0, 3)).toBeNull()
  })
})

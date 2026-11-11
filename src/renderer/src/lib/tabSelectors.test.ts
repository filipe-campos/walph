import { describe, expect, it } from 'vitest'
import type { Tab } from '../types/tabs'
import { selectTab } from './tabSelectors'

const one = { id: '1', kind: 'file', path: '/a' } as Tab
const two = { id: '2', kind: 'image', path: '/b.png' } as Tab

describe('selectTab', () => {
  it('returns the same tab reference', () => {
    expect(selectTab('2')({ tabs: [one, two] })).toBe(two)
  })

  it('an unknown, null or undefined id finds nothing', () => {
    expect(selectTab('9')({ tabs: [one] })).toBeUndefined()
    expect(selectTab(null)({ tabs: [one] })).toBeUndefined()
    expect(selectTab(undefined)({ tabs: [one] })).toBeUndefined()
  })
})

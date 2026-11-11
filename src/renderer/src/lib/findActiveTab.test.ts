import { describe, expect, it } from 'vitest'
import { findActiveTab } from './findActiveTab'

describe('findActiveTab', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }]

  it('returns the active tab (the same reference)', () => {
    expect(findActiveTab({ tabs, activeTabId: 'b' })).toBe(tabs[1])
  })

  it('without an active tab, or with an id that does not exist, returns undefined', () => {
    expect(findActiveTab({ tabs, activeTabId: null })).toBeUndefined()
    expect(findActiveTab({ tabs, activeTabId: 'x' })).toBeUndefined()
  })
})

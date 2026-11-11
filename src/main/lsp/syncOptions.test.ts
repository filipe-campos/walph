import { describe, expect, it } from 'vitest'
import { parseSyncOptions } from './syncOptions'

describe('parseSyncOptions', () => {
  it('numeric form', () => {
    expect(parseSyncOptions(1)).toEqual({ openClose: true, change: 1, save: false, includeText: false })
  })
  it('object with save.includeText', () => {
    expect(parseSyncOptions({ openClose: true, change: 2, save: { includeText: true } })).toEqual({
      openClose: true,
      change: 2,
      save: true,
      includeText: true
    })
    expect(parseSyncOptions({ openClose: true, change: 2, save: true }).includeText).toBe(false)
    expect(parseSyncOptions({ change: 2 })).toMatchObject({ openClose: false, save: false })
  })
  it('without the capability uses the incremental default', () => {
    expect(parseSyncOptions(undefined)).toMatchObject({ openClose: true, change: 2 })
  })
})

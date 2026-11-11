import { describe, expect, it } from 'vitest'
import { effortBars, effortOptions, stepEffort } from './claudeEffort'

describe('effortBars', () => {
  it('lights up to the level', () => {
    expect(effortBars('high').map((b) => b.on)).toEqual([true, true, true, false, false])
    expect(effortBars('max').every((b) => b.on)).toBe(true)
  })
  it('auto turns them all off', () => {
    expect(effortBars(null).some((b) => b.on)).toBe(false)
  })
})

describe('stepEffort', () => {
  const accepted = ['low', 'medium', 'high'] as const
  it('lists auto and only the accepted levels', () => {
    expect(effortOptions(accepted)).toEqual([null, 'low', 'medium', 'high'])
  })
  it('moves without wrapping around', () => {
    expect(stepEffort(null, accepted, 1)).toBe('low')
    expect(stepEffort('high', accepted, 1)).toBe('high')
    expect(stepEffort('low', accepted, -1)).toBeNull()
    expect(stepEffort(null, accepted, -1)).toBeNull()
  })
  it('a level not accepted starts from auto', () => {
    expect(stepEffort('max', accepted, 1)).toBe('low')
  })
})

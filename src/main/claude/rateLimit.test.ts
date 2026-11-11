import { describe, expect, it } from 'vitest'
import { normalizeRateLimit, sameRateLimit } from './rateLimit'

describe('normalizeRateLimit', () => {
  it('maps status and window', () => {
    expect(normalizeRateLimit({ status: 'allowed' })).toEqual({
      status: 'allowed',
      window: 'other',
      percent: null,
      resetsAt: null,
      usingOverage: false
    })
    expect(normalizeRateLimit({ status: 'allowed_warning', rateLimitType: 'five_hour' })).toMatchObject({
      status: 'warning',
      window: 'five_hour'
    })
    expect(normalizeRateLimit({ status: 'rejected', rateLimitType: 'seven_day_overage_included' })).toMatchObject({
      status: 'rejected',
      window: 'seven_day'
    })
    for (const w of ['seven_day', 'seven_day_opus', 'seven_day_sonnet', 'overage'] as const)
      expect(normalizeRateLimit({ status: 'allowed', rateLimitType: w })?.window).toBe(w)
    expect(normalizeRateLimit({ status: 'allowed', rateLimitType: 'new' })?.window).toBe('other')
  })

  it('utilization: a fraction becomes a percentage, the rest is clamped to 0–100', () => {
    const p = (utilization: unknown) => normalizeRateLimit({ status: 'allowed', utilization })?.percent
    expect(p(0.8)).toBe(80)
    expect(p(1)).toBe(100)
    expect(p(0)).toBe(0)
    expect(p(1.04)).toBe(100)
    expect(p(0.85)).toBe(85)
    expect(p(250)).toBe(100)
    expect(p(-3)).toBeNull()
    expect(p(NaN)).toBeNull()
    expect(p('80')).toBeNull()
  })

  it('resetsAt: seconds become milliseconds', () => {
    const r = (resetsAt: unknown) => normalizeRateLimit({ status: 'allowed', resetsAt })?.resetsAt
    expect(r(1_900_000_000)).toBe(1_900_000_000_000)
    expect(r(1_900_000_000_000)).toBe(1_900_000_000_000)
    expect(r(0)).toBeNull()
    expect(r(-5)).toBeNull()
    expect(r('x')).toBeNull()
  })

  it('usingOverage from either of the two fields', () => {
    expect(normalizeRateLimit({ status: 'allowed', isUsingOverage: true })?.usingOverage).toBe(true)
    expect(normalizeRateLimit({ status: 'allowed', overageInUse: true })?.usingOverage).toBe(true)
    expect(normalizeRateLimit({ status: 'allowed', overageEnabled: true })?.usingOverage).toBe(false)
  })

  it('drops an unknown status or malformed input', () => {
    expect(normalizeRateLimit({ status: 'who knows' })).toBeNull()
    expect(normalizeRateLimit(null)).toBeNull()
    expect(normalizeRateLimit('allowed')).toBeNull()
  })
})

describe('sameRateLimit', () => {
  const a = normalizeRateLimit({ status: 'allowed_warning', utilization: 0.8, resetsAt: 1_900_000_000 })
  it('compares every field', () => {
    expect(
      sameRateLimit(a, normalizeRateLimit({ status: 'allowed_warning', utilization: 0.8, resetsAt: 1_900_000_000 }))
    ).toBe(true)
    expect(
      sameRateLimit(a, normalizeRateLimit({ status: 'allowed_warning', utilization: 0.9, resetsAt: 1_900_000_000 }))
    ).toBe(false)
    expect(sameRateLimit(a, null)).toBe(false)
    expect(sameRateLimit(null, null)).toBe(true)
  })
})

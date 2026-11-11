import { describe, expect, it } from 'vitest'
import type { ClaudeRateLimit } from '@shared/types'
import { formatRateLimit, formatReset, rateLimitKey } from './claudeRateLimit'

// 20/10/2026 10:00 (local time)
const NOW = new Date(2026, 9, 20, 10, 0).getTime()
const at = (day: number, h: number, m = 0): number => new Date(2026, 9, day, h, m).getTime()
const limit = (over: Partial<ClaudeRateLimit> = {}): ClaudeRateLimit => ({
  status: 'warning',
  window: 'five_hour',
  percent: 82,
  resetsAt: at(20, 15),
  usingOverage: false,
  ...over
})

describe('formatReset', () => {
  it('today, tomorrow and another day', () => {
    expect(formatReset(at(20, 15), NOW)).toBe('às 15:00')
    expect(formatReset(at(21, 9), NOW)).toBe('amanhã às 09:00')
    expect(formatReset(at(23, 9), NOW)).toBe('em 23/10 às 09:00')
  })

  it('no time, past or invalid: nothing', () => {
    expect(formatReset(null, NOW)).toBeNull()
    expect(formatReset(at(20, 9), NOW)).toBeNull()
    expect(formatReset(Number.NaN, NOW)).toBeNull()
  })
})

describe('formatRateLimit', () => {
  it('warning with percentage and reset', () => {
    expect(formatRateLimit(limit(), NOW)).toEqual({
      tone: 'warning',
      text: 'Você usou 82% do limite de 5 horas · renova às 15:00'
    })
  })

  it('limit reached uses the error tone', () => {
    expect(formatRateLimit(limit({ status: 'rejected', percent: 100 }), NOW)).toEqual({
      tone: 'error',
      text: 'Limite de 5 horas atingido · renova às 15:00'
    })
  })

  it('omits percentage and reset when unknown', () => {
    expect(formatRateLimit(limit({ percent: null, resetsAt: null, window: 'seven_day_opus' }), NOW)?.text).toBe(
      'Você está perto do limite de semanal do Opus'
    )
  })

  it('window labels and extra credits', () => {
    expect(formatRateLimit(limit({ window: 'seven_day', resetsAt: at(23, 9) }), NOW)?.text).toContain(
      'limite de semanal · renova em 23/10 às 09:00'
    )
    expect(formatRateLimit(limit({ window: 'overage' }), NOW)?.text).toContain('créditos extras')
    expect(formatRateLimit(limit({ window: 'other' }), NOW)?.text).toContain('limite de uso')
    expect(formatRateLimit(limit({ usingOverage: true }), NOW)?.text).toMatch(/ · usando créditos extras$/)
  })

  it('allowed and null show nothing; percentage is clamped to 0–100', () => {
    expect(formatRateLimit(null, NOW)).toBeNull()
    expect(formatRateLimit(limit({ status: 'allowed' }), NOW)).toBeNull()
    expect(formatRateLimit(limit({ percent: 123.4 }), NOW)?.text).toContain('100%')
  })

  it('rateLimitKey changes with the content', () => {
    expect(rateLimitKey(limit())).not.toBe(rateLimitKey(limit({ percent: 90 })))
    expect(rateLimitKey(limit())).toBe(rateLimitKey(limit()))
  })
})

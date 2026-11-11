import { describe, expect, it } from 'vitest'
import {
  accountText,
  clampPercent,
  formatMinorUnits,
  planLabel,
  resetText,
  shortModel,
  usageLevel,
  usedText
} from './claudeUsage'

describe('claudeUsage', () => {
  it('bar level', () => {
    expect(usageLevel(null)).toBe('ok')
    expect(usageLevel(79.9)).toBe('ok')
    expect(usageLevel(80)).toBe('warning')
    expect(usageLevel(94)).toBe('warning')
    expect(usageLevel(95)).toBe('danger')
  })

  it('caps the width', () => {
    expect(clampPercent(null)).toBe(0)
    expect(clampPercent(140)).toBe(100)
    expect(clampPercent(-3)).toBe(0)
    expect(clampPercent(42)).toBe(42)
  })

  it('reset text', () => {
    const now = 1_000_000_000_000
    expect(resetText(null, now)).toBe('')
    expect(resetText(now - 5, now)).toBe('reinicia agora')
    expect(resetText(now + 12 * 60_000, now)).toBe('reinicia em 12 min')
    expect(resetText(now + (3 * 60 + 12) * 60_000, now)).toBe('reinicia em 3 h 12 min')
    expect(resetText(now + (26 * 60 + 5) * 60_000, now)).toBe('reinicia em 1 dia 2 h')
    expect(resetText(now + 72 * 3_600_000, now)).toBe('reinicia em 3 dias')
  })

  it('used percentage', () => {
    expect(usedText(36.6)).toBe('37% usado')
    expect(usedText(null)).toBe('uso não informado')
  })

  it('currency in minor units', () => {
    expect(formatMinorUnits(1234, 'USD').replace(/\s/g, ' ')).toContain('12,34')
    expect(formatMinorUnits(500, null)).toContain('5,00')
    expect(formatMinorUnits(500, 'lixo')).toContain('5,00')
  })

  it('account and plan', () => {
    expect(planLabel('max')).toBe('Max')
    expect(planLabel('custom')).toBe('Custom')
    expect(planLabel(undefined)).toBe('')
    expect(accountText({ email: 'a@x.com', subscriptionType: 'pro' })).toBe('a@x.com · Pro')
    expect(accountText({ subscriptionType: 'pro' })).toBe('Pro')
    expect(accountText(null)).toBe('')
  })

  it('short model name', () => {
    expect(shortModel('claude-sonnet-4-5-20250929')).toBe('sonnet-4-5')
    expect(shortModel('opus')).toBe('opus')
  })
})

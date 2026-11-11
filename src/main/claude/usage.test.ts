import { describe, expect, it } from 'vitest'
import { normalizeUsage } from './usage'

const model = {
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadInputTokens: 5000,
  cacheCreationInputTokens: 300,
  webSearchRequests: 0,
  costUSD: 0.42,
  contextWindow: 200000,
  maxOutputTokens: 32000
}

const RAW = {
  session: {
    total_cost_usd: 1.5,
    total_api_duration_ms: 4000,
    total_duration_ms: 90000,
    total_lines_added: 12,
    total_lines_removed: 3,
    model_usage: { 'claude-sonnet-4': model }
  },
  subscription_type: 'max',
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 37.5, resets_at: '2026-11-02T18:00:00Z' },
    seven_day: { utilization: 120, resets_at: null },
    seven_day_opus: null,
    model_scoped: [{ display_name: 'Fable', utilization: 10, resets_at: '2026-11-05T00:00:00Z' }],
    extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1250, utilization: 25, currency: 'USD' }
  }
}

describe('normalizeUsage', () => {
  it('converts session, models, limits and extra usage', () => {
    const report = normalizeUsage(RAW, { email: 'a@b.dev' })
    expect(report.session).toEqual({
      costUsd: 1.5,
      apiDurationMs: 4000,
      durationMs: 90000,
      linesAdded: 12,
      linesRemoved: 3,
      models: [
        {
          model: 'claude-sonnet-4',
          inputTokens: 1000,
          outputTokens: 200,
          cacheReadTokens: 5000,
          cacheCreationTokens: 300,
          costUsd: 0.42
        }
      ]
    })
    expect(report.subscriptionType).toBe('max')
    expect(report.limits.map((l) => l.key)).toEqual(['five_hour', 'seven_day', 'model:Fable'])
    expect(report.limits[0]).toEqual({
      key: 'five_hour',
      label: 'Sessão (5 horas)',
      utilization: 37.5,
      resetsAt: Date.parse('2026-11-02T18:00:00Z')
    })
    expect(report.limits[1]?.utilization).toBe(100)
    expect(report.limits[1]?.resetsAt).toBeNull()
    expect(report.extraUsage).toEqual({
      enabled: true,
      usedCredits: 1250,
      monthlyLimit: 5000,
      utilization: 25,
      currency: 'USD'
    })
    expect(report.account).toEqual({ email: 'a@b.dev' })
  })

  it('without plan limits (API key): empty list and null subscription', () => {
    const report = normalizeUsage({ ...RAW, subscription_type: null, rate_limits_available: false, rate_limits: null })
    expect(report.rateLimitsAvailable).toBe(false)
    expect(report.limits).toEqual([])
    expect(report.extraUsage).toBeNull()
    expect(report.subscriptionType).toBeNull()
  })

  it('invalid numbers become zero or null, never NaN', () => {
    const report = normalizeUsage({
      session: {
        total_cost_usd: 'x',
        total_lines_added: -4,
        total_duration_ms: NaN,
        model_usage: { m: { costUSD: Infinity } }
      },
      rate_limits: { five_hour: { utilization: 'high', resets_at: 'yesterday' } }
    })
    expect(report.session.costUsd).toBe(0)
    expect(report.session.linesAdded).toBe(0)
    expect(report.session.models[0]?.costUsd).toBe(0)
    expect(report.limits[0]).toMatchObject({ utilization: null, resetsAt: null })
  })

  it('model_scoped with the same name gets unique keys', () => {
    const report = normalizeUsage({
      ...RAW,
      rate_limits: {
        model_scoped: [
          { display_name: 'Fable', utilization: 1 },
          { display_name: 'Fable', utilization: 2 }
        ]
      }
    })
    expect(report.limits.map((l) => l.key)).toEqual(['model:Fable', 'model:Fable#2'])
  })

  it('rejects what has no session', () => {
    expect(() => normalizeUsage(null)).toThrow('inválido')
    expect(() => normalizeUsage({ rate_limits: {} })).toThrow('inválido')
  })
})

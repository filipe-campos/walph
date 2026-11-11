import { describe, expect, it } from 'vitest'
import { contextLevel, formatContext, formatCost, formatTokens } from './claudeFormat'

describe('claudeFormat', () => {
  it('formatCost', () => {
    expect(formatCost(0)).toBe('$0,00')
    expect(formatCost(0.1234)).toBe('$0,12')
    expect(formatCost(0.0012)).toBe('$0,0012')
    expect(formatCost(NaN)).toBe('$0,00')
  })
  it('formatTokens', () => {
    expect(formatTokens(850)).toBe('850')
    expect(formatTokens(1234)).toBe('1,2k')
    expect(formatTokens(45_600)).toBe('46k')
    expect(formatTokens(1_250_000)).toBe('1,3M')
  })
  it('formatContext and contextLevel', () => {
    const usage = { usedTokens: 45_000, maxTokens: 200_000, percentage: 22.5 }
    expect(formatContext(usage)).toBe('23% (45k / 200k)')
    expect(contextLevel(null)).toBe('ok')
    expect(contextLevel(usage)).toBe('ok')
    expect(contextLevel({ ...usage, percentage: 85 })).toBe('high')
    expect(contextLevel({ ...usage, percentage: 97 })).toBe('full')
  })
})

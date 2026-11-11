import { describe, expect, it } from 'vitest'
import { deniedToolLabel, formatAgentStats, formatTokenCount, formatToolElapsed } from './claudeProgress'

describe('formatToolElapsed', () => {
  it('seconds, minutes and hours', () => {
    expect(formatToolElapsed(0)).toBe('0 s')
    expect(formatToolElapsed(42)).toBe('42 s')
    expect(formatToolElapsed(65)).toBe('1 min 05 s')
    expect(formatToolElapsed(3725)).toBe('1 h 02 min')
    expect(formatToolElapsed(-3)).toBe('0 s')
  })
})

describe('formatTokenCount / formatAgentStats', () => {
  it('scales', () => {
    expect(formatTokenCount(850)).toBe('850 tokens')
    expect(formatTokenCount(12_345)).toBe('12,3 mil tokens')
    expect(formatTokenCount(1_250_000)).toBe('1,3 mi de tokens')
  })

  it('tools and tokens, with singular', () => {
    expect(formatAgentStats({ toolUses: 3, totalTokens: 12_345 })).toBe('3 ferramentas · 12,3 mil tokens')
    expect(formatAgentStats({ toolUses: 1, totalTokens: 0 })).toBe('1 ferramenta')
    expect(formatAgentStats({ toolUses: 0, totalTokens: 0 })).toBeNull()
  })
})

describe('deniedToolLabel', () => {
  it('MCP becomes server · tool', () => {
    expect(deniedToolLabel('Bash')).toBe('Bash')
    expect(deniedToolLabel('mcp__github__create_issue')).toBe('github · create_issue')
  })
})

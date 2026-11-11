// Formatting of the numbers in the Claude panel bar.
import type { ClaudeContextUsage } from '@shared/types'
import { formatNumber } from '@shared/i18n'

const fixed = (n: number, digits: number): string =>
  formatNumber(n, { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** `$0,12`; below one cent shows more decimals so it does not look like zero. */
export function formatCost(usd: number): string {
  if (!(usd > 0)) return `$${fixed(0, 2)}`
  return `$${fixed(usd, usd < 0.01 ? 4 : 2)}`
}

/** `850`, `12,3k`, `1,2M`. */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens))
  if (tokens < 1_000_000) return `${fixed(tokens / 1000, tokens < 10_000 ? 1 : 0)}k`
  return `${fixed(tokens / 1_000_000, 1)}M`
}

export function formatContext(usage: ClaudeContextUsage): string {
  return `${Math.round(usage.percentage)}% (${formatTokens(usage.usedTokens)} / ${formatTokens(usage.maxTokens)})`
}

/** Alert level of the context usage: above 80% suggests /compact. */
export function contextLevel(usage: ClaudeContextUsage | null): 'ok' | 'high' | 'full' {
  if (!usage) return 'ok'
  if (usage.percentage >= 95) return 'full'
  return usage.percentage >= 80 ? 'high' : 'ok'
}

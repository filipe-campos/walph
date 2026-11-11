import type { ClaudeAccount, ClaudeUsageLimit } from '@shared/types'
import { formatNumber, t } from '@shared/i18n'

export type UsageLevel = 'ok' | 'warning' | 'danger'

/** Bar color: warning from 80%, danger from 95%. */
export function usageLevel(percent: number | null): UsageLevel {
  if (percent === null) return 'ok'
  if (percent >= 95) return 'danger'
  return percent >= 80 ? 'warning' : 'ok'
}

/** Bar width, between 0 and 100. */
export function clampPercent(percent: number | null): number {
  return percent === null || !Number.isFinite(percent) ? 0 : Math.min(100, Math.max(0, percent))
}

/** "reinicia em 3 h 12 min", "reinicia em 2 dias 4 h", "reinicia agora"; without a time, empty. */
export function resetText(resetsAt: number | null, now: number = Date.now()): string {
  if (resetsAt === null) return ''
  const m = t().claude.usage
  const minutes = Math.ceil((resetsAt - now) / 60_000)
  if (minutes <= 0) return m.resetNow
  if (minutes < 60) return m.resetMinutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return m.resetHours(hours, String(minutes % 60).padStart(2, '0'))
  return m.resetDays(Math.floor(hours / 24), hours % 24)
}

/** "37% usado"; without a reported percentage, "uso não informado". */
export function usedText(percent: number | null): string {
  return percent === null ? t().claude.usage.unknown : t().claude.usage.used(Math.round(percent))
}

/** Value in minor currency units (cents) -> "US$ 12,34". A missing currency assumes USD. */
export function formatMinorUnits(minor: number, currency: string | null): string {
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD'
  try {
    return formatNumber(minor / 100, { style: 'currency', currency: code })
  } catch {
    return `${formatNumber(minor / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`
  }
}

const PLANS: Record<string, () => string> = {
  pro: () => 'Pro',
  max: () => 'Max',
  team: () => 'Team',
  enterprise: () => 'Enterprise',
  free: () => t().claude.usage.freePlan
}

/** `max` -> "Max"; an unknown plan shows as it came (first letter uppercase). */
export function planLabel(plan: string | null | undefined): string {
  const p = plan?.trim()
  if (!p) return ''
  const key = p.toLowerCase()
  return Object.hasOwn(PLANS, key) ? (PLANS[key]?.() ?? p) : p.charAt(0).toUpperCase() + p.slice(1)
}

/** "ana@x.com · Max" for the header; empty if the CLI reported nothing. */
export function accountText(account: ClaudeAccount | null | undefined): string {
  if (!account) return ''
  return [account.email, planLabel(account.subscriptionType)].filter(Boolean).join(' · ')
}

/** Limits with a percentage first, in main's order. */
export function sortedLimits(limits: readonly ClaudeUsageLimit[]): ClaudeUsageLimit[] {
  return [...limits].sort((a, b) => Number(b.utilization !== null) - Number(a.utilization !== null))
}

/** Short name of a session model (`claude-sonnet-4-5-20250929` -> "sonnet-4-5"). */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

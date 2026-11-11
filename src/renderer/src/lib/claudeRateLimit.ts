// Text of the subscription usage limit warning (above the prompt box). Pure.
import type { ClaudeRateLimit } from '@shared/types'
import { formatDate, t } from '@shared/i18n'
import { formatTime } from './claudeTime'

const rateLimitWindowLabel = (window: ClaudeRateLimit['window']): string => t().claude.rateLimit.windows[window]

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "às 15:00", "amanhã às 09:00" or "em 23/10 às 09:00" (local day); `null` if already past or unknown. */
export function formatReset(resetsAt: number | null, now: number): string | null {
  if (resetsAt === null || !Number.isFinite(resetsAt) || resetsAt <= now) return null
  const at = new Date(resetsAt)
  const today = new Date(now)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const time = formatTime(resetsAt)
  const m = t().claude.rateLimit
  if (sameDay(at, today)) return m.today(time)
  if (sameDay(at, tomorrow)) return m.tomorrow(time)
  return m.onDate(formatDate(at, { day: '2-digit', month: '2-digit' }), time)
}

export interface RateLimitView {
  /** `warning` = close to the limit; `error` = reached. */
  tone: 'warning' | 'error'
  text: string
}

/** Warning sentence, or `null` when all is well. */
export function formatRateLimit(limit: ClaudeRateLimit | null, now: number): RateLimitView | null {
  if (!limit || limit.status === 'allowed') return null
  const m = t().claude.rateLimit
  const label = rateLimitWindowLabel(limit.window)
  const reset = formatReset(limit.resetsAt, now)
  const parts: string[] = []
  if (limit.status === 'rejected') parts.push(m.reached(label))
  else if (limit.percent !== null) parts.push(m.used(Math.min(100, Math.max(0, Math.round(limit.percent))), label))
  else parts.push(m.near(label))
  if (reset) parts.push(m.renews(reset))
  if (limit.usingOverage) parts.push(m.usingOverage)
  return { tone: limit.status === 'rejected' ? 'error' : 'warning', text: parts.join(' · ') }
}

/** Key that changes when the warning changes (the banner restarts the "renova às…" clock). */
export const rateLimitKey = (l: ClaudeRateLimit): string =>
  `${l.status}|${l.window}|${l.percent}|${l.resetsAt}|${l.usingOverage}`

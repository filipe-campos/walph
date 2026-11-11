// CLI `rate_limit_event` → `ClaudeRateLimit`. The units are not documented in the SDK, so the mapping is defensive:
// `resetsAt` may come in seconds or milliseconds and `utilization` always as a fraction (0–1).

import { isFiniteNumber, isRecord } from '@shared/guards'
import type { ClaudeRateLimit } from '@shared/types'

const WINDOWS: Record<string, ClaudeRateLimit['window']> = {
  five_hour: 'five_hour',
  seven_day: 'seven_day',
  // The CLI uses this type for the weekly limit with extra credits included: for the user it is the weekly one.
  seven_day_overage_included: 'seven_day',
  seven_day_opus: 'seven_day_opus',
  seven_day_sonnet: 'seven_day_sonnet',
  overage: 'overage'
}

/** Below 1e12 it can only be seconds (1e12 ms = September 2001; 1e12 s = year 33658). */
const EPOCH_MS_FLOOR = 1e12

export function normalizeRateLimit(raw: unknown): ClaudeRateLimit | null {
  if (!isRecord(raw)) return null
  const status =
    raw.status === 'allowed'
      ? 'allowed'
      : raw.status === 'allowed_warning'
        ? 'warning'
        : raw.status === 'rejected'
          ? 'rejected'
          : null
  if (!status) return null
  const window = (typeof raw.rateLimitType === 'string' ? WINDOWS[raw.rateLimitType] : undefined) ?? 'other'
  let percent: number | null = null
  if (isFiniteNumber(raw.utilization) && raw.utilization >= 0) {
    // The CLI always sends a fraction (it does Math.round(utilization * 100) itself); above 1 = 100%.
    const value = raw.utilization * 100
    percent = Math.round(Math.min(100, Math.max(0, value)))
  }
  let resetsAt: number | null = null
  if (isFiniteNumber(raw.resetsAt) && raw.resetsAt > 0) {
    resetsAt = Math.round(raw.resetsAt < EPOCH_MS_FLOOR ? raw.resetsAt * 1000 : raw.resetsAt)
  }
  return { status, window, percent, resetsAt, usingOverage: raw.isUsingOverage === true || raw.overageInUse === true }
}

export function sameRateLimit(a: ClaudeRateLimit | null, b: ClaudeRateLimit | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.status === b.status &&
    a.window === b.window &&
    a.percent === b.percent &&
    a.resetsAt === b.resetsAt &&
    a.usingOverage === b.usingOverage
  )
}

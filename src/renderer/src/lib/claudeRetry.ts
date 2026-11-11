// "Retrying" line when the API fails with a temporary error. Pure.
import { t } from '@shared/i18n'
import type { ClaudeRetry } from './claudeConversation'

/** Cause by HTTP status (`null` = network/timeout). */
export function retryCause(errorStatus: number | null): string {
  const m = t().claude.retry
  if (errorStatus === null) return m.connection
  if (errorStatus === 529) return m.overloaded
  if (errorStatus === 429) return m.tooMany
  if (errorStatus >= 500) return m.server(errorStatus)
  return m.api(errorStatus)
}

/** Seconds left until the retry (rounded up, never negative). */
export function retryRemaining(retry: Pick<ClaudeRetry, 'timestamp' | 'delayMs'>, now: number): number {
  return Math.max(0, Math.ceil((retry.timestamp + retry.delayMs - now) / 1000))
}

/** Cause plus "tentando de novo (2/10)": the stable part (announced by screen readers). */
export function retryLead(retry: ClaudeRetry): string {
  return t().claude.retry.lead(retryCause(retry.errorStatus), retry.attempt, retry.maxRetries)
}

/** " em 8 s" (or " agora"): the part that changes every second. */
export function retryCountdown(retry: ClaudeRetry, now: number): string {
  const left = retryRemaining(retry, now)
  return left > 0 ? t().claude.retry.countdown(left) : t().claude.retry.now
}

export const retryLabel = (retry: ClaudeRetry, now: number): string => retryLead(retry) + retryCountdown(retry, now)

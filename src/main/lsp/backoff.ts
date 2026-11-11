/** Consecutive automatic restart attempts before giving up. */
export const MAX_RESTARTS = 5
/** If the server stayed up for this long, the attempt count goes back to zero. */
export const STABLE_UPTIME_MS = 60_000
const BASE_DELAY_MS = 1000

export interface RestartPlan {
  /** Number of this attempt (1..MAX_RESTARTS). */
  attempt: number
  delayMs: number
}

/**
 * Next restart after an unexpected crash: 1 s, 2 s, 4 s, 8 s, 16 s. `previousAttempts` = attempts already made in a
 * row; `uptimeMs` = how long the server lived before crashing. `null` = give up.
 */
export function nextRestart(previousAttempts: number, uptimeMs: number): RestartPlan | null {
  const done = uptimeMs >= STABLE_UPTIME_MS ? 0 : previousAttempts
  const attempt = done + 1
  if (attempt > MAX_RESTARTS) return null
  return { attempt, delayMs: BASE_DELAY_MS * 2 ** (attempt - 1) }
}

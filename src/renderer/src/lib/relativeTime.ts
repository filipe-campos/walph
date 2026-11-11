// Relative date in the current language for the git history, the stash list and the recents.
import { formatDate as formatLocaleDate, t } from '@shared/i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** From here on shows the date instead of "há N dias". */
const ABSOLUTE_AFTER_DAYS = 30

/** Short date with two-digit day, month and year in the local time zone (`dd/mm/aaaa` in pt-BR). */
export function formatDate(timestamp: number): string {
  return formatLocaleDate(timestamp, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export type RelativeAge =
  | { kind: 'now' }
  | { kind: 'minutes' | 'hours' | 'days'; n: number }
  | { kind: 'yesterday' }
  | { kind: 'date'; date: string }

/** Age in units: each screen builds the whole sentence (the word order changes between languages). */
export function relativeAge(timestamp: number, now: number = Date.now()): RelativeAge {
  const diff = now - timestamp
  if (diff < MINUTE) return { kind: 'now' }
  if (diff < HOUR) return { kind: 'minutes', n: Math.floor(diff / MINUTE) }
  if (diff < DAY) return { kind: 'hours', n: Math.floor(diff / HOUR) }
  const days = Math.floor(diff / DAY)
  if (days === 1) return { kind: 'yesterday' }
  if (days < ABSOLUTE_AFTER_DAYS) return { kind: 'days', n: days }
  return { kind: 'date', date: formatDate(timestamp) }
}

/**
 * "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias" and, after ~30 days, the date. Future dates (clock) = "agora".
 */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const age = relativeAge(timestamp, now)
  const m = t().app.time
  switch (age.kind) {
    case 'now':
      return m.now
    case 'minutes':
      return m.minutesAgo(age.n)
    case 'hours':
      return m.hoursAgo(age.n)
    case 'yesterday':
      return m.yesterday
    case 'days':
      return m.daysAgo(age.n)
    case 'date':
      return age.date
  }
}

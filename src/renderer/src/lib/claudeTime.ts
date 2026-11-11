// Times and durations of the Claude panel, in the current language.
import { formatDate, formatNumber } from '@shared/i18n'

/** `14:05`. */
export function formatTime(timestamp: number): string {
  return formatDate(timestamp, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** `segunda-feira, 19 de outubro de 2026 às 14:05:09` (for the `title`). */
export function formatFullDate(timestamp: number): string {
  return formatDate(timestamp, { dateStyle: 'full', timeStyle: 'medium' })
}

/** `850 ms`, `4,2 s`, `1 min 05 s`, `1 h 02 min`. */
export function formatDuration(ms: number): string {
  if (!(ms >= 0)) return ''
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (Math.round(seconds * 10) < 100)
    return `${formatNumber(seconds, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
  // Rounds to whole seconds BEFORE splitting (59.6 s is "1 min", not "0 min 60 s").
  const total = Math.round(seconds)
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes < 60) return rest === 0 ? `${minutes} min` : `${minutes} min ${String(rest).padStart(2, '0')} s`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`
}

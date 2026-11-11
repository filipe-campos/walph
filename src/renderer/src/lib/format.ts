// Number formatting for the UI.
import { formatNumber } from '@shared/i18n'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** `1,5 GB`: one decimal place below 10 units, an integer from there on. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const text =
    unit === 0 || value >= 10
      ? String(Math.round(value))
      : formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${text} ${UNITS[unit]}`
}

import { formatNumber } from '@shared/i18n'

/** Capped badge counter: above `max` it becomes "99+" (number in the current language). */
export function capCount(n: number, max = 99): string {
  return n > max ? `${formatNumber(max)}+` : formatNumber(n)
}

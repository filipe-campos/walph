// Formatting that depends on the current language. Always use these functions (or `getLocale()`) instead of
// hardcoding 'pt-BR'.
import { getLocale } from './locale'

export const formatNumber = (n: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(getLocale(), options).format(n)

export const formatDate = (date: Date | number, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(getLocale(), options).format(date)

export const compareText = (a: string, b: string): number => a.localeCompare(b, getLocale())

/** "a, b e c" / "a, b and c" / "a, b y c". */
export const formatList = (items: readonly string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string =>
  new Intl.ListFormat(getLocale(), { type }).format(items)

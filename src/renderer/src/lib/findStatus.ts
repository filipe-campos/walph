import { t } from '@shared/i18n'

// Text of the editor find counter ("3 de 12", "Sem resultados"). Pure: the panel only counts and displays.

export interface FindCount {
  /** Empty term: nothing to count. */
  empty: boolean
  /** Invalid regex. */
  invalid: boolean
  total: number
  /** Position (1-based) of the selected match, or `null` if the selection is not a match. */
  current: number | null
  /** The count stopped at the limit: there are more matches than `total`. */
  capped: boolean
}

export const FIND_COUNT_CAP = 999

export function formatFindStatus(c: FindCount): { text: string; none: boolean } {
  if (c.empty) return { text: '', none: false }
  const { find } = t().editor
  if (c.invalid) return { text: find.invalid, none: true }
  if (c.total === 0) return { text: find.noResults, none: true }
  return { text: find.count(String(c.current ?? '?'), `${c.total}${c.capped ? '+' : ''}`), none: false }
}

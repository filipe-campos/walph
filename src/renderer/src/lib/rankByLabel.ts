import { fuzzyMatch } from './fuzzy'

export interface RankedByLabel<T> {
  entry: T
  matches: number[]
  score: number
}

/**
 * Filters by fuzzy on the label. Without a query keeps everything and the order; with a query and `sort`, the best
 * match
 * first (`tiebreak` breaks ties; the sort is stable).
 */
export function rankByLabel<T>(
  entries: readonly T[],
  query: string,
  labelOf: (entry: T) => string,
  { sort, tiebreak }: { sort: boolean; tiebreak?: (a: T, b: T) => number }
): RankedByLabel<T>[] {
  const q = query.trim()
  const ranked: RankedByLabel<T>[] = []
  for (const entry of entries) {
    const result = q ? fuzzyMatch(q, labelOf(entry)) : { matches: [], score: 0 }
    if (result) ranked.push({ entry, matches: result.matches, score: result.score })
  }
  if (q && sort) ranked.sort((a, b) => b.score - a.score || (tiebreak ? tiebreak(a.entry, b.entry) : 0))
  return ranked
}

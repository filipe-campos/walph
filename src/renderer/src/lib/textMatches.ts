/** Point inside a list of text spans (one per text node). */
interface SegmentPoint {
  segment: number
  offset: number
}

export interface TextMatch {
  start: SegmentPoint
  /** Exclusive: `offset` is the end inside `segment`. */
  end: SegmentPoint
}

/** Cap of matches: a huge session with "e" must not hang the highlighting. */
export const MAX_TEXT_MATCHES = 2000

/**
 * Finds the matches of `query` in the text formed by the concatenated spans (a match may cross inline
 * elements, like `**bold**` in the middle of the sentence). Returns positions in terms of the spans, ready to become a
 * `Range`. No overlap; an empty query finds nothing.
 */
export function findTextMatches(segments: readonly string[], query: string, caseSensitive: boolean): TextMatch[] {
  if (query === '' || segments.length === 0) return []
  const starts: number[] = []
  let total = 0
  for (const s of segments) {
    starts.push(total)
    total += s.length
  }
  const text = segments.join('')
  // Regex instead of `toLowerCase`: some characters change length when changing case and would misalign the indexes.
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')

  // First (non-empty) span that contains the global index; `from` avoids restarting the search from zero on each match.
  let cursor = 0
  const locate = (index: number, exclusiveEnd: boolean): SegmentPoint => {
    // At the exclusive end, an index on the boundary belongs to the previous span.
    const probe = exclusiveEnd ? index - 1 : index
    while (cursor < segments.length - 1 && (starts[cursor + 1] ?? Infinity) <= probe) cursor++
    return { segment: cursor, offset: index - (starts[cursor] ?? 0) }
  }

  const matches: TextMatch[] = []
  for (const m of text.matchAll(re)) {
    if (m[0] === '') continue
    const start = locate(m.index, false)
    const end = locate(m.index + m[0].length, true)
    matches.push({ start, end })
    if (matches.length >= MAX_TEXT_MATCHES) break
  }
  return matches
}

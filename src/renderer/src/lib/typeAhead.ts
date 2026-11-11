// First-letter search in lists (Select): typing a letter goes to the next item that starts with it; letters
// typed in quick succession form a prefix ("of" → "Off").

/** Maximum time between keys for them to continue the same prefix. */
export const TYPE_AHEAD_MS = 700

/**
 * Index of the item that the `buffer` prefix picks, from `from` (current index). A repeated letter ("aaa") cycles
 * through the items that start with it; a longer prefix looks first at the current item (continuing to type does not
 * skip) and
 * then ahead, wrapping around to the start. `-1` = no item.
 */
export function typeAheadIndex(labels: readonly string[], from: number, buffer: string): number {
  const text = buffer.toLowerCase()
  if (labels.length === 0 || text === '') return -1
  const cycling = text.length > 1 && [...text].every((c) => c === text[0])
  const prefix = cycling ? (text[0] ?? '') : text
  // Cycling starts after the current one; a new/longer prefix may stay on the current one.
  const offset = cycling || text.length === 1 ? 1 : 0
  for (let step = 0; step < labels.length; step++) {
    const i = (from + offset + step + labels.length) % labels.length
    if (labels[i]?.toLowerCase().startsWith(prefix)) return i
  }
  return -1
}

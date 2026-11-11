// Smallest span that differs between two texts (common prefix and suffix). Used to reload a file changed on
// disk by replacing only the middle, so that the CodeMirror cursor, selection and scroll are preserved.

export interface TextChange {
  /** Start position in `oldText`. */
  from: number
  /** End position in `oldText` (exclusive). */
  to: number
  /** Text that goes in place of `oldText.slice(from, to)`. */
  insert: string
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/** `null` when the texts are equal. */
export function changedRange(oldText: string, newText: string): TextChange | null {
  if (oldText === newText) return null
  const max = Math.min(oldText.length, newText.length)
  let start = 0
  while (start < max && oldText.charCodeAt(start) === newText.charCodeAt(start)) start++
  // Does not cut a surrogate pair (emoji) in half.
  if (start > 0 && isHighSurrogate(oldText.charCodeAt(start - 1))) start--

  let oldEnd = oldText.length
  let newEnd = newText.length
  while (oldEnd > start && newEnd > start && oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)) {
    oldEnd--
    newEnd--
  }
  if (oldEnd < oldText.length && isLowSurrogate(oldText.charCodeAt(oldEnd))) {
    oldEnd++
    newEnd++
  }
  return { from: start, to: oldEnd, insert: newText.slice(start, newEnd) }
}

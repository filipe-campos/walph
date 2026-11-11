// Merge conflict markers (`<<<<<<<`, diff3's `|||||||`, `=======`, `>>>>>>>`) in a document. Pure: takes the
// lines and returns where each block is; whoever resolves replaces the block with the text `resolveConflict` builds.

/** A complete conflict. Lines from 0. */
export interface MergeConflict {
  /** Line of the `<<<<<<<`. */
  start: number
  /** Line of the `|||||||` (diff3 style), or `null`. */
  base: number | null
  /** Line of the `=======`. */
  separator: number
  /** Line of the `>>>>>>>`. */
  end: number
  /** Text after the start/end marker (e.g. `HEAD`, `feature`). */
  currentLabel: string
  incomingLabel: string
}

export type ConflictChoice = 'current' | 'incoming' | 'both'

const MARKER_SIZE = 7

/** `marker` repeated 7 times at the start of the line, followed by nothing or by a space and a label. */
function markerLabel(line: string, char: string): string | null {
  if (line.length < MARKER_SIZE || !line.startsWith(char.repeat(MARKER_SIZE))) return null
  const rest = line.slice(MARKER_SIZE)
  if (rest === '' || rest === '\r') return ''
  return rest.startsWith(' ') ? rest.slice(1).trimEnd() : null
}

const isSeparator = (line: string): boolean => line === '=======' || line === '=======\r'

/** Complete conflicts, in order. A block without an end is ignored; a `<<<<<<<` inside another starts over from it. */
export function parseConflicts(lines: readonly string[]): MergeConflict[] {
  const out: MergeConflict[] = []
  let open: { start: number; label: string; base: number | null; separator: number | null } | null = null
  lines.forEach((line, i) => {
    const startLabel = markerLabel(line, '<')
    if (startLabel !== null) {
      open = { start: i, label: startLabel, base: null, separator: null }
      return
    }
    if (!open) return
    if (open.separator === null) {
      if (open.base === null && markerLabel(line, '|') !== null) open.base = i
      else if (isSeparator(line)) open.separator = i
      return
    }
    const endLabel = markerLabel(line, '>')
    if (endLabel === null) return
    out.push({
      start: open.start,
      base: open.base,
      separator: open.separator,
      end: i,
      currentLabel: open.label,
      incomingLabel: endLabel
    })
    open = null
  })
  return out
}

/** Lines that take the place of the conflict (from `<<<<<<<` to `>>>>>>>`, inclusive). */
export function resolveConflict(lines: readonly string[], conflict: MergeConflict, choice: ConflictChoice): string[] {
  const current = lines.slice(conflict.start + 1, conflict.base ?? conflict.separator)
  const incoming = lines.slice(conflict.separator + 1, conflict.end)
  if (choice === 'current') return current
  if (choice === 'incoming') return incoming
  return [...current, ...incoming]
}

/** Some start marker is left in the text (the file is not resolved yet). */
export function hasConflictMarkers(text: string): boolean {
  return parseConflicts(text.split('\n')).length > 0
}

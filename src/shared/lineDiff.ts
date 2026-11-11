// Line diff (Myers) between two lists of lines, shared by the editor gutter, the per-hunk stage in main and hunk
// reverting in the renderer. Pure: receives lines (or comparison keys), never raw text.

/** A differing hunk: `oldCount` base lines became `newCount` document lines. 0-based indices. */
export interface Hunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

/** Max different lines (edit distance) Myers explores; beyond that the middle becomes a single block. */
const MAX_EDIT_DISTANCE = 600

/**
 * Shortest edit script (Myers, O(ND)) between two id arrays. Returns `null` if the distance exceeds the limit.
 * Each edit stores the position in both sequences BEFORE it: that is what allows merging neighbouring edits into one
 * hunk.
 */
function myers(a: number[], b: number[]): { oldPos: number; newPos: number; kind: 'del' | 'ins' }[] | null {
  const n = a.length
  const m = b.length
  const cap = Math.min(n + m, MAX_EDIT_DISTANCE)
  const offset = cap + 1
  const v = new Int32Array(2 * cap + 3)
  const trace: Int32Array[] = []
  let found = -1

  outer: for (let d = 0; d <= cap; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      const left = v[offset + k - 1] ?? 0
      const right = v[offset + k + 1] ?? 0
      let x = k === -d || (k !== d && left < right) ? right : left + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break outer
      }
    }
  }
  if (found < 0) return null

  const edits: { oldPos: number; newPos: number; kind: 'del' | 'ins' }[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const prev = trace[d]
    if (!prev) return null
    const k = x - y
    const down = k === -d || (k !== d && (prev[offset + k - 1] ?? 0) < (prev[offset + k + 1] ?? 0))
    const prevK = down ? k + 1 : k - 1
    const prevX = prev[offset + prevK] ?? 0
    const prevY = prevX - prevK
    edits.push({ oldPos: prevX, newPos: prevY, kind: down ? 'ins' : 'del' })
    x = prevX
    y = prevY
  }
  return edits.reverse()
}

/** Hunks that differ between `oldLines` and `newLines` (in order, without overlap). */
export function diffLines(oldLines: string[], newLines: string[]): Hunk[] {
  const n = oldLines.length
  const m = newLines.length
  let start = 0
  while (start < n && start < m && oldLines[start] === newLines[start]) start++
  let oldEnd = n
  let newEnd = m
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  if (start === oldEnd && start === newEnd) return []
  const whole: Hunk = { oldStart: start, oldCount: oldEnd - start, newStart: start, newCount: newEnd - start }
  if (whole.oldCount === 0 || whole.newCount === 0) return [whole]

  // Lines become numeric ids: comparing integers in the Myers loop is much cheaper than strings.
  const ids = new Map<string, number>()
  const toId = (line: string): number => {
    let id = ids.get(line)
    if (id === undefined) ids.set(line, (id = ids.size))
    return id
  }
  const a = oldLines.slice(start, oldEnd).map(toId)
  const b = newLines.slice(start, newEnd).map(toId)
  const edits = myers(a, b)
  if (!edits) return [whole]

  const hunks: Hunk[] = []
  let current: Hunk | null = null
  for (const edit of edits) {
    const oldPos = start + edit.oldPos
    const newPos = start + edit.newPos
    const continues =
      current && current.oldStart + current.oldCount === oldPos && current.newStart + current.newCount === newPos
    if (!current || !continues) {
      current = { oldStart: oldPos, oldCount: 0, newStart: newPos, newCount: 0 }
      hunks.push(current)
    }
    if (edit.kind === 'del') current.oldCount++
    else current.newCount++
  }
  return hunks
}

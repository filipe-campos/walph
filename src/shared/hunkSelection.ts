// Selection of hunks and lines of a line diff: what "Stage/Unstage/Revert Hunk" and "… selected lines" do with the
// two versions. Pure and generic in the line type: main uses raw lines (with the terminator) and the renderer, the
// editor document lines.
import type { Hunk } from './lineDiff'

/** Range of lines on the new side of the diff, from 1, inclusive. */
export interface LineRange {
  from: number
  to: number
}

const touches = (line: number, ranges: readonly LineRange[]): boolean =>
  ranges.some((r) => line >= r.from && line <= r.to)

/** Line that represents a removal-only hunk: the one after the removed block (the last one, at the end of the file). */
function deletionAnchor(hunk: Hunk, newLength: number): number {
  return Math.max(1, Math.min(hunk.newStart + 1, newLength))
}

/** Range covering the whole hunk ("hunk" actions). */
export function hunkRange(hunk: Hunk, newLength: number): LineRange {
  if (hunk.newCount === 0) {
    const line = deletionAnchor(hunk, newLength)
    return { from: line, to: line }
  }
  return { from: hunk.newStart + 1, to: hunk.newStart + hunk.newCount }
}

/** Hunk containing the line (from 1) on the new side, or `undefined`. */
export function hunkAtLine(hunks: readonly Hunk[], line: number, newLength: number): Hunk | undefined {
  return hunks.find((h) => {
    const range = hunkRange(h, newLength)
    return line >= range.from && line <= range.to
  })
}

/** Hunks touched by the ranges. */
export function hunksInRanges(hunks: readonly Hunk[], ranges: readonly LineRange[], newLength: number): Hunk[] {
  return hunks.filter((h) => {
    const range = hunkRange(h, newLength)
    return ranges.some((r) => r.from <= range.to && r.to >= range.from)
  })
}

/**
 * Combines the two versions according to the selected lines (on the new side):
 * - `apply`: the old version with only the selected changes (the new index content in a partial stage);
 * - `revert`: the new version without the selected changes (revert in the working tree, partial unstage).
 * Inside a hunk, new line `i` replaces old line `i`; leftover old lines are removed when the last new line of the
 * hunk (or, in a removal-only hunk, the line that represents it) is selected.
 */
export function selectLines<T>(
  oldLines: readonly T[],
  newLines: readonly T[],
  hunks: readonly Hunk[],
  ranges: readonly LineRange[],
  mode: 'apply' | 'revert'
): T[] {
  const flip = mode === 'revert'
  const out: T[] = []
  let oldPos = 0
  let newPos = 0
  for (const h of hunks) {
    // Outside the hunks both versions match: copies the one serving as base (the line terminator may differ).
    out.push(...(flip ? newLines.slice(newPos, h.newStart) : oldLines.slice(oldPos, h.oldStart)))
    const takesNew = (i: number): boolean => touches(h.newStart + i + 1, ranges) !== flip
    const common = Math.min(h.oldCount, h.newCount)
    for (let i = 0; i < common; i++) {
      const line = takesNew(i) ? newLines[h.newStart + i] : oldLines[h.oldStart + i]
      if (line !== undefined) out.push(line)
    }
    if (h.oldCount > h.newCount) {
      const trigger =
        h.newCount === 0
          ? touches(deletionAnchor(h, newLines.length), ranges)
          : touches(h.newStart + h.newCount, ranges)
      if (trigger === flip) out.push(...oldLines.slice(h.oldStart + h.newCount, h.oldStart + h.oldCount))
    }
    for (let i = h.oldCount; i < h.newCount; i++) {
      const line = newLines[h.newStart + i]
      if (takesNew(i) && line !== undefined) out.push(line)
    }
    oldPos = h.oldStart + h.oldCount
    newPos = h.newStart + h.newCount
  }
  out.push(...(flip ? newLines.slice(newPos) : oldLines.slice(oldPos)))
  return out
}

/**
 * Maps ranges from the new side to the old side of the same diff (e.g. working tree lines → index lines). An equal
 * line goes to its counterpart; inside a hunk, the range covers the hunk's old lines. A range that only touches
 * inserted lines disappears.
 */
export function mapRangesToOld(hunks: readonly Hunk[], ranges: readonly LineRange[]): LineRange[] {
  const map = (line: number, edge: 'from' | 'to'): number => {
    let delta = 0
    for (const h of hunks) {
      if (line <= h.newStart) break
      if (line <= h.newStart + h.newCount) return edge === 'from' ? h.oldStart + 1 : h.oldStart + h.oldCount
      delta += h.newCount - h.oldCount
    }
    return line - delta
  }
  const out: LineRange[] = []
  for (const r of ranges) {
    const from = map(r.from, 'from')
    const to = map(r.to, 'to')
    if (to >= from) out.push({ from, to })
  }
  return out
}

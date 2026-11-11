/**
 * Target index of a dragged item from the pointer: how many of the OTHER items have the center before `pos` (on the
 * drag axis).
 * `mids` are the centers of the items in the resting layout (measured at the start of the drag, without transform).
 */
export function dragTargetIndex(mids: readonly number[], from: number, pos: number): number {
  let to = 0
  mids.forEach((mid, i) => {
    if (i !== from && mid < pos) to += 1
  })
  return to
}

/**
 * Offset (px) of each item while `from` is dragged to `to`: the items between the two positions make way by
 * moving one step (size + gap) to the opposite side; the dragged one goes straight to the target slot.
 */
export function dragOffsets(count: number, from: number, to: number, step: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === from) return (to - from) * step
    if (to > from && i > from && i <= to) return -step
    if (to < from && i >= to && i < from) return step
    return 0
  })
}

export type Point = { x: number; y: number }

/** Slot nearest the pointer in a wrapping grid (`centers` = center of each item in the resting layout). */
export function gridTargetIndex(centers: readonly Point[], pos: Point): number {
  let best = 0
  let bestDist = Infinity
  centers.forEach((c, i) => {
    const dist = (c.x - pos.x) ** 2 + (c.y - pos.y) ** 2
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  })
  return best
}

/** Like `dragOffsets`, but each item goes to the center of the slot it will take, even on another row. */
export function gridOffsets(centers: readonly Point[], from: number, to: number): Point[] {
  return centers.map((c, i) => {
    let slot = i
    if (i === from) slot = to
    else if (to > from && i > from && i <= to) slot = i - 1
    else if (to < from && i >= to && i < from) slot = i + 1
    const target = centers[slot] ?? c
    return { x: target.x - c.x, y: target.y - c.y }
  })
}

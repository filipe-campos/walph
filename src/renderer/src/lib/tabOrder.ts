// Position of a dragged tab: final index in the list after removing it from the original position.

export function dropIndex(fromIndex: number, targetIndex: number, side: 'before' | 'after'): number {
  const insertAt = targetIndex + (side === 'after' ? 1 : 0)
  return insertAt > fromIndex ? insertAt - 1 : insertAt
}

export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return next
  next.splice(Math.min(Math.max(toIndex, 0), next.length), 0, item)
  return next
}

/**
 * Tab that becomes active after closing `closingIds`: if the active one was not closed, itself; else the remaining
 * neighbor on the right (or the last one). `null` if none is left.
 */
export function nextActiveAfterClose(
  tabs: readonly { id: string }[],
  activeId: string | null,
  closingIds: ReadonlySet<string>
): string | null {
  const remaining = tabs.filter((t) => !closingIds.has(t.id))
  if (activeId && !closingIds.has(activeId)) return activeId
  const activeIdx = tabs.findIndex((t) => t.id === activeId)
  const right = remaining.find((t) => tabs.indexOf(t) > activeIdx)
  return (activeIdx >= 0 ? right : undefined)?.id ?? remaining[remaining.length - 1]?.id ?? null
}

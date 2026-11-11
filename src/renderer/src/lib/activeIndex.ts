export interface ActiveIndexOptions {
  /** ↑ on the first goes to the last and ↓ on the last goes back to the first. */
  wrap?: boolean | undefined
  /** Home/End go to the ends. Off in text fields, where they move the cursor. */
  homeEnd?: boolean | undefined
  /** Items that PageUp/PageDown skip over. */
  pageSize?: number | undefined
}

/** Active option after a navigation key (`aria-activedescendant`); `null` = key not handled or empty list. */
export function activeTarget(
  key: string,
  index: number,
  count: number,
  { wrap = false, homeEnd = false, pageSize = 10 }: ActiveIndexOptions = {}
): number | null {
  if (count <= 0) return null
  const last = count - 1
  const clamp = (i: number): number => Math.min(Math.max(i, 0), last)
  switch (key) {
    case 'ArrowDown':
      return wrap ? (index + 1) % count : clamp(index + 1)
    case 'ArrowUp':
      return wrap ? (index - 1 + count) % count : clamp(index - 1)
    case 'PageDown':
      return clamp(index + pageSize)
    case 'PageUp':
      return clamp(index - pageSize)
    case 'Home':
      return homeEnd ? 0 : null
    case 'End':
      return homeEnd ? last : null
    default:
      return null
  }
}

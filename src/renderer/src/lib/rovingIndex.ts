export type RovingOrientation = 'horizontal' | 'vertical' | 'both'

const PREV: Record<RovingOrientation, readonly string[]> = {
  horizontal: ['ArrowLeft'],
  vertical: ['ArrowUp'],
  both: ['ArrowLeft', 'ArrowUp']
}
const NEXT: Record<RovingOrientation, readonly string[]> = {
  horizontal: ['ArrowRight'],
  vertical: ['ArrowDown'],
  both: ['ArrowRight', 'ArrowDown']
}

/**
 * Target of a navigation key in a roving tabindex group (tabs, radios): arrows wrap around, Home/End go to the
 * ends and disabled items are skipped. `null` = key not handled or no enabled item.
 */
export function rovingTarget(
  key: string,
  index: number,
  count: number,
  orientation: RovingOrientation = 'horizontal',
  isDisabled: (index: number) => boolean = () => false
): number | null {
  const enabled = (i: number): boolean => !isDisabled(i)
  const step = (dir: 1 | -1): number | null => {
    for (let n = 1; n <= count; n++) {
      const i = (((index + dir * n) % count) + count) % count
      if (enabled(i)) return i
    }
    return null
  }
  if (count <= 0) return null
  if (PREV[orientation].includes(key)) return step(-1)
  if (NEXT[orientation].includes(key)) return step(1)
  if (key === 'Home') return Array.from({ length: count }, (_, i) => i).find(enabled) ?? null
  if (key === 'End') return Array.from({ length: count }, (_, i) => count - 1 - i).find(enabled) ?? null
  return null
}

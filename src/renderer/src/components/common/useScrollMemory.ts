import { useCallback, useLayoutEffect, useRef } from 'react'

// Views mounted on demand (Search, Git) lose the scroll on unmount: stores it by key, outside React.
const memory = new Map<string, number>()

/** Restores and saves the scroll of a scrollable container across remounts. */
export function useScrollMemory<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const top = memory.get(key)
    if (top && ref.current) ref.current.scrollTop = top
  }, [key])
  const onScroll = useCallback(() => {
    if (ref.current) memory.set(key, ref.current.scrollTop)
  }, [key])
  return [ref, onScroll] as const
}

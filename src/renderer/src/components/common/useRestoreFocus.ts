import { useCallback, useEffect, useState } from 'react'

/**
 * Stores the focused element on mount. `restore()` returns focus to it now; on unmount it only returns it if focus was
 * lost (a command that moved focus, like opening a file, wins). In components with `inert` in the cleanup, call it
 * after
 * the effect that removes it: focus does not enter an `inert` element.
 */
export function useRestoreFocus(): () => void {
  const [opener] = useState(() => document.activeElement)
  const restore = useCallback((): void => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
  }, [opener])
  useEffect(
    () => () => {
      const el = document.activeElement
      if (!el || el === document.body || !el.isConnected) restore()
    },
    [restore]
  )
  return restore
}

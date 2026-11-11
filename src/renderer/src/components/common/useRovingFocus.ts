import { useCallback, type KeyboardEvent } from 'react'
import { rovingTarget, type RovingOrientation } from '../../lib/rovingIndex'

interface Options {
  orientation?: RovingOrientation
  /** Items of the group, in DOM order. */
  selector?: string
  /** Automatic activation (ARIA pattern for tabs and radios): moving focus also clicks the item. */
  activate?: boolean
}

/**
 * Arrows/Home/End between the items of a group (`tablist`, `radiogroup`, button list): `orientation` picks the arrows
 * (`horizontal`, `vertical` or `both`). Returns the container `onKeyDown`; disabled items are skipped and keys from
 * a child of the item (rename field) do not count.
 */
export function useRovingFocus({
  orientation = 'horizontal',
  selector = '[role="tab"]',
  activate = false
}: Options = {}): (e: KeyboardEvent) => void {
  return useCallback(
    (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const current = (e.target as HTMLElement).closest<HTMLElement>(selector)
      if (!current || current !== e.target || !e.currentTarget.contains(current)) return
      const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector))
      const at = items.indexOf(current)
      const to = rovingTarget(
        e.key,
        at,
        items.length,
        orientation,
        (i) => items[i]?.matches(':disabled, [aria-disabled="true"]') ?? false
      )
      if (at < 0 || to === null) return
      const next = items[to]
      if (!next) return
      e.preventDefault()
      if (activate && next !== current) next.click()
      next.focus()
    },
    [orientation, selector, activate]
  )
}

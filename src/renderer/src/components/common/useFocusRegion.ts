import { useCallback, type RefCallback, type RefObject } from 'react'
import { registerRegion, type FocusRegion } from '../../focusBridge'

/**
 * Ref that registers the element as a focus region while mounted (`null` = does not register). `focus` must have a
 * stable identity (module function): changing it re-registers the region. `intoRef` passes the element to a ref the
 * component already uses.
 */
export function useFocusRegion<T extends HTMLElement>(
  region: FocusRegion | null,
  options: { focus?: (el: HTMLElement) => boolean; intoRef?: RefObject<T | null> } = {}
): RefCallback<T> {
  const { focus, intoRef } = options
  return useCallback(
    (el: T | null) => {
      if (intoRef) intoRef.current = el
      const off = el && region ? registerRegion(region, el, focus) : undefined
      if (!intoRef) return off
      return () => {
        off?.()
        intoRef.current = null
      }
    },
    [region, focus, intoRef]
  )
}

import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import { isVisible } from '../../claudeVisibility'

/**
 * Focus of Claude's request card (question, elicitation). On mount, only with the session in view and without stealing
 * typing: focuses `initial()` (or the root). When `trigger` changes later, returns focus to the root only if the user
 * acted on the card (`noteIntent()` in the action, returned) and focus fell to the body. The `claudeCard:<id>` region
 * is
 * registered separately (`useFocusRegion`).
 */
export function useCardAutoFocus(
  ref: RefObject<HTMLElement | null>,
  conversationId: string,
  trigger?: unknown,
  initial?: (root: HTMLElement) => HTMLElement | null
): () => void {
  const mounted = useRef(false)
  const refocus = useRef(false)
  const focusCard = useEffectEvent(() => {
    const root = ref.current
    if (!root) return
    const active = document.activeElement
    if (!mounted.current) {
      mounted.current = true
      const typing = (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && !!active.value
      const free = active === document.body || !!active?.closest('.claude-panel')
      if (isVisible(conversationId) && free && !typing) (initial?.(root) ?? root).focus()
    } else if (refocus.current && active === document.body) root.focus()
    refocus.current = false
  })
  useEffect(() => focusCard(), [trigger])
  return () => {
    refocus.current = !!ref.current?.contains(document.activeElement)
  }
}

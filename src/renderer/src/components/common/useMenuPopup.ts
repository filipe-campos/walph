import { useCallback, useEffect, useId, useRef, useState } from 'react'

const ITEM_SELECTOR = '[data-nav]:not(:disabled)'

/**
 * Shared mechanics of the dropdown menus (DropdownMenu, ChipMenu): open/close, focus on the first item (or on the
 * `aria-checked` one, or on the last with ↑), close on an outside click, ↑/↓/Home/End/Esc/Tab and optional ←/→.
 * The navigable items are the `[data-nav]` INSIDE the popup. Esc and an outside click call `returnFocus` before
 * closing:
 * a focused item leaving the DOM fires no `focusout` and would leave the `claudeFocus` context stuck.
 */
export function useMenuPopup({
  returnFocus,
  onArrow
}: {
  returnFocus: () => void
  onArrow?: ((dir: 1 | -1) => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Which item gets focus on open: the first (click, ↓) or the last (↑).
  const focusOnOpen = useRef<'first' | 'last'>('first')
  const menuId = useId()
  // `returnFocus` is usually recreated on every render; the effect must not resubscribe because of it.
  const returnRef = useRef(returnFocus)
  useEffect(() => {
    returnRef.current = returnFocus
  })

  const items = useCallback(
    (): HTMLElement[] => [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])],
    []
  )

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) returnRef.current()
  }, [])

  useEffect(() => {
    if (!open) return
    // Menu with a search field (`data-autofocus`): initial focus goes to it, not to an item.
    const field = menuRef.current?.querySelector<HTMLElement>('[data-autofocus]')
    const list = items()
    const checked = list.find((el) => el.getAttribute('aria-checked') === 'true')
    if (field) field.focus()
    else (focusOnOpen.current === 'last' ? list[list.length - 1] : (checked ?? list[0]))?.focus()
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current?.contains(e.target as Node)) return
      if (rootRef.current?.contains(document.activeElement)) returnRef.current()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, items])

  // A focused item leaving the DOM (e.g. a mode stops existing with the menu open) drops focus to the body.
  useEffect(() => {
    if (open && document.activeElement === document.body)
      (menuRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? null)?.focus()
  })

  const onMenuKeyDown = (e: React.KeyboardEvent): void => {
    // In a text field, Home/End/←/→ move the cursor: they are not menu navigation.
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    // An empty field has no cursor to move: ←/→ go on to `onArrow` (e.g. changing the effort).
    const emptyField = inField && (e.target as HTMLInputElement | HTMLTextAreaElement).value === ''
    const arrowForMenu = emptyField && !!onArrow && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    if (
      inField &&
      !arrowForMenu &&
      (e.key === 'Home' || e.key === 'End' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    )
      return
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (i: number): void => {
      e.preventDefault()
      list[(i + list.length) % list.length]?.focus()
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(at + 1)
      case 'ArrowUp':
        return go(at < 0 ? -1 : at - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(-1)
      case 'ArrowLeft':
      case 'ArrowRight':
        if (onArrow) {
          e.preventDefault()
          onArrow(e.key === 'ArrowRight' ? 1 : -1)
        }
        return
      case 'Escape':
        e.preventDefault()
        // Does not let the Esc reach the panel (which also uses Esc for other things).
        e.stopPropagation()
        return close(true)
      case 'Tab':
        return close(false)
    }
  }

  /** Opens on the first item or on the last (↑). */
  const openAt = useCallback((from: 'first' | 'last') => {
    focusOnOpen.current = from
    setOpen(true)
  }, [])
  const toggle = (): void => {
    focusOnOpen.current = 'first'
    setOpen(!open)
  }

  return { open, rootRef, menuRef, menuId, close, openAt, toggle, onMenuKeyDown }
}

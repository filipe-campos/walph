import { useCallback, useRef, type ReactNode } from 'react'
import { MenuList, type MenuEntry } from './MenuList'
import { useMenuPopup } from './useMenuPopup'

/**
 * Status bar item that opens a menu upwards (`menu`/`menuitem[radio]`): same mechanics as `DropdownMenu`
 * (`useMenuPopup`), but the trigger is a `.status-item`. `itemClass` goes on the container (the bar width rules
 * hide it whole) and `status` goes in the button `data-status`.
 */
export function StatusMenu({
  status,
  label,
  title,
  itemClass,
  align = 'left',
  items,
  children
}: {
  status: string
  label: string
  title?: string
  itemClass?: string
  align?: 'left' | 'right'
  items: MenuEntry[]
  children: ReactNode
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useCallback(() => buttonRef.current?.focus({ preventScroll: true }), [])
  const { open, rootRef, menuRef, menuId, close, openAt, toggle, onMenuKeyDown } = useMenuPopup({ returnFocus })

  return (
    <div
      className={['status-menu', itemClass].filter(Boolean).join(' ')}
      ref={rootRef as React.RefObject<HTMLDivElement>}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`status-item${open ? ' open' : ''}`}
        data-status={status}
        title={title ?? label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            openAt('last')
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            openAt('first')
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className={`dropdown-menu status-popup ${align}`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          <MenuList items={items} close={() => close(true)} />
        </div>
      )}
    </div>
  )
}

import { useCallback, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { MenuList, type MenuEntry } from './MenuList'
import { useMenuPopup } from './useMenuPopup'

/**
 * Button with an accessible dropdown menu (`menu`/`menuitem`): Enter/Space/↓ open on the first item, ↑ on the last;
 * ↑/↓/Home/End
 * navigate (disabled items are skipped); Esc closes and returns focus to the button; Tab and an outside click close.
 * Picking
 * an item returns focus to the button BEFORE running the action (an action that focuses something else, like the rename
 * field, wins).
 */
export function DropdownMenu({
  label,
  icon,
  items,
  disabled,
  className,
  menuClassName
}: {
  label: string
  icon: ReactNode
  items: MenuEntry[]
  disabled?: boolean
  className?: string
  menuClassName?: string
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useCallback(() => buttonRef.current?.focus({ preventScroll: true }), [])
  const { open, rootRef, menuRef, menuId, close, openAt, toggle, onMenuKeyDown } = useMenuPopup({ returnFocus })

  const onButtonKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openAt(e.key === 'ArrowUp' ? 'last' : 'first')
    }
  }

  return (
    <div className="dropdown" ref={rootRef as React.RefObject<HTMLDivElement>}>
      <IconButton
        ref={buttonRef}
        label={label}
        className={className}
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onButtonKeyDown}
      >
        {icon}
      </IconButton>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className={['dropdown-menu', menuClassName].filter(Boolean).join(' ')}
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

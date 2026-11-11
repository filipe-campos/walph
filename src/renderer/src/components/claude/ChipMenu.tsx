import type { ReactNode } from 'react'
import { Icon } from '../common/Icon'
import { useMenuPopup } from '../common/useMenuPopup'

/**
 * Chip of the field bar with a menu that opens UPWARDS, at the field width (the popup is absolute relative to
 * `.claude-prompt`). Navigable items carry `data-nav` (↑/↓/Home/End; the `aria-checked` one gets focus on open).
 * Esc and an outside click close and return focus to the field (`returnFocus`): a focused item leaving the DOM would
 * leave the `claudeFocus` context stuck. ←/→ go to `onArrow` (the effort slider).
 */
export function ChipMenu({
  label,
  trigger,
  className,
  menuClassName,
  testId,
  returnFocus,
  onArrow,
  children
}: {
  label: string
  trigger: ReactNode
  className?: string
  menuClassName?: string
  testId: string
  returnFocus: () => void
  onArrow?: (dir: 1 | -1) => void
  children: (close: () => void) => ReactNode
}) {
  const { open, rootRef, menuRef, menuId, close, openAt, toggle, onMenuKeyDown } = useMenuPopup({
    returnFocus,
    onArrow
  })

  return (
    <span className="claude-chip-wrap" ref={rootRef}>
      <button
        type="button"
        className={['claude-chip-button', open && 'open', className].filter(Boolean).join(' ')}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={testId}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            openAt('first')
          }
        }}
      >
        {trigger}
        {/* Rotates upwards when the menu (which opens upwards) is open. */}
        <Icon name="chevron" className="claude-chip-chev" />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          data-testid={`${testId}-menu`}
          className={['claude-menu', 'claude-chip-menu', menuClassName].filter(Boolean).join(' ')}
          onKeyDown={onMenuKeyDown}
        >
          {children(() => close(true))}
        </div>
      )}
    </span>
  )
}

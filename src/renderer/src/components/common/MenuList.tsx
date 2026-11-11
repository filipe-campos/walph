import { Fragment, type ReactNode } from 'react'

export interface MenuEntry {
  /** Goes in the test attribute (`data-action` by default) and identifies the item. */
  id: string
  label: string
  /** Effective shortcut (already formatted), on the right. */
  hint?: string | undefined
  /** Second line of the `option` variant. */
  description?: ReactNode
  /** Icon before the text. */
  icon?: ReactNode
  /** Extra item class (e.g. the mode tone). */
  className?: string
  danger?: boolean
  /** Marks the current item (`menuitemradio`/`menuitemcheckbox`); `undefined` = a plain item. */
  checked?: boolean
  /** `radio` (default) or `checkbox`; only applies with `checked`. */
  checkKind?: 'radio' | 'checkbox'
  disabled?: boolean
  /** Divider before the item. */
  separator?: boolean
  onSelect: () => void
}

/**
 * Items of a dropdown menu (`useMenuPopup` navigates the `[data-nav]`). `menu` = compact row with the mark on the left;
 * `option` = option with title/description and the mark on the right. `close` runs before `onSelect`.
 */
export function MenuList({
  items,
  close,
  variant = 'menu',
  idAttr = 'data-action'
}: {
  items: MenuEntry[]
  close: () => void
  variant?: 'menu' | 'option'
  idAttr?: 'data-action' | 'data-mode' | 'data-model'
}) {
  const anyChecked = variant === 'menu' && items.some((i) => i.checked !== undefined)
  return (
    <>
      {items.map((item) => {
        const base = variant === 'menu' ? 'dropdown-item' : 'claude-option'
        const className = [base, item.className, item.danger && 'danger'].filter(Boolean).join(' ')
        return (
          <Fragment key={item.id}>
            {item.separator && <div className="dropdown-separator" role="separator" />}
            <button
              type="button"
              role={
                item.checked === undefined
                  ? 'menuitem'
                  : item.checkKind === 'checkbox'
                    ? 'menuitemcheckbox'
                    : 'menuitemradio'
              }
              aria-checked={item.checked}
              {...{ [idAttr]: item.id }}
              data-nav
              className={className}
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => {
                close()
                item.onSelect()
              }}
            >
              {anyChecked && (
                <span className="status-popup-check" aria-hidden>
                  {item.checked && <i className="codicon codicon-check" />}
                </span>
              )}
              {item.icon}
              {variant === 'menu' ? (
                <span className="dropdown-label">{item.label}</span>
              ) : (
                <span className="claude-option-text">
                  <span className="claude-option-title">{item.label}</span>
                  {item.description && <span className="claude-option-desc">{item.description}</span>}
                </span>
              )}
              {item.hint && <span className="dropdown-hint">{item.hint}</span>}
              {variant === 'option' && item.checked && <i className="codicon codicon-check" aria-hidden="true" />}
            </button>
          </Fragment>
        )
      })}
    </>
  )
}

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { TYPE_AHEAD_MS, typeAheadIndex } from '../../lib/typeAhead'
import { Icon } from './Icon'
import { useActiveDescendant } from './useActiveDescendant'

export interface SelectOption {
  value: string
  label: string
}

interface MenuPlacement {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const ROW = 28
const MAX_LIST = 280

/**
 * Custom picker in place of the native `<select>`: `combobox` button + `listbox` list rendered in `body` (not clipped
 * by the modal scroll). Focus always stays on the button (`aria-activedescendant`). Keyboard: ↑/↓/Home/End move,
 * Enter/Space pick, Esc closes (without reaching the modal), Tab closes; a letter goes to the next item starting with
 * it (typing in a row forms a prefix). Picking only calls `onChange`: the caller decides the shown value (`value`).
 */
export function Select({
  value,
  options,
  onChange,
  label,
  disabled,
  testId,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid
}: {
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  /** Accessible name of the button. */
  label: string
  disabled?: boolean
  testId?: string
  id?: string
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
}) {
  const [menu, setMenu] = useState<MenuPlacement | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const typed = useRef({ text: '', at: 0 })

  const selected = options.findIndex((o) => o.value === value)
  const open = menu !== null
  const {
    index: active,
    setIndex: setActive,
    onKeyDown: onNavKeyDown
  } = useActiveDescendant({ count: options.length, idOf: (i) => `${listId}-${i}`, open, homeEnd: true })

  const openMenu = (focusIndex?: number): void => {
    const button = buttonRef.current
    if (!button || disabled) return
    const rect = button.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const wanted = Math.min(options.length * ROW + 8, MAX_LIST)
    const up = below < wanted && above > below
    setMenu({
      left: rect.left,
      width: rect.width,
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(ROW * 2, Math.min(MAX_LIST, up ? above : below))
    })
    setActive(focusIndex ?? Math.max(selected, 0))
  }

  const close = useCallback(() => setMenu(null), [])

  const choose = (index: number): void => {
    const option = options[index]
    close()
    if (option && option.value !== value) onChange(option.value)
  }

  // Scrolling or resizing moves the button: the (fixed position) list would close misaligned.
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event): void => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return
      close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Escape') {
      if (!open) return // without an open list the Esc goes on to the modal
      e.preventDefault()
      e.stopPropagation()
      return close()
    }
    if (e.key === 'Tab') return close()
    if (e.key.length === 1 && e.key !== ' ') {
      const now = Date.now()
      const t = typed.current
      t.text = now - t.at < TYPE_AHEAD_MS ? t.text + e.key : e.key
      t.at = now
      const from = open ? active : Math.max(selected, 0)
      // With the list closed, the search starts from the chosen item without "skipping" the current one when the prefix
      // is longer.
      const found = typeAheadIndex(
        options.map((o) => o.label),
        from,
        t.text
      )
      if (found < 0) return
      e.preventDefault()
      if (open) setActive(found)
      else openMenu(found)
      return
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (onNavKeyDown(e)) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        return choose(active)
    }
  }

  const current = options[selected]
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={`select${open ? ' open' : ''}`}
        disabled={disabled}
        data-testid={testId}
        data-value={value}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        <span className="select-value">{current?.label ?? value}</span>
        <Icon name="chevron" className="select-chevron" />
      </button>
      {menu &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="select-list"
            style={{ ...menu, minWidth: menu.width, width: undefined }}
            // Clicking an option must not take focus from the button (the blur would close the list before the click).
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((option, i) => (
              <div
                key={option.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                data-active={i === active}
                data-value={option.value}
                className={`select-option${i === active ? ' active' : ''}${i === selected ? ' selected' : ''}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="select-option-label">{option.label}</span>
                {i === selected && <Icon name="check" />}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

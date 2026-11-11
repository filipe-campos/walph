import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import { IconButton } from './IconButton'
import { useRestoreFocus } from './useRestoreFocus'

const FOCUSABLE =
  'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled):not([tabindex="-1"]), textarea:not(:disabled):not([tabindex="-1"]), [href]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

/**
 * Design system modal: Settings, destructive confirmations and short flows that ask for full attention, such as
 * "Open folder as workspace" (one at a time; Claude notices are toasts).
 * Rendered in `body`; the app (`#root`) stays `inert` while open, so focus and clicks do not escape. Tab wraps
 * inside the dialog; Esc and a click on the backdrop close, unless `dismissible={false}`. Initial focus goes to
 * `[data-autofocus]`, or to the first control; in the `danger` tone, to `[data-modal-safe]` (the safe button, never the
 * destructive one). On close, focus returns to whoever opened it. The parent unmounts the component to close.
 */
export function Modal({
  title,
  onClose,
  dismissible = true,
  tone = 'default',
  footer,
  className,
  testId,
  children
}: {
  title: string
  onClose: () => void
  dismissible?: boolean
  tone?: 'default' | 'danger'
  footer?: ReactNode
  className?: string
  testId?: string
  children: ReactNode
}) {
  const t = useT()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const initial =
      (tone === 'danger' ? dialog.querySelector<HTMLElement>('[data-modal-safe]') : null) ??
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog
    initial.focus({ preventScroll: true })
    return () => {
      root?.removeAttribute('inert')
    }
  }, [tone])
  // After the effect above: its cleanup removes `inert`, and focus does not return to an element inside an inert
  // `#root`.
  useRestoreFocus()

  // Blurring before closing makes the field being edited save the valid draft (React does not fire `onBlur` on
  // unmount).
  const requestClose = useCallback((): void => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onClose()
  }, [onClose])

  // A focused control that unmounts (e.g. "Restore" disappears after the click) leaves focus on `body`, outside the
  // dialog `onKeyDown`: Esc and Tab arrive through the document and bring focus back.
  useEffect(() => {
    const onDocKeyDown = (e: globalThis.KeyboardEvent): void => {
      const dialog = dialogRef.current
      if (!dialog || (e.target instanceof Node && dialog.contains(e.target))) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (dismissible) requestClose()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const items = dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
        ;(items[e.shiftKey ? items.length - 1 : 0] ?? dialog).focus()
      }
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [dismissible, requestClose])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (dismissible) requestClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const first = items[0]
    const last = items.at(-1)
    if (!first || !last) return e.preventDefault()
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={['modal', tone === 'danger' && 'danger', className].filter(Boolean).join(' ')}
        data-testid={testId}
        onKeyDown={onKeyDown}
      >
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          {dismissible && <IconButton glyph="close" label={t.common.close} onClick={requestClose} />}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

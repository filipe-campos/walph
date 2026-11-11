import { useRef, type InputHTMLAttributes } from 'react'

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'onKeyDown' | 'onBlur' | 'onFocus' | 'onClick' | 'onDoubleClick' | 'autoFocus'
>

interface Props extends NativeProps {
  initial: string
  /** Enter ('enter') or leaving the field ('blur'): the caller decides the focus afterwards. */
  onCommit: (value: string, via: 'enter' | 'blur') => void
  onCancel: () => void
  /** 'basename' selects the name without the extension, as in VS Code. */
  select?: 'all' | 'basename'
  /** The field keyboard does not belong to the container (tab, panel). */
  stopKeys?: boolean
  /** Click and double click do not reach the container (clickable tab). */
  stopClicks?: boolean
}

/**
 * Inline edit field: Enter and blur confirm, Esc cancels, composition (IME) is ignored and only the first exit counts.
 */
export function InlineEdit({ initial, onCommit, onCancel, select = 'all', stopKeys, stopClicks, ...rest }: Props) {
  // Enter/Esc unmount the field and the blur may come afterwards: only the first exit counts.
  const done = useRef(false)
  const exit = (run: () => void): void => {
    if (done.current) return
    done.current = true
    run()
  }
  return (
    <input
      autoFocus
      {...rest}
      defaultValue={initial}
      onFocus={(e) => {
        if (select === 'basename') {
          const dot = initial.lastIndexOf('.')
          e.currentTarget.setSelectionRange(0, dot > 0 ? dot : initial.length)
        } else e.currentTarget.select()
      }}
      onClick={stopClicks ? (e) => e.stopPropagation() : undefined}
      onDoubleClick={stopClicks ? (e) => e.stopPropagation() : undefined}
      onKeyDown={(e) => {
        if (stopKeys) e.stopPropagation()
        // Enter/Esc of a composition confirm/cancel the candidate, not the text.
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          const value = e.currentTarget.value
          exit(() => onCommit(value, 'enter'))
        } else if (e.key === 'Escape') {
          e.preventDefault()
          exit(onCancel)
        }
      }}
      onBlur={(e) => {
        const value = e.currentTarget.value
        exit(() => onCommit(value, 'blur'))
      }}
    />
  )
}

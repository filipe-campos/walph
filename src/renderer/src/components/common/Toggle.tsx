import { Icon } from './Icon'
import type { IconSource } from './IconButton'

type ToggleProps = IconSource & {
  active: boolean
  /** Accessible name (`aria-label`) and tooltip. */
  label: string
  onClick: () => void
  disabled?: boolean
  /** Tooltip when it differs from the name (e.g. describes the state); `null` removes it. */
  title?: string | null
  className?: string
  children?: React.ReactNode
}

/** Toggle button (case, regex…): `aria-pressed` + highlight when on. */
export function Toggle({ active, label, title, icon, glyph, disabled, className, children, onClick }: ToggleProps) {
  return (
    <button
      type="button"
      className={['toggle', active && 'on', className].filter(Boolean).join(' ')}
      title={title === null ? undefined : (title ?? label)}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {glyph ? <Icon name={glyph} /> : icon ? <i className={`codicon ${icon}`} /> : null}
      {children}
    </button>
  )
}

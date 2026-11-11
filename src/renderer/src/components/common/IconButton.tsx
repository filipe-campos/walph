import { useT } from '../../i18n'
import { Icon, type IconName } from './Icon'

/** One of the two: Walph design system icon (`glyph`) or codicon (`icon`, `codicon-…`); with neither, `children`. */
export type IconSource =
  { glyph: IconName; icon?: never } | { icon: string; glyph?: never } | { glyph?: never; icon?: never }

type IconButtonProps = IconSource &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label' | 'aria-pressed'> & {
    ref?: React.Ref<HTMLButtonElement>
    /** Accessible name (`aria-label`) and, by default, the tooltip. */
    label: string
    /** Tooltip; `null` removes it. Default: `label` (with the shortcut, if any). */
    title?: string | null
    /** Already formatted keys (`useShortcutLabel`), appended to the tooltip. */
    shortcut?: string | undefined
    /** "On" highlight (e.g. panel open). */
    active?: boolean
    /** `aria-pressed`, for toggle buttons. */
    pressed?: boolean
    /** Action in progress: `aria-disabled` and click blocked, keeping focus on the button. */
    busy?: boolean
    /** Replaces the icon. */
    children?: React.ReactNode
  }

export function IconButton({
  icon,
  glyph,
  label,
  title,
  shortcut,
  active,
  pressed,
  busy,
  className,
  children,
  onClick,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  const t = useT()
  const tooltip = title === null ? undefined : (title ?? (shortcut ? t.common.withShortcut(label, shortcut) : label))
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['icon-button', active && 'active', className].filter(Boolean).join(' ')}
      title={tooltip}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
    >
      {children ?? (glyph ? <Icon name={glyph} /> : icon ? <i className={`codicon ${icon}`} /> : null)}
    </button>
  )
}

import { Icon, type IconName } from './Icon'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm' | 'xs'
  icon?: IconName
  /** Action in progress: `aria-disabled` and click blocked, keeping focus on the button. */
  busy?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  busy,
  className,
  children,
  onClick,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['button', `button-${variant}`, size !== 'md' && `button-${size}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-disabled={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

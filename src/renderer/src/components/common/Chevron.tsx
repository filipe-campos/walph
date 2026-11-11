import { Icon } from './Icon'

/**
 * Decorative collapse/expand arrow; the state lives in the `aria-expanded` of the button or row. Without `open`, the
 * parent rotates it (`.tree-row.open .tree-chevron`); `placeholder` reserves the same space (files).
 */
export function Chevron({
  open,
  placeholder,
  className
}: {
  open?: boolean
  placeholder?: boolean
  className?: string
}) {
  const classes = ['tree-chevron', open ? 'open' : '', className].filter(Boolean).join(' ')
  if (placeholder) return <span className={classes} aria-hidden />
  return <Icon name="chevron" className={classes} aria-hidden />
}

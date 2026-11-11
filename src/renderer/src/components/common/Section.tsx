import { useState, type ReactNode } from 'react'
import { Chevron } from './Chevron'

/** Collapsible section with a count and actions that appear on hover. `open`/`onToggle` make it controlled. */
export function Section({
  title,
  count,
  actions,
  open: controlledOpen,
  onToggle,
  className,
  children
}: {
  title: string
  /** Extra container class (layout of the caller). */
  className?: string
  count?: number
  actions?: ReactNode
  open?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
}) {
  const [localOpen, setLocalOpen] = useState(true)
  const open = controlledOpen ?? localOpen
  const toggle = (): void => {
    if (onToggle) onToggle(!open)
    else setLocalOpen(!open)
  }
  return (
    <div className={['git-section', className].filter(Boolean).join(' ')}>
      <div className="tree-row section-header">
        <button type="button" className="section-toggle" aria-expanded={open} onClick={toggle}>
          <Chevron open={open} />
          <span className="tree-label">{title}</span>
          {count !== undefined && <span className="count-badge">{count}</span>}
        </button>
        {actions && <span className="row-actions">{actions}</span>}
      </div>
      {open && children}
    </div>
  )
}

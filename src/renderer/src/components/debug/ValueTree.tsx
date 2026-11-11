import { memo, useEffect, type ReactNode } from 'react'
import type { DebugVariable } from '@shared/types'
import { useStore } from '../../store'
import { loadVariables, setVariableExpanded } from '../../debugActions'
import { Chevron } from '../common/Chevron'
import { useT } from '../../i18n'
import { onTreeKeyDown } from './treeKeys'

const INDENT = 12

interface ValueRowProps {
  /** Name path of the node (expansion key, stable across stops). */
  nodeKey: string
  name: string
  value?: string | undefined
  type?: string | null | undefined
  /** > 0 = has children, read on expand. */
  reference: number
  depth: number
  /** Open when the user has not chosen yet (cheap scopes start open). */
  defaultOpen?: boolean
  error?: boolean
  /** Buttons on the right (revealed on row hover/focus). */
  actions?: ReactNode
  /** E.g. editing the watch expression. */
  onDoubleClick?: () => void
  className?: string
}

/** Name/value row with children on demand (Variables, Watch, console results). */
export const ValueRow = memo(function ValueRow({
  nodeKey,
  name,
  value,
  type,
  reference,
  depth,
  defaultOpen = false,
  error = false,
  actions,
  onDoubleClick,
  className
}: ValueRowProps) {
  const expandable = reference > 0
  const open = useStore((s) => expandable && (s.debugExpanded[nodeKey] ?? defaultOpen))
  const toggle = (): void => {
    if (expandable) setVariableExpanded(nodeKey, !open)
  }
  return (
    <>
      <div
        className={['tree-row', 'debug-value-row', error && 'error', className].filter(Boolean).join(' ')}
        role="treeitem"
        aria-level={depth + 1}
        {...(expandable && { 'aria-expanded': open })}
        tabIndex={0}
        data-debug-row=""
        style={{ paddingLeft: 8 + depth * INDENT }}
        title={type ?? undefined}
        onClick={toggle}
        onDoubleClick={onDoubleClick}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          } else if (e.key === 'ArrowRight' && expandable && !open) {
            e.preventDefault()
            setVariableExpanded(nodeKey, true)
          } else if (e.key === 'ArrowLeft' && open) {
            e.preventDefault()
            setVariableExpanded(nodeKey, false)
          }
        }}
      >
        <Chevron open={open} placeholder={!expandable} />
        <span className="debug-value-name">{name}</span>
        {value !== undefined && <span className="debug-value-text">{value}</span>}
        {actions && <span className="row-actions">{actions}</span>}
      </div>
      {open && <ChildValues reference={reference} parentKey={nodeKey} depth={depth + 1} />}
    </>
  )
})

/** Children of a reference: asks the adapter the first time the node shows open. */
function ChildValues({ reference, parentKey, depth }: { reference: number; parentKey: string; depth: number }) {
  const t = useT()
  const children = useStore((s) => s.debugVariables[reference])
  const stopped = useStore((s) =>
    s.debugSessions.some((x) => x.id === s.debugFocus?.sessionId && x.state === 'stopped')
  )
  useEffect(() => {
    if (!children && stopped) void loadVariables(reference)
  }, [children, stopped, reference])
  if (!children) {
    return stopped ? (
      <div className="debug-empty" style={{ paddingLeft: 8 + depth * INDENT + 16 }}>
        {t.debugUi.variables.loading}
      </div>
    ) : null
  }
  if (children.length === 0) {
    return (
      <div className="debug-empty" style={{ paddingLeft: 8 + depth * INDENT + 16 }}>
        {t.debugUi.variables.empty}
      </div>
    )
  }
  return (
    <>
      {children.map((v: DebugVariable, i) => (
        <ValueRow
          // Names may repeat (e.g. shadowed variables): the index breaks the tie.
          key={`${v.name}#${i}`}
          nodeKey={`${parentKey}/${v.name}`}
          name={v.name}
          value={v.value}
          type={v.type}
          reference={v.variablesReference}
          depth={depth}
        />
      ))}
    </>
  )
}

/** Container with ↑/↓/Home/End between the rows. */
export function ValueTree({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="debug-tree" role="tree" aria-label={label} onKeyDown={onTreeKeyDown}>
      {children}
    </div>
  )
}

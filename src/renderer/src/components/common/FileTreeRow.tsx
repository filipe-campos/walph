import type { HTMLAttributes, ReactNode } from 'react'
import { basename, dirname, relativeTo } from '../../lib/path'
import { Chevron } from './Chevron'
import { FileIcon } from './FileIcon'

/**
 * File row of the lists (Git, history, Search, Problems): optional chevron, icon, name, folder, actions on hover
 * and a badge on the right. The `treeRowProps` attributes, `role`, `title` and `onClick` pass straight to the row.
 */
export function FileTreeRow({
  path,
  root,
  name,
  dir,
  open,
  icon = true,
  dirClassName = 'muted ellipsis',
  actions,
  badge,
  className,
  ...rest
}: {
  path: string
  /** Folder the relative path shown beside the name starts from (ignored if `dir` comes ready). */
  root?: string
  name?: string
  dir?: string
  /** Shows the chevron with this state; without it the row has no chevron. */
  open?: boolean
  icon?: boolean
  dirClassName?: string
  actions?: ReactNode
  badge?: ReactNode
} & HTMLAttributes<HTMLDivElement>) {
  const shownDir = dir ?? (root ? relativeTo(root, dirname(path)) : '')
  return (
    <div {...rest} className={['tree-row', className].filter(Boolean).join(' ')}>
      {open !== undefined && <Chevron open={open} />}
      {icon && <FileIcon name={path} />}
      <span className="tree-label">{name ?? basename(path)}</span>
      {shownDir && <span className={dirClassName}>{shownDir}</span>}
      {actions && (
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </span>
      )}
      {badge}
    </div>
  )
}

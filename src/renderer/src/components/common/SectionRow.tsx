import type { ReactNode } from 'react'
import { FileTreeRow } from './FileTreeRow'
import { treeRowProps } from './useGroupedTree'
import { useT } from '../../i18n'

/**
 * Section header as a group of a `useGroupedTree` (Git: Staged, Changes, Stashes): chevron, title, actions and
 * count. Same look as `Section`, but it is a `treeitem` navigable with the arrows.
 */
export function SectionRow({
  rowKey,
  tabStop,
  title,
  count,
  open,
  actions
}: {
  rowKey: string
  tabStop: boolean
  title: string
  count: number
  open: boolean
  actions?: ReactNode
}) {
  const t = useT()
  return (
    <FileTreeRow
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={1}
      aria-expanded={open}
      // Without the label, the name would come from the content and include the actions revealed by focus.
      aria-label={t.common.withCount(title, count)}
      className="section-header"
      path=""
      name={title}
      icon={false}
      open={open}
      actions={actions}
      badge={<span className="count-badge">{count}</span>}
    />
  )
}

import { memo } from 'react'
import { treeRowProps } from './common/useGroupedTree'
import { FileTreeRow } from './common/FileTreeRow'

interface PanelGroup {
  path: string
  name: string
  dir: string
  items: readonly unknown[]
}

/** File header of the Problems and References panels. */
export const PanelGroupRow = memo(function PanelGroupRow({
  rowKey,
  tabStop,
  group,
  open
}: {
  rowKey: string
  tabStop: boolean
  group: PanelGroup
  open: boolean
}) {
  return (
    <FileTreeRow
      {...treeRowProps(rowKey, tabStop)}
      className="problem-group"
      role="treeitem"
      aria-expanded={open}
      title={group.path}
      path={group.path}
      name={group.name}
      dir={group.dir}
      dirClassName="problem-dir"
      open={open}
      icon={false}
      badge={<span className="count-badge">{group.items.length}</span>}
    />
  )
})

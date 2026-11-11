import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import { basename } from '../lib/path'
import { iconForSymbolKind } from '../lib/symbolKinds'
import { flattenHierarchy, HIERARCHY_DIRECTIONS, type HierarchyRow } from '../lib/hierarchyTree'
import { openHierarchyNode, setHierarchyDirection, toggleHierarchyNode } from '../hierarchyActions'
import { Chevron } from './common/Chevron'
import { Toggle } from './common/Toggle'

type NodeRow = Extract<HierarchyRow, { type: 'node' }>

const indent = (depth: number): React.CSSProperties => ({ paddingLeft: 8 + depth * 12 })

const HierarchyNodeRow = memo(function HierarchyNodeRow({ row, tabStop }: { row: NodeRow; tabStop: boolean }) {
  const { node, depth, expanded } = row
  const { icon } = iconForSymbolKind(node.item.symbolKind)
  return (
    <div
      className="tree-row hierarchy-row"
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expanded}
      data-row={row.key}
      tabIndex={tabStop ? 0 : -1}
      title={node.item.path}
      style={indent(depth)}
      onClick={() => openHierarchyNode(node)}
    >
      <span
        className="hierarchy-twistie"
        onClick={(e) => {
          e.stopPropagation()
          toggleHierarchyNode(node)
        }}
      >
        <Chevron open={expanded} />
      </span>
      <i className={`codicon ${icon} hierarchy-icon`} aria-hidden />
      <span className="tree-label">{node.item.name}</span>
      {node.item.detail && <span className="muted ellipsis">{node.item.detail}</span>}
      <span className="muted ellipsis hierarchy-file">{basename(node.item.path)}</span>
    </div>
  )
})

function StatusRow({ row }: { row: Extract<HierarchyRow, { type: 'status' }> }) {
  const t = useT()
  const m = t.lspNavigation.hierarchy
  const text = row.status === 'loading' ? m.loading : row.status === 'error' ? m.failed : m.noResults
  return (
    <div className="tree-row hierarchy-status muted" role="none" style={indent(row.depth)}>
      {text}
    </div>
  )
}

/** "Hierarchy" view: incoming/outgoing calls or supertypes/subtypes, with children requested on expand. */
export function HierarchyPanel() {
  const t = useT()
  const m = t.lspNavigation.hierarchy
  const hierarchy = useStore((s) => s.hierarchy)
  const visible = useStore((s) => s.terminalVisible && s.panelView === 'hierarchy')
  const rows = useMemo(() => (hierarchy ? flattenHierarchy(hierarchy) : []), [hierarchy])
  const nodes = useMemo(() => rows.filter((r): r is NodeRow => r.type === 'node'), [rows])
  const [focused, setFocused] = useState<string | null>(null)
  const tabStop = nodes.some((r) => r.key === focused) ? focused : (nodes[0]?.key ?? null)
  const treeRef = useRef<HTMLDivElement>(null)
  const roots = hierarchy?.roots

  // New hierarchy (or view shown): focus goes to the first row, to navigate with the arrows right away.
  useEffect(() => {
    if (visible && roots) treeRef.current?.querySelector<HTMLElement>('[data-row]')?.focus()
  }, [visible, roots])

  const focusRow = (key: string | null | undefined): void => {
    if (!key) return
    treeRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const index = nodes.findIndex((r) => r.key === tabStop)
    const row = nodes[index]
    if (!row) return
    switch (event.key) {
      case 'ArrowDown':
        focusRow(nodes[index + 1]?.key)
        break
      case 'ArrowUp':
        focusRow(nodes[index - 1]?.key)
        break
      case 'Home':
        focusRow(nodes[0]?.key)
        break
      case 'End':
        focusRow(nodes.at(-1)?.key)
        break
      case 'ArrowRight': {
        const next = nodes[index + 1]
        if (!row.expanded) toggleHierarchyNode(row.node, true)
        else if (next?.parentKey === row.key) focusRow(next.key)
        break
      }
      case 'ArrowLeft':
        if (row.expanded) toggleHierarchyNode(row.node, false)
        else focusRow(row.parentKey)
        break
      case 'Enter':
        openHierarchyNode(row.node)
        break
      case ' ':
        toggleHierarchyNode(row.node)
        break
      default:
        return
    }
    event.preventDefault()
  }

  if (!hierarchy) {
    return (
      <div className="problems hierarchy">
        <div className="empty-line" role="status">
          {m.empty}
        </div>
      </div>
    )
  }

  const title = hierarchy.kind === 'call' ? m.callsOf(hierarchy.name) : m.typesOf(hierarchy.name)
  return (
    <div className="problems hierarchy">
      <div className="hierarchy-bar">
        <span className="references-title" title={title}>
          {title}
        </span>
        <div className="hierarchy-directions" role="group" aria-label={m.directions}>
          {HIERARCHY_DIRECTIONS[hierarchy.kind].map((direction) => (
            <Toggle
              key={direction}
              active={hierarchy.direction === direction}
              label={m[direction]}
              title={null}
              onClick={() => void setHierarchyDirection(direction)}
            >
              {m[direction]}
            </Toggle>
          ))}
        </div>
      </div>
      <div
        ref={treeRef}
        className="hierarchy-tree"
        role="tree"
        aria-label={title}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const key = (e.target as HTMLElement).dataset.row
          if (key) setFocused(key)
        }}
      >
        {rows.map((row) =>
          row.type === 'node' ? (
            <HierarchyNodeRow key={row.key} row={row} tabStop={row.key === tabStop} />
          ) : (
            <StatusRow key={row.key} row={row} />
          )
        )}
      </div>
    </div>
  )
}

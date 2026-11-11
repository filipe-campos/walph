// Call/type hierarchy tree: the children of each node are requested on expand and the visible list is flattened
// into rows (with depth) for the panel.
import type {
  LspHierarchyDirection,
  LspHierarchyEdge,
  LspHierarchyItem,
  LspHierarchyKind,
  LspLocation,
  LspRange
} from '@shared/types'

export interface HierarchyNode {
  /** The item id in main: each requested neighbor gets a new id, so the key is unique even with recursion. */
  key: string
  item: LspHierarchyItem
  /** Calls that link the node to the parent (empty on the roots and in the type hierarchy). */
  ranges: LspRange[]
}

/** Children of a node: the list, or the request in progress/failed. */
type HierarchyChildren = HierarchyNode[] | 'loading' | 'error'

export interface HierarchyState {
  kind: LspHierarchyKind
  direction: LspHierarchyDirection
  /** Symbol the hierarchy started from. */
  name: string
  roots: HierarchyNode[]
  children: Record<string, HierarchyChildren>
  expanded: Record<string, boolean>
}

export type HierarchyRow =
  | { type: 'node'; key: string; depth: number; parentKey: string | null; node: HierarchyNode; expanded: boolean }
  | { type: 'status'; key: string; depth: number; parentKey: string; status: 'loading' | 'error' | 'empty' }

export const HIERARCHY_DIRECTIONS: Record<LspHierarchyKind, readonly [LspHierarchyDirection, LspHierarchyDirection]> = {
  call: ['incoming', 'outgoing'],
  type: ['supertypes', 'subtypes']
}

export const defaultDirection = (kind: LspHierarchyKind): LspHierarchyDirection =>
  kind === 'call' ? 'incoming' : 'subtypes'

export function toNode(edge: LspHierarchyEdge): HierarchyNode {
  return { key: String(edge.item.id), item: edge.item, ranges: edge.ranges }
}

/** Visible rows, depth-first; an expanded node without a reply yet shows a state row. */
export function flattenHierarchy(state: HierarchyState): HierarchyRow[] {
  const rows: HierarchyRow[] = []
  const visit = (nodes: HierarchyNode[], depth: number, parentKey: string | null): void => {
    for (const node of nodes) {
      const expanded = state.expanded[node.key] === true
      rows.push({ type: 'node', key: node.key, depth, parentKey, node, expanded })
      if (!expanded) continue
      const children = state.children[node.key] ?? 'loading'
      if (children === 'loading' || children === 'error') {
        rows.push({
          type: 'status',
          key: `${node.key}:status`,
          depth: depth + 1,
          parentKey: node.key,
          status: children
        })
      } else if (children.length === 0) {
        rows.push({ type: 'status', key: `${node.key}:status`, depth: depth + 1, parentKey: node.key, status: 'empty' })
      } else {
        visit(children, depth + 1, node.key)
      }
    }
  }
  visit(state.roots, 0, null)
  return rows
}

/**
 * Where to go when opening the node: on an incoming call, the call site (in the caller's file); on the others, the
 * symbol name.
 */
export function nodeTarget(node: HierarchyNode, direction: LspHierarchyDirection): LspLocation {
  const [call] = node.ranges
  if (direction === 'incoming' && call) return { path: node.item.path, range: call }
  return { path: node.item.path, range: node.item.selectionRange }
}

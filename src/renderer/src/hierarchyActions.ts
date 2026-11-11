// Call and type hierarchy (panel Hierarchy view): roots at the cursor, children requested on expand.
import { t } from '@shared/i18n'
import type { LspHierarchyDirection, LspHierarchyKind } from '@shared/types'
import { offsetToLspPosition } from '@shared/lspPosition'
import { shownTabId } from './components/editor/groupViews'
import { defaultDirection, nodeTarget, toNode, type HierarchyNode, type HierarchyState } from './lib/hierarchyTree'
import { activeFile, openLocation } from './lspNavigationActions'
import { attempt } from './attempt'
import { get, set } from './store'
import { notify } from './toasts'

const api = window.api

function update(fn: (state: HierarchyState) => HierarchyState): void {
  set((s) => (s.hierarchy ? { hierarchy: fn(s.hierarchy) } : {}))
}

/** Requests the children of `node` in the current direction; a reply for another hierarchy or direction is dropped. */
async function loadChildren(node: HierarchyNode): Promise<void> {
  const state = get().hierarchy
  if (!state) return
  const { direction } = state
  update((s) => ({ ...s, children: { ...s.children, [node.key]: 'loading' } }))
  const edges = await attempt(() => api.lsp.hierarchyRelated(node.item.id, direction), { fallback: null })
  const now = get().hierarchy
  if (!now || now.roots !== state.roots || now.direction !== direction) return
  update((s) => ({ ...s, children: { ...s.children, [node.key]: edges ? edges.map(toNode) : 'error' } }))
}

/** "Show Call/Type Hierarchy" at the cursor: opens the view with the roots already expanded. */
export async function showHierarchy(kind: LspHierarchyKind): Promise<void> {
  const file = activeFile()
  if (!file) return
  const { view, tabId, path } = file
  const doc = view.state.doc
  const pos = view.state.selection.main.head
  const root = get().root
  const items = await attempt(() => api.lsp.prepareHierarchy(kind, path, offsetToLspPosition(doc, pos)), {
    fallback: null
  })
  if (!items || shownTabId() !== tabId || get().root !== root) return
  const m = t().lspNavigation.hierarchy
  if (items.length === 0) {
    notify(kind === 'call' ? m.noCalls : m.noTypes, 'info')
    return
  }
  const roots = items.map((item) => toNode({ item, ranges: [] }))
  const name = items[0]?.name ?? ''
  const expanded = Object.fromEntries(roots.map((node) => [node.key, true]))
  set({
    hierarchy: { kind, direction: defaultDirection(kind), name, roots, children: {}, expanded },
    panelView: 'hierarchy',
    terminalVisible: true
  })
  await Promise.all(roots.map(loadChildren))
}

/** Switches between incoming/outgoing calls (or supertypes/subtypes): the tree restarts from the roots. */
export async function setHierarchyDirection(direction: LspHierarchyDirection): Promise<void> {
  const state = get().hierarchy
  if (!state || state.direction === direction) return
  const expanded = Object.fromEntries(state.roots.map((node) => [node.key, true]))
  set({ hierarchy: { ...state, direction, children: {}, expanded } })
  await Promise.all(state.roots.map(loadChildren))
}

/** Expands (requesting the children the first time or after a failure) or collapses the node. */
export function toggleHierarchyNode(node: HierarchyNode, open?: boolean): void {
  const state = get().hierarchy
  if (!state) return
  const next = open ?? !state.expanded[node.key]
  if (next === (state.expanded[node.key] === true)) return
  update((s) => ({ ...s, expanded: { ...s.expanded, [node.key]: next } }))
  const children = state.children[node.key]
  if (next && (children === undefined || children === 'error')) void loadChildren(node)
}

export function openHierarchyNode(node: HierarchyNode): void {
  const state = get().hierarchy
  if (state) openLocation(nodeTarget(node, state.direction))
}

/** Clears the hierarchy; the view disappears and, if it was open, the panel goes back to Problems. */
export function clearHierarchy(): void {
  set((s) => ({ hierarchy: null, panelView: s.panelView === 'hierarchy' ? 'problems' : s.panelView }))
}

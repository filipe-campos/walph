// Pure model of the editor groups: up to `MAX_EDITOR_GROUPS` groups in a grid of splits (`layout`), each with its
// own tab strip and its own active tab. The tabs (entities: document, dirty, LSP) stay in a single list in the store;
// the group only keeps the ids, and the same tab can be in several groups. Everything here is immutable and without
// React/store.
import { isFiniteNumber } from '@shared/guards'
import {
  MAX_EDITOR_GROUPS,
  layoutGroups,
  mapLayout,
  neighborGroup,
  parseLayout,
  reconcileLayout,
  resizeLayout,
  rowLayout,
  splitLayout,
  type GroupSide,
  type LayoutNode
} from '@shared/editorLayout'
import { moveItem, nextActiveAfterClose } from './tabOrder'

export interface EditorGroup {
  id: string
  /** Order of the group's tab strip. */
  tabIds: string[]
  activeTabId: string | null
}

export interface GroupsState {
  /** In the reading order of the grid (that of the leaves of `layout`): "1st group", "next group". */
  groups: EditorGroup[]
  activeGroupId: string
  /** Where each group lives; the leaves are exactly the ids of `groups`. */
  layout: LayoutNode<string>
}

export function createGroups(id: string): GroupsState {
  return { groups: [{ id, tabIds: [], activeTabId: null }], activeGroupId: id, layout: { group: id } }
}

export function findGroup(state: GroupsState, groupId: string): EditorGroup | undefined {
  return state.groups.find((g) => g.id === groupId)
}

export function activeGroup(state: GroupsState): EditorGroup {
  return (
    findGroup(state, state.activeGroupId) ??
    state.groups[0] ?? { id: state.activeGroupId, tabIds: [], activeTabId: null }
  )
}

/** Active tab of the active group: the mirror the store keeps in `activeTabId`. */
export function activeTabOf(state: GroupsState): string | null {
  return activeGroup(state).activeTabId
}

export function groupsWithTab(state: GroupsState, tabId: string): EditorGroup[] {
  return state.groups.filter((g) => g.tabIds.includes(tabId))
}

/** Group of a tab: the active one if it has it, else the first one that has it. */
export function groupOfTab(state: GroupsState, tabId: string): EditorGroup | undefined {
  const active = activeGroup(state)
  return active.tabIds.includes(tabId) ? active : state.groups.find((g) => g.tabIds.includes(tabId))
}

export function openTabIds(state: GroupsState): Set<string> {
  return new Set(state.groups.flatMap((g) => g.tabIds))
}

/** Tabs that only exist in this group: on closing it, they are the ones that stop existing. */
export function tabsOnlyIn(state: GroupsState, groupId: string): string[] {
  const group = findGroup(state, groupId)
  if (!group) return []
  const elsewhere = new Set(state.groups.filter((g) => g.id !== groupId).flatMap((g) => g.tabIds))
  return group.tabIds.filter((id) => !elsewhere.has(id))
}

function replaceGroup(state: GroupsState, next: EditorGroup): GroupsState {
  return { ...state, groups: state.groups.map((g) => (g.id === next.id ? next : g)) }
}

/**
 * Swaps the set of groups: the grid loses the leaves that left (the space goes to the neighbors), gains on the right
 * those that had no place and the list follows the grid order. An active group that left passes to the first.
 */
function withGroups(state: GroupsState, groups: EditorGroup[], activeGroupId = state.activeGroupId): GroupsState {
  const layout = reconcileLayout(
    state.layout,
    groups.map((g) => g.id)
  )
  const order = layoutGroups(layout)
  const sorted = [...groups].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  const active = sorted.some((g) => g.id === activeGroupId) ? activeGroupId : (sorted[0]?.id ?? activeGroupId)
  return { groups: sorted, activeGroupId: active, layout }
}

/** With more than one group, the one left without tabs disappears and the neighbor takes over the space. */
export function dropEmptyGroups(state: GroupsState): GroupsState {
  if (state.groups.length < 2) return state
  const groups = state.groups.filter((g) => g.tabIds.length > 0)
  if (groups.length === state.groups.length) return state
  // All empty: the active one stays (the editor always has at least one group).
  return withGroups(state, groups.length === 0 ? [activeGroup(state)] : groups)
}

function withoutTabs(group: EditorGroup, closing: ReadonlySet<string>): EditorGroup {
  if (!group.tabIds.some((id) => closing.has(id))) return group
  const tabIds = group.tabIds.filter((id) => !closing.has(id))
  const activeTabId = nextActiveAfterClose(
    group.tabIds.map((id) => ({ id })),
    group.activeTabId,
    closing
  )
  return { ...group, tabIds, activeTabId }
}

/**
 * Shows the tab in a group (the active one by default): appends it if it is not there yet, makes it the group's active
 * tab and the group the active one. `index` picks the position when appending; `replaceId` removes that tab from the
 * group and puts the new one in its place (preview tab, which is per group).
 */
export function showTab(
  state: GroupsState,
  tabId: string,
  options: { groupId?: string; index?: number; replaceId?: string | undefined } = {}
): GroupsState {
  const group = findGroup(state, options.groupId ?? state.activeGroupId) ?? activeGroup(state)
  let tabIds = group.tabIds
  if (!tabIds.includes(tabId)) {
    const slot = options.replaceId ? tabIds.indexOf(options.replaceId) : -1
    if (slot >= 0) tabIds = tabIds.map((id, i) => (i === slot ? tabId : id))
    else {
      const at = Math.min(Math.max(options.index ?? tabIds.length, 0), tabIds.length)
      tabIds = [...tabIds.slice(0, at), tabId, ...tabIds.slice(at)]
    }
  }
  return { ...replaceGroup(state, { ...group, tabIds, activeTabId: tabId }), activeGroupId: group.id }
}

/**
 * Activates a tab that is already open: in the requested group, else in the active one if it has it, else in the first
 * that has it. A tab that is in no group changes nothing.
 */
export function activateTab(state: GroupsState, tabId: string, groupId?: string): GroupsState {
  const requested = groupId ? findGroup(state, groupId) : undefined
  const group = requested?.tabIds.includes(tabId) ? requested : groupOfTab(state, tabId)
  if (!group) return state
  if (group.activeTabId === tabId && state.activeGroupId === group.id) return state
  return { ...replaceGroup(state, { ...group, activeTabId: tabId }), activeGroupId: group.id }
}

export function focusGroup(state: GroupsState, groupId: string): GroupsState {
  if (state.activeGroupId === groupId || !findGroup(state, groupId)) return state
  return { ...state, activeGroupId: groupId }
}

/**
 * Focuses the next group in the grid order (`step` -1 = the previous), wrapping around; no effect with a single one.
 */
export function focusNextGroup(state: GroupsState, step = 1): GroupsState {
  const count = state.groups.length
  if (count < 2) return state
  const at = Math.max(
    state.groups.findIndex((g) => g.id === state.activeGroupId),
    0
  )
  const next = state.groups[(((at + step) % count) + count) % count]
  return next ? focusGroup(state, next.id) : state
}

/** Focuses the next group (no effect with a single one). */
export function focusOtherGroup(state: GroupsState): GroupsState {
  return focusNextGroup(state, 1)
}

/** Focuses the neighbor group on the `side` of the active one; at the edge nothing changes. */
export function focusGroupToward(state: GroupsState, side: GroupSide): GroupsState {
  const target = neighborGroup(state.layout, state.activeGroupId, side)
  return target ? focusGroup(state, target) : state
}

/**
 * Focuses the group at position `index` (0 = the 1st). One more than exist splits the active one to the right (as in
 * VS Code, "focus the 2nd group" with a single one creates the 2nd).
 */
export function focusGroupAt(state: GroupsState, index: number, newGroupId: string): GroupsState {
  const group = state.groups[index]
  if (group) return focusGroup(state, group.id)
  return index === state.groups.length ? splitGroup(state, newGroupId, 'right') : state
}

/**
 * Splits the group (the active one by default) on the `side` side: the new group shows `tabId` (the group's active tab,
 * by default) and becomes the active one. With `move`, the tab leaves the source group (which closes if it becomes
 * empty).
 * Without a tab there is nothing to show on the other side; at the group limit, only focuses the neighbor on that side
 * (if any).
 */
export function splitGroup(
  state: GroupsState,
  newGroupId: string,
  side: GroupSide,
  options: { groupId?: string; tabId?: string; move?: boolean } = {}
): GroupsState {
  const source = findGroup(state, options.groupId ?? state.activeGroupId) ?? activeGroup(state)
  if (state.groups.length >= MAX_EDITOR_GROUPS) {
    const neighbor = neighborGroup(state.layout, source.id, side)
    return neighbor ? focusGroup(state, neighbor) : state
  }
  const tabId = options.tabId ?? source.activeTabId
  if (!tabId || findGroup(state, newGroupId)) return state
  const added: EditorGroup = { id: newGroupId, tabIds: [tabId], activeTabId: tabId }
  const groups = state.groups.map((g) => (options.move && g.id === source.id ? withoutTabs(g, new Set([tabId])) : g))
  const layout = splitLayout(state.layout, source.id, newGroupId, side)
  return dropEmptyGroups(withGroups({ ...state, layout }, [...groups, added], newGroupId))
}

/** Splits to the right: creates a group with a copy of the active tab and focuses it. */
export function splitRight(state: GroupsState, newGroupId: string): GroupsState {
  return splitGroup(state, newGroupId, 'right')
}

/**
 * Shows the tab "in the other group" (Markdown preview): in the neighbor to the right of the active one, else in a new
 * group on the right, else (at the limit) in the next group. The active group does not change: the focus stays in the
 * source editor, where the user keeps typing.
 */
export function showInOtherGroup(state: GroupsState, tabId: string, newGroupId: string): GroupsState {
  const active = activeGroup(state)
  const right = neighborGroup(state.layout, active.id, 'right')
  const fallback = state.groups.length >= MAX_EDITOR_GROUPS ? focusNextGroup(state).activeGroupId : undefined
  const target = right ?? (fallback !== active.id ? fallback : undefined)
  if (target) return { ...showTab(state, tabId, { groupId: target }), activeGroupId: active.id }
  const next = splitGroup(state, newGroupId, 'right', { groupId: active.id, tabId })
  return next === state ? state : { ...next, activeGroupId: active.id }
}

/**
 * Moves the tab to a group, at position `toIndex` of the final list (that of `dropIndex`). In the same group it is a
 * reorder. If the target already has the tab, it only leaves the source. A source left without tabs is closed; the
 * target becomes the active one.
 */
export function moveTab(state: GroupsState, tabId: string, toGroupId: string, toIndex: number, fromGroupId?: string) {
  const to = findGroup(state, toGroupId)
  const from = fromGroupId ? findGroup(state, fromGroupId) : groupOfTab(state, tabId)
  if (!to || !from || !from.tabIds.includes(tabId)) return state
  if (from.id === to.id) {
    const at = from.tabIds.indexOf(tabId)
    if (at === toIndex) return activateTab(state, tabId, to.id)
    return {
      ...replaceGroup(state, { ...to, tabIds: moveItem(to.tabIds, at, toIndex), activeTabId: tabId }),
      activeGroupId: to.id
    }
  }
  let next = replaceGroup(state, withoutTabs(from, new Set([tabId])))
  const target = findGroup(next, to.id)!
  const has = target.tabIds.includes(tabId)
  const at = Math.min(Math.max(toIndex, 0), target.tabIds.length)
  const tabIds = has ? target.tabIds : [...target.tabIds.slice(0, at), tabId, ...target.tabIds.slice(at)]
  next = { ...replaceGroup(next, { ...target, tabIds, activeTabId: tabId }), activeGroupId: to.id }
  return dropEmptyGroups(next)
}

/**
 * Moves the tab to the next (`step` 1) or previous (-1) group in the grid order. Without a group on that side, creates
 * one
 * to the right (or to the left) if the source has other tabs; moving the only tab to nowhere changes nothing.
 */
export function moveTabToAdjacentGroup(
  state: GroupsState,
  tabId: string,
  step: 1 | -1,
  newGroupId: string,
  fromGroupId?: string
): GroupsState {
  const from = fromGroupId ? findGroup(state, fromGroupId) : groupOfTab(state, tabId)
  if (!from?.tabIds.includes(tabId)) return state
  const target = state.groups[state.groups.indexOf(from) + step]
  if (target) return moveTab(state, tabId, target.id, target.tabIds.length, from.id)
  if (from.tabIds.length < 2) return state
  return splitGroup(state, newGroupId, step > 0 ? 'right' : 'left', { groupId: from.id, tabId, move: true })
}

/** Joins all groups into the active one: the tabs of the others go to the end of its strip (without repeats). */
export function joinAllGroups(state: GroupsState): GroupsState {
  if (state.groups.length < 2) return state
  const target = activeGroup(state)
  const tabIds = [...new Set([...target.tabIds, ...state.groups.flatMap((g) => g.tabIds)])]
  return { groups: [{ ...target, tabIds }], activeGroupId: target.id, layout: { group: target.id } }
}

/** Drags the divider `index` of the split at `path` (see `LayoutSash`) by `delta`, a fraction of that split. */
export function resizeGroups(state: GroupsState, path: readonly number[], index: number, delta: number): GroupsState {
  const layout = resizeLayout(state.layout, path, index, delta)
  return layout === state.layout ? state : { ...state, layout }
}

/** Closes the tabs in a single group (those that are in another group stay open there). */
export function closeTabsIn(state: GroupsState, groupId: string, tabIds: Iterable<string>): GroupsState {
  const group = findGroup(state, groupId)
  if (!group) return state
  return dropEmptyGroups(replaceGroup(state, withoutTabs(group, new Set(tabIds))))
}

/** Removes the tabs from all groups (the tab stopped existing: file removed, close all…). */
export function removeTabs(state: GroupsState, tabIds: Iterable<string>): GroupsState {
  const closing = new Set(tabIds)
  return dropEmptyGroups({ ...state, groups: state.groups.map((g) => withoutTabs(g, closing)) })
}

/**
 * Closes the group (only with more than one): the neighbors take over the space and, if it was the active one, the
 * focus goes to the previous group.
 * Its exclusive tabs are closed by the caller (`tabsOnlyIn`).
 */
export function closeGroup(state: GroupsState, groupId: string): GroupsState {
  const closing = state.groups.findIndex((g) => g.id === groupId)
  if (state.groups.length < 2 || closing < 0) return state
  const groups = state.groups.filter((g) => g.id !== groupId)
  const fallback = groups[Math.max(closing - 1, 0)]?.id
  const activeGroupId = state.activeGroupId === groupId ? (fallback ?? state.activeGroupId) : state.activeGroupId
  return withGroups(state, groups, activeGroupId)
}

// ---------- Session ----------

export interface SessionGroupsPlan {
  /** Each group as indexes into the session's tab list (already filtered). */
  groups: { tabs: number[]; activeIndex: number | null }[]
  activeGroup: number
  /** The grid, with indexes of `groups`. */
  layout: LayoutNode<number>
}

/** Limits of the 1st group's fraction in sessions from before the grid (two groups side by side). */
const LEGACY_SPLIT_RATIO = { min: 0.15, max: 0.85, default: 0.5 }

/** The saved grid; without it (old session), the groups side by side, with the old fraction if there were two. */
function sessionLayout(rawLayout: unknown, legacyRatio: unknown, groupCount: number): LayoutNode<number> | null {
  const parsed = parseLayout(rawLayout, groupCount)
  if (parsed) return parsed
  const ratio = isFiniteNumber(legacyRatio)
    ? Math.min(Math.max(legacyRatio, LEGACY_SPLIT_RATIO.min), LEGACY_SPLIT_RATIO.max)
    : LEGACY_SPLIT_RATIO.default
  return rowLayout(
    Array.from({ length: groupCount }, (_, i) => i),
    groupCount === 2 ? [ratio, 1 - ratio] : []
  )
}

/**
 * Validates the groups of a session (hand-edited, from an old version or with tabs that disappeared). `map[i]` is the
 * final position of the session's tab `i` (-1 = dropped). Without valid groups, a single group with all the tabs
 * applies. `rawLayout` is
 * the saved grid (`editorLayout`) and `legacyRatio` the fraction of two-group sessions (`editorSplitRatio`).
 */
export function planSessionGroups(
  raw: { tabs: unknown; activeIndex: unknown }[] | undefined,
  rawActiveGroup: unknown,
  map: readonly number[],
  tabCount: number,
  activeIndex: number | null,
  rawLayout?: unknown,
  legacyRatio?: unknown
): SessionGroupsPlan {
  const single = (): SessionGroupsPlan => ({
    groups: [{ tabs: Array.from({ length: tabCount }, (_, i) => i), activeIndex }],
    activeGroup: 0,
    layout: { group: 0 }
  })
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EDITOR_GROUPS) return single()
  const valid = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < map.length
  const claimed = new Set<number>()
  const parsed = raw.map((g) => {
    const tabs: number[] = []
    for (const i of Array.isArray(g.tabs) ? g.tabs : []) {
      const final = valid(i) ? (map[i] ?? -1) : -1
      if (final >= 0 && !tabs.includes(final)) tabs.push(final)
    }
    for (const i of tabs) claimed.add(i)
    return { tabs, wanted: valid(g.activeIndex) ? (map[g.activeIndex] ?? -1) : -1 }
  })
  // A tab no group claims cannot vanish from the strip: it goes to the first.
  const orphans = Array.from({ length: tabCount }, (_, i) => i).filter((i) => !claimed.has(i))
  if (orphans.length > 0) parsed[0]?.tabs.push(...orphans)
  const groups = parsed.map((g) => ({
    tabs: g.tabs,
    activeIndex: g.tabs.includes(g.wanted) ? g.wanted : (g.tabs[0] ?? null)
  }))
  const filled = groups.filter((g) => g.tabs.length > 0)
  const [firstFilled] = filled
  if (!firstFilled) return single()
  const requested = Number.isInteger(rawActiveGroup) ? (rawActiveGroup as number) : 0
  const requestedGroup = groups[requested]
  const chosen = requestedGroup && requestedGroup.tabs.length > 0 ? requestedGroup : firstFilled
  // Empty groups leave the grid together with the list (the indexes become those of `filled`).
  const base = sessionLayout(rawLayout, legacyRatio, groups.length)
  const mapped = base
    ? mapLayout(base, (i) => {
        const group = groups[i]
        const at = group ? filled.indexOf(group) : -1
        return at >= 0 ? at : null
      })
    : null
  const layout = reconcileLayout(
    mapped,
    filled.map((_, i) => i)
  )
  return { groups: filled, activeGroup: filled.indexOf(chosen), layout }
}

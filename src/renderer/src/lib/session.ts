// Pure conversions of the workspace session (what the store saves and restores): positions, size limits and assembly.
import { isFiniteNumber } from '@shared/guards'
import type { Text } from '@codemirror/state'
import type {
  PanelPosition,
  SessionBreakpointFile,
  SessionClaudeTab,
  SessionClosedTab,
  TextEncoding,
  SessionPosition,
  SessionTab,
  SidebarView,
  WorkspaceSession
} from '@shared/types'
import { mapLayout, reconcileLayout, type LayoutNode } from '@shared/editorLayout'
import { dropEmptyGroups, planSessionGroups, type EditorGroup, type SessionGroupsPlan } from './editorGroups'

export const SIDEBAR_WIDTH = { min: 170, max: 700, default: 260 }
export const PANEL_HEIGHT = { min: 100, default: 260 }
export const PANEL_WIDTH = { min: 240, default: 480 }
/** Secondary sidebar (Claude panel). */
export const CLAUDE_WIDTH = { min: 300, max: 900, default: 400 }
/** Minimum space the panel leaves for the editor. */
const PANEL_EDITOR_MARGIN = 150
/** Width the right panel leaves for the editor + sidebar. */
const PANEL_EDITOR_MIN_WIDTH = 450

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** A finite number within the range; anything else (NaN, a string from an edited JSON) becomes `fallback`. */
function clampOr(value: unknown, min: number, max: number, fallback: number): number {
  return isFiniteNumber(value) ? clamp(value, min, max) : fallback
}

export function clampSidebarWidth(width: unknown): number {
  return clampOr(width, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max, SIDEBAR_WIDTH.default)
}

export function clampPanelHeight(height: unknown, windowHeight: number): number {
  const max = Math.max(PANEL_HEIGHT.min, windowHeight - PANEL_EDITOR_MARGIN)
  return clampOr(height, PANEL_HEIGHT.min, max, PANEL_HEIGHT.default)
}

/** Width of the panel in the `right` position: leaves room for the editor (and the sidebar already open). */
export function clampPanelWidth(width: unknown, windowWidth: number): number {
  const max = Math.max(PANEL_WIDTH.min, windowWidth - PANEL_EDITOR_MIN_WIDTH)
  return clampOr(width, PANEL_WIDTH.min, max, Math.min(PANEL_WIDTH.default, max))
}

/** Width of the secondary sidebar: leaves room for the editor (and the sidebar already open). */
export function clampClaudeWidth(width: unknown, windowWidth: number): number {
  const max = Math.max(CLAUDE_WIDTH.min, Math.min(CLAUDE_WIDTH.max, windowWidth - PANEL_EDITOR_MIN_WIDTH))
  return clampOr(width, CLAUDE_WIDTH.min, max, Math.min(CLAUDE_WIDTH.default, max))
}

/** Old (or hand-edited) sessions do not have the position: anything other than `right` is `bottom`. */
export function parsePanelPosition(value: unknown): PanelPosition {
  return value === 'right' ? 'right' : 'bottom'
}

/** Document offset → line (from 1) and column (from 0), the `Reveal` convention. */
export function offsetToPosition(doc: Text, offset: number): SessionPosition {
  const line = doc.lineAt(clamp(offset, 0, doc.length))
  return { line: line.number, column: clamp(offset, 0, doc.length) - line.from }
}

/** Position → offset, clamped to the document (the file may have changed since the session was saved). */
export function positionToOffset(doc: Text, position: SessionPosition): number {
  const lineNumber = clampOr(Math.floor(position.line), 1, doc.lines, 1)
  const line = doc.line(lineNumber)
  return line.from + clampOr(Math.floor(position.column), 0, line.length, 0)
}

/** Cursor and scroll of a file tab. */
export interface TabViewState {
  cursor: SessionPosition
  /** First line visible at the top of the editor (from 1). */
  topLine: number
}

export interface SessionSourceTab {
  id: string
  kind: 'file' | 'diff' | 'markdownPreview' | 'image'
  path: string
  preview?: boolean
  /** Only the encoding chosen by the user goes into the session. */
  encoding?: TextEncoding | null
  encodingChosen?: boolean
  /** Language mode chosen by the user. */
  language?: string | null
  staged?: boolean
  /** Diff tab of a commit (read-only): not saved in the session. */
  commit?: unknown
  /** Diff of an edit proposed by Claude (ephemeral): not saved in the session. */
  proposal?: unknown
  /** Comparison of two files (ephemeral): not saved in the session. */
  compare?: unknown
  /** Comparison of a merge conflict (ephemeral): not saved in the session. */
  mergeCompare?: unknown
}

export interface SessionSource {
  tabs: SessionSourceTab[]
  activeTabId: string | null
  /** Editor groups; they only go into the session when there is more than one. */
  groups?: { id: string; tabIds: string[]; activeTabId: string | null }[]
  activeGroupIndex?: number
  /** Grid of the groups (leaves = ids of `groups`). */
  layout?: LayoutNode<string>
  /** Cursor/scroll of a file tab (`null` = unknown: uses the start). */
  viewOf: (tabId: string) => TabViewState | null
  expanded: Record<string, boolean>
  view: SidebarView
  sidebarVisible: boolean
  sidebarWidth: number
  terminalVisible: boolean
  panelHeight: number
  panelPosition: PanelPosition
  panelWidth: number
  claudeVisible?: boolean
  claudeWidth?: number
  claudeTabs?: SessionClaudeTab[]
  claudeActive?: number
  /** "Reopen Closed Tab" stack (the top at the end), with the group already as an index into `groups`. */
  closedTabs?: SessionClosedTab[]
  breakpoints?: SessionBreakpointFile[]
  watches?: string[]
}

/** The tab as the session keeps it; `null` for those that do not come back (commit diff, Claude proposal). */
export function toSessionTab(t: SessionSourceTab, viewOf: SessionSource['viewOf']): SessionTab | null {
  if (t.commit || t.proposal || t.compare || t.mergeCompare) return null
  if (t.kind === 'diff') return { kind: 'diff', path: t.path, staged: !!t.staged }
  if (t.kind === 'markdownPreview') return { kind: 'markdownPreview', path: t.path }
  if (t.kind === 'image') return { kind: 'image', path: t.path }
  const view = viewOf(t.id)
  return {
    kind: 'file',
    path: t.path,
    preview: !!t.preview,
    cursor: view?.cursor ?? { line: 1, column: 0 },
    topLine: Math.max(1, Math.round(view?.topLine ?? 1)),
    ...(t.encodingChosen && t.encoding && { encoding: t.encoding }),
    ...(t.language && { language: t.language })
  }
}

export function buildSession(source: SessionSource): WorkspaceSession {
  // Commit diffs are not restored: the active tab index only applies to the list the session keeps.
  const persisted = source.tabs.filter((t) => !t.commit && !t.proposal && !t.compare && !t.mergeCompare)
  const tabs: SessionTab[] = persisted.flatMap((t) => toSessionTab(t, source.viewOf) ?? [])
  const indexOf = new Map(persisted.map((t, i) => [t.id, i]))
  const active = persisted.findIndex((t) => t.id === source.activeTabId)
  // Each group as indexes into the persisted list (tabs that do not go into the session are left out).
  const groups = source.groups && source.groups.length > 1 ? source.groups : undefined
  const editorGroups = groups?.map((g) => {
    const indices = g.tabIds.flatMap((id) => indexOf.get(id) ?? [])
    const activeIndex = g.activeTabId === null ? undefined : indexOf.get(g.activeTabId)
    return { tabs: indices, activeIndex: activeIndex ?? indices[0] ?? null }
  })
  const groupIndex = new Map(groups?.map((g, i) => [g.id, i]))
  const layout =
    groups &&
    reconcileLayout(
      source.layout ? mapLayout(source.layout, (id) => groupIndex.get(id) ?? null) : null,
      groups.map((_, i) => i)
    )
  return {
    tabs,
    activeIndex: active >= 0 ? active : null,
    ...(editorGroups && {
      editorGroups,
      activeGroup: Math.min(Math.max(source.activeGroupIndex ?? 0, 0), editorGroups.length - 1),
      ...(layout && { editorLayout: roundLayout(layout) })
    }),
    expanded: Object.keys(source.expanded).filter((dir) => source.expanded[dir]),
    view: source.view,
    sidebarVisible: source.sidebarVisible,
    sidebarWidth: Math.round(source.sidebarWidth),
    terminalVisible: source.terminalVisible,
    panelHeight: Math.round(source.panelHeight),
    panelPosition: source.panelPosition,
    panelWidth: Math.round(source.panelWidth),
    ...(source.claudeVisible !== undefined && { claudeVisible: source.claudeVisible }),
    ...(source.claudeWidth !== undefined && { claudeWidth: Math.round(source.claudeWidth) }),
    ...(source.claudeTabs && { claudeTabs: source.claudeTabs }),
    ...(source.claudeActive !== undefined && { claudeActive: source.claudeActive }),
    ...(source.closedTabs && source.closedTabs.length > 0 && { closedTabs: source.closedTabs }),
    ...(source.breakpoints?.length && { breakpoints: source.breakpoints }),
    ...(source.watches?.length && { watches: source.watches })
  }
}

/** Fractions with 3 decimals: the session does not change bytes on every dragged pixel of invisible difference. */
function roundLayout(node: LayoutNode<number>): LayoutNode<number> {
  if ('group' in node) return node
  return {
    direction: node.direction,
    children: node.children.map(roundLayout),
    sizes: node.sizes.map((s) => Math.round(s * 1000) / 1000)
  }
}

const tabKey = (t: SessionTab): string =>
  t.kind === 'diff'
    ? `diff:${t.staged}:${t.path}`
    : t.kind === 'markdownPreview'
      ? `preview:${t.path}`
      : t.kind === 'image'
        ? `image:${t.path}`
        : `file:${t.path}`

/**
 * Tabs to restore: removes the file ones that no longer exist and the repeats, and repoints the active tab. If the
 * active one is gone, the next remaining one applies (else the previous one). `exists[i]` says whether the file of
 * `tabs[i]` exists (ignored for diffs).
 */
export function planTabs(
  tabs: SessionTab[],
  activeIndex: number | null,
  exists: boolean[]
): { tabs: SessionTab[]; activeIndex: number | null } {
  const plan = planTabsWithMap(tabs, activeIndex, exists)
  return { tabs: plan.tabs, activeIndex: plan.activeIndex }
}

function planTabsWithMap(
  tabs: SessionTab[],
  activeIndex: number | null,
  exists: boolean[]
): { tabs: SessionTab[]; activeIndex: number | null; map: number[] } {
  const kept: SessionTab[] = []
  const indexByKey = new Map<string, number>()
  // Position of each original tab in the final list (-1 = dropped).
  const mapped = tabs.map((t, i) => {
    // The preview also depends on the source file existing.
    if (t.kind !== 'diff' && !exists[i]) return -1
    const key = tabKey(t)
    const seen = indexByKey.get(key)
    if (seen !== undefined) return seen
    kept.push(t)
    indexByKey.set(key, kept.length - 1)
    return kept.length - 1
  })
  if (activeIndex === null || !Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= tabs.length)
    return { tabs: kept, activeIndex: null, map: mapped }
  let active = mapped[activeIndex] ?? -1
  for (let j = activeIndex + 1; active < 0 && j < mapped.length; j++) active = mapped[j] ?? -1
  for (let j = activeIndex - 1; active < 0 && j >= 0; j--) active = mapped[j] ?? -1
  return { tabs: kept, activeIndex: active >= 0 ? active : null, map: mapped }
}

export interface SessionPlan {
  tabs: SessionTab[]
  /** Active tab of the active group. */
  activeIndex: number | null
  groups: SessionGroupsPlan['groups']
  activeGroup: number
  layout: SessionGroupsPlan['layout']
}

/** Tabs and groups to restore: validates the whole session (an old session without groups = a single group). */
export function planSession(session: WorkspaceSession, exists: boolean[]): SessionPlan {
  const plan = planTabsWithMap(session.tabs, session.activeIndex, exists)
  const groups = planSessionGroups(
    Array.isArray(session.editorGroups) ? session.editorGroups : undefined,
    session.activeGroup,
    plan.map,
    plan.tabs.length,
    plan.activeIndex,
    session.editorLayout,
    session.editorSplitRatio
  )
  // The session `activeIndex` is the active tab of the active group; with groups, the one the group says applies.
  const activeIndex = groups.groups[groups.activeGroup]?.activeIndex ?? null
  return {
    tabs: plan.tabs,
    activeIndex,
    groups: groups.groups,
    activeGroup: groups.activeGroup,
    layout: groups.layout
  }
}

/** The minimum of a tab that the merge needs to know whether two are the same. */
export interface MergeableTab {
  id: string
  kind: 'file' | 'diff' | 'markdownPreview' | 'image'
  path: string
  staged?: boolean
  commit?: { hash: string }
}

/** Identity of a tab in the restore: a restored one that repeats an already open one is dropped. */
export function restoredTabKey(t: MergeableTab): string {
  return t.kind === 'diff'
    ? `diff:${t.commit?.hash ?? ''}:${t.staged}:${t.path}`
    : t.kind === 'markdownPreview'
      ? `preview:${t.path}`
      : t.kind === 'image'
        ? `image:${t.path}`
        : `file:${t.path}`
}

export interface MergeRestoredInput<T extends MergeableTab> {
  /** Tabs created from the session, in the order of `plan.tabs` (the groups point at them by position). */
  restored: T[]
  plan: Pick<SessionPlan, 'groups' | 'activeGroup' | 'layout'>
  /** Current state: the user may have opened tabs while the session loaded. */
  current: {
    tabs: T[]
    editorGroups: EditorGroup[]
    activeGroupId: string
    editorLayout: LayoutNode<string>
    activeTabId: string | null
  }
  newId: () => string
}

export interface MergeRestoredResult<T extends MergeableTab> {
  /**
   * Restored ones that repeat an already open tab (whoever created them needs to release what it allocated for them).
   */
  dropped: T[]
  tabs: T[]
  editorGroups: EditorGroup[]
  activeGroupId: string
  editorLayout: LayoutNode<string>
  activeTabId: string | null
}

/**
 * Merges the session tabs and groups into the current state. If nothing was opened in the meantime the session takes
 * over everything; else the user keeps the tabs, the groups and the active tab they already had, and the restored ones
 * go in front of the strip of the first group.
 */
export function mergeRestoredTabs<T extends MergeableTab>(input: MergeRestoredInput<T>): MergeRestoredResult<T> {
  const { restored, plan, current, newId } = input
  const taken = new Set(current.tabs.map(restoredTabKey))
  const kept = restored.filter((t) => !taken.has(restoredTabKey(t)))
  const dropped = restored.filter((t) => taken.has(restoredTabKey(t)))
  const keptIds = new Set(kept.map((t) => t.id))
  const sessionGroups: EditorGroup[] = plan.groups.map((g, i) => ({
    id: (i === 0 ? current.editorGroups[0]?.id : undefined) ?? newId(),
    tabIds: g.tabs.flatMap((n) => {
      const id = restored[n]?.id
      return id !== undefined && keptIds.has(id) ? [id] : []
    }),
    activeTabId: g.activeIndex === null ? null : (restored[g.activeIndex]?.id ?? null)
  }))
  for (const g of sessionGroups)
    if (g.activeTabId && !g.tabIds.includes(g.activeTabId)) g.activeTabId = g.tabIds[0] ?? null

  const untouched = current.tabs.length === 0
  const sessionIds = sessionGroups.map((g) => g.id)
  const fromSession = dropEmptyGroups({
    groups: sessionGroups,
    activeGroupId: (sessionGroups[plan.activeGroup] ?? sessionGroups[0])?.id ?? newId(),
    layout: reconcileLayout(
      mapLayout(plan.layout, (i) => sessionIds[i] ?? null),
      sessionIds
    )
  })
  const editorGroups = untouched
    ? fromSession.groups
    : current.editorGroups.map((g, i) => (i === 0 ? { ...g, tabIds: [...kept.map((t) => t.id), ...g.tabIds] } : g))
  const activeGroupId = untouched ? fromSession.activeGroupId : current.activeGroupId
  const activeId = editorGroups.find((g) => g.id === activeGroupId)?.activeTabId ?? null
  return {
    dropped,
    tabs: [...kept, ...current.tabs],
    editorGroups,
    activeGroupId,
    editorLayout: untouched ? fromSession.layout : current.editorLayout,
    activeTabId: untouched ? activeId : current.activeTabId
  }
}

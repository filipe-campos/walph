// Closed tabs stack ("Reopen Closed Tab"): what was closed, in which group and at which position of the strip. Pure;
// the
// store keeps the stack (`closedTabs`) and the session persists it.
import type { SessionTab } from '@shared/types'
import type { GroupsState } from './editorGroups'
import { toSessionTab, type SessionSource, type SessionSourceTab } from './session'

export interface ClosedTab {
  /** The tab as the session keeps it (file with cursor and scroll, diff, preview, image). */
  tab: SessionTab
  /** Group it left (`null` = unknown, e.g. a session with groups that no longer exist). */
  groupId: string | null
  /** Position in the group's tab strip. */
  index: number
}

export const CLOSED_TABS_LIMIT = 20

/** Where each tab was, for those that left a group between `before` and `after` (closing tabs, closing a group). */
export function removedPlacements(
  before: GroupsState,
  after: GroupsState
): Array<{ tabId: string; groupId: string; index: number }> {
  const placements: Array<{ tabId: string; groupId: string; index: number }> = []
  for (const group of before.groups) {
    const kept = new Set(after.groups.find((g) => g.id === group.id)?.tabIds ?? [])
    group.tabIds.forEach((tabId, index) => {
      if (!kept.has(tabId)) placements.push({ tabId, groupId: group.id, index })
    })
  }
  return placements
}

/** Tab key: two entries with the same key in the same group are the same tab. */
function sessionTabKey(tab: SessionTab): string {
  return tab.kind === 'diff' ? `diff:${tab.staged}:${tab.path}` : `${tab.kind}:${tab.path}`
}

/**
 * Pushes a batch closed at once (the top is the end of the list). Within the batch the lowest position goes on top:
 * reopening in sequence returns each tab to its place. The same tab closed again in the same group replaces the old
 * entry.
 */
export function pushClosedTabs(
  stack: readonly ClosedTab[],
  batch: readonly ClosedTab[],
  limit: number = CLOSED_TABS_LIMIT
): ClosedTab[] {
  if (batch.length === 0) return [...stack]
  const ordered = [...batch].sort((a, b) => b.index - a.index)
  const same = (a: ClosedTab, b: ClosedTab): boolean =>
    a.groupId === b.groupId && sessionTabKey(a.tab) === sessionTabKey(b.tab)
  const kept = stack.filter((entry) => !ordered.some((closed) => same(entry, closed)))
  return [...kept, ...ordered].slice(-limit)
}

/**
 * Stack entries for what leaves the groups between `before` and `after`. Read before the commit: the cursor and scroll
 * (`viewOf`) are still the editor's. Tabs the session does not keep (commit diff, Claude proposal) are left out.
 */
export function closedTabsFor(
  before: GroupsState,
  after: GroupsState,
  tabs: readonly SessionSourceTab[],
  viewOf: SessionSource['viewOf']
): ClosedTab[] {
  const byId = new Map(tabs.map((t) => [t.id, t]))
  return removedPlacements(before, after).flatMap(({ tabId, groupId, index }) => {
    const source = byId.get(tabId)
    const tab = source ? toSessionTab(source, viewOf) : null
    return tab ? [{ tab: tab.kind === 'file' ? { ...tab, preview: false } : tab, groupId, index }] : []
  })
}

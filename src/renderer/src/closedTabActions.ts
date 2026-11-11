// "Reopen Closed Tab" (⇧⌘T): pops `closedTabs` and puts the tab back in the group and position it left.
import { activeGroup, findGroup, showTab } from './lib/editorGroups'
import type { ClosedTab } from './lib/closedTabs'
import { restoredTabKey } from './lib/session'
import { commitGroups, get, groupsState, set } from './store'
import { markRecentFile } from './recentActions'
import { tabFromSession } from './tabActions'

const api = window.api

const keyOf = (entry: ClosedTab): string => restoredTabKey({ id: '', ...entry.tab })

/**
 * Reopens the tab at the top of the stack. Skips the ones that cannot be brought back (deleted file, tab already open
 * in that group), like VS Code, so that repeating the shortcut always moves forward.
 */
export async function reopenClosedTab(): Promise<void> {
  for (;;) {
    const entry = get().closedTabs.at(-1)
    if (!entry) return
    set((s) => ({ closedTabs: s.closedTabs.filter((e) => e !== entry) }))
    if (await reopen(entry)) return
  }
}

async function reopen(entry: ClosedTab): Promise<boolean> {
  const key = keyOf(entry)
  const findOpen = (): string | undefined => get().tabs.find((t) => restoredTabKey(t) === key)?.id
  // A diff does not depend on the file existing (it may show a deletion); the others do.
  if (!findOpen() && entry.tab.kind !== 'diff' && !(await api.fs.exists(entry.tab.path).catch(() => false)))
    return false
  // The existence check is async: groups and tabs are read again after it.
  const groups = groupsState()
  const group = (entry.groupId ? findGroup(groups, entry.groupId) : undefined) ?? activeGroup(groups)
  const openId = findOpen()
  if (openId && group.tabIds.includes(openId)) return false
  const { tabs } = get()
  const tab = openId === undefined ? tabFromSession(entry.tab, false) : undefined
  const id = openId ?? tab?.id
  if (id === undefined) return false
  commitGroups(
    showTab(groups, id, { groupId: group.id, index: entry.index }),
    { panelMaximized: false, screen: 'workbench' },
    tab ? [...tabs, tab] : tabs
  )
  if (entry.tab.kind === 'file' || entry.tab.kind === 'image') markRecentFile(entry.tab.path)
  return true
}

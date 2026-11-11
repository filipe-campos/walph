import { createGroups } from '../lib/editorGroups'
import type { TabsState } from '../types/tabs'

export function scopedTabsState(): Omit<TabsState, 'confirmingSave'> {
  const { groups, activeGroupId, layout } = createGroups(crypto.randomUUID())
  return {
    fileRevs: {},
    tabs: [],
    editorGroups: groups,
    activeGroupId,
    editorLayout: layout,
    activeTabId: null,
    reveal: null,
    cursor: null,
    compareSelection: null,
    closedTabs: []
  }
}

export function globalTabsState(): Pick<TabsState, 'confirmingSave'> {
  return { confirmingSave: false }
}

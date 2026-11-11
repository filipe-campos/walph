/** Active tab of a state with `tabs` and `activeTabId`; returns the same list reference (safe in selectors). */
export function findActiveTab<T extends { id: string }>(s: {
  tabs: readonly T[]
  activeTabId: string | null
}): T | undefined {
  return s.tabs.find((t) => t.id === s.activeTabId)
}

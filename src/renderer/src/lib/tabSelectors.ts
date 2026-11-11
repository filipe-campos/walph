import type { Tab, TabsState } from '../types/tabs'

/** Tab by id (returns the list reference, stable in selectors). */
export function selectTab(id: string | null | undefined): (s: Pick<TabsState, 'tabs'>) => Tab | undefined {
  return (s) => (id == null ? undefined : s.tabs.find((t) => t.id === id))
}

/**
 * Diff tab that is not of the working tree (commit, Claude proposal, comparison): the path does not follow
 * rename/remove.
 */
export const isForeignDiff = (t: Tab): boolean => t.kind === 'diff' && !!(t.commit ?? t.proposal ?? t.compare)

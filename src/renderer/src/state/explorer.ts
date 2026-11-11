import { loadRecentFiles } from '../lib/recentFiles'
import { createSearchState } from '../lib/searchResults'
import type { ExplorerState } from '../types/explorer'

export function scopedExplorerState(root: string | null): Omit<ExplorerState, 'recentFolders'> {
  return {
    dirs: {},
    expanded: root ? { [root]: true } : {},
    explorerEdit: null,
    explorerDrag: [],
    explorerSelected: null,
    explorerSelection: [],
    explorerAnchor: null,
    explorerClipboard: null,
    search: createSearchState(),
    recentFiles: root ? loadRecentFiles(root) : []
  }
}

export function globalExplorerState(): Pick<ExplorerState, 'recentFolders'> {
  return { recentFolders: [] }
}

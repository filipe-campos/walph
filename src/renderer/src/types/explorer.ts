import type { DirEntry, RecentFolder } from '@shared/types'
import type { SearchState } from '../lib/searchResults'

export type ExplorerEdit = { mode: 'newFile' | 'newFolder'; dir: string } | { mode: 'rename'; path: string }

export interface ExplorerState {
  dirs: Record<string, DirEntry[]>
  expanded: Record<string, boolean>
  explorerEdit: ExplorerEdit | null
  /** Paths being dragged in the explorer: `getData` only works on drop and the highlight validates during dragover. */
  explorerDrag: string[]
  /** Row with the explorer focus (paste target, tab stop and keyboard cursor); usually in `explorerSelection`. */
  explorerSelected: string | null
  /** Selected rows (selection order); copy, cut, delete, duplicate and drag act on all of them. */
  explorerSelection: string[]
  /** Start of the Shift+click / Shift+arrow range. */
  explorerAnchor: string | null
  /** Explorer copy/cut; `cut` only moves on paste. */
  explorerClipboard: { paths: string[]; mode: 'copy' | 'cut' } | null
  /** Files recently opened in the current folder (absolute paths, most recent first). */
  recentFiles: string[]
  /** Recently opened folders (shared between windows; comes from main), most recent first. */
  recentFolders: RecentFolder[]
  /** Global search (query, options, result…): lives in the store to survive view switches and serve F4. */
  search: SearchState
}

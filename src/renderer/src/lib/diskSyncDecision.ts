export type DiskSyncDecision = 'skip' | 'clear-conflict' | 'adopt-format' | 'mark-conflict' | 'reload'

/**
 * What to do with a tab after re-reading the disk. `same` = disk text equal to the saved base (`null` = tab never
 * loaded in the editor); `dirty` = the tab has unsaved edits (or an EOL change).
 */
export function decideDiskSync(same: boolean | null, dirty: boolean): DiskSyncDecision {
  if (same === null) return 'skip'
  if (same) return dirty ? 'clear-conflict' : 'adopt-format'
  return dirty ? 'mark-conflict' : 'reload'
}

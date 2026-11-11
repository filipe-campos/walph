import type { FileChange } from '@shared/types'

/** `true` if the path is inside `.git` (or is the folder itself): that only matters to the Git panel. */
export function isInsideGit(path: string): boolean {
  return /(^|[\\/])\.git([\\/]|$)/.test(path)
}

/**
 * Appends to the batch consolidating by path: only the last event of each file stays, in the order of the most recent
 * occurrence (remove and reinsert), so a large checkout does not produce thousands of repeated entries.
 */
export function pushFileChange(batch: Map<string, FileChange>, change: FileChange): void {
  batch.delete(change.path)
  batch.set(change.path, change)
}

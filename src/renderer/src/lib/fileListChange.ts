import type { FileChange } from '@shared/types'

// The same files that make main drop the rg list: changing their content changes what is listed.
const IGNORE_FILES = new Set(['.gitignore', '.ignore', '.rgignore'])

/** Watcher event that makes the project file list stale: creation/removal or an edit of an ignore file. */
export function changesFileList(change: FileChange): boolean {
  if (change.type !== 'change') return true
  return IGNORE_FILES.has(change.path.slice(change.path.search(/[^\\/]*$/)))
}

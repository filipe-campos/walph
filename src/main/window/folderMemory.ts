import { samePath } from '@shared/pathCompare'

/**
 * Memory of the folder list of a window ("Open all" on the welcome screen). Removals never change it: closing the
 * tabs one by one ([A,B,C] → [C]) cannot shrink the list. Only when the window gains a folder the memory does not
 * have does the memory become the current list.
 */
export function nextRememberedFolders(previous: readonly string[] | undefined, current: readonly string[]): string[] {
  if (current.length === 0) return [...(previous ?? [])]
  if (!previous) return [...current]
  const gained = current.some((root) => !previous.some((other) => samePath(other, root)))
  return gained ? [...current] : [...previous]
}

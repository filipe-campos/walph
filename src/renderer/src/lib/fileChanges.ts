// Interpretation of the watcher event batch for an open tab.
import type { FileChange } from '@shared/types'
import { isInside } from './path'

/**
 * Last event of the batch that affects `path`. `add`/`change` only concern the file itself; `unlink` also applies
 * to a removed folder that contains it. `null` if nothing in the batch affects it.
 */
export function lastChangeFor(path: string, files: readonly FileChange[]): FileChange['type'] | null {
  let last: FileChange['type'] | null = null
  for (const change of files) {
    const touches = change.type === 'unlink' ? isInside(change.path, path) : change.path === path
    if (touches) last = change.type
  }
  return last
}

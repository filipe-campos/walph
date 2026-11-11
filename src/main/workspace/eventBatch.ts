import { dirname, sep } from 'node:path'
import { pathTail } from '@shared/pathCompare'
import type { FileChange } from '@shared/types'
import { isAtomicTempPath } from '../fs/atomicWrite'
import { isInsideGit, pushFileChange } from './fileChanges'

/** @parcel/watcher event types (does not distinguish file from folder). */
export type RawKind = 'create' | 'update' | 'delete'
export type EntryKind = 'file' | 'dir' | null

/**
 * Adds an event to the batch by path. `create` followed by `update` stays `create` (the file is still new to the
 * renderer); everything else keeps the last event.
 */
export function mergeRawEvent(batch: Map<string, RawKind>, kind: RawKind, path: string): void {
  const prev = batch.get(path)
  batch.delete(path)
  batch.set(path, prev === 'create' && kind === 'update' ? 'create' : kind)
}

/**
 * Replaces the `realRoot` prefix (what the native watcher returns: on macOS `/tmp` becomes `/private/tmp`) with `root`
 * in the spelling of the window folder, the only one the renderer knows. Outside the prefix, returns the path as is.
 */
export function toRootSpelling(path: string, realRoot: string, root: string): string {
  if (realRoot === root) return path
  if (path === realRoot) return root
  if (path.startsWith(realRoot + sep)) return root + path.slice(realRoot.length)
  return path
}

/** Path relative to the root with `/`, for the globs. Outside the root → `null`. */
export function relativeSlash(root: string, path: string): string | null {
  const tail = pathTail(root, path, { strict: true })
  return tail ? tail.join('/') : null
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = items.values()
  const worker = async (): Promise<void> => {
    for (const item of queue) await fn(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Converts the batch into the `{ dirs, files }` of `WorkspaceChange`. `statKind` tells whether an existing path is a
 * file or a folder (the native watcher does not). A created/changed folder only marks the parent for the explorer; a
 * removal becomes `unlink` (file or folder, as before). Events inside `.git` produce neither `dirs` nor `files` (the
 * empty batch still notifies the Git panel).
 */
export async function classifyBatch(
  batch: ReadonlyMap<string, RawKind>,
  statKind: (path: string) => Promise<EntryKind>,
  concurrency = 32
): Promise<{ dirs: string[]; files: FileChange[] }> {
  const dirs = new Set<string>()
  const changes = new Map<string, FileChange | null>()
  // The atomic save temporaries (created and renamed within ms) never reach the explorer nor the LSP servers.
  const entries = [...batch].filter(([path]) => !isInsideGit(path) && !isAtomicTempPath(path))
  for (const [path] of entries) dirs.add(dirname(path))

  await mapLimit(entries, concurrency, async ([path, kind]) => {
    if (kind === 'delete') {
      changes.set(path, { path, type: 'unlink' })
      return
    }
    const entry = await statKind(path)
    if (entry === 'file') changes.set(path, { path, type: kind === 'create' ? 'add' : 'change' })
    else changes.set(path, null)
  })

  // Reinserts in batch order (the promises finish out of order).
  const files = new Map<string, FileChange>()
  for (const [path] of entries) {
    const change = changes.get(path)
    if (change) pushFileChange(files, change)
  }
  return { dirs: [...dirs], files: [...files.values()] }
}

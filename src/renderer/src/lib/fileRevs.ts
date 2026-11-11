import type { FileChange } from '@shared/types'
import type { Tab } from '../types/tabs'

type RevTabLike = {
  kind: Tab['kind']
  path?: string
  commit?: unknown
  proposal?: unknown
  compare?: { left: { path: string }; right: { path: string } }
}

/**
 * Paths the tab re-reads when the watcher touches them (working tree diff, comparison, image, preview); empty = the
 * content does not come from the disk.
 */
function watchedPaths(t: RevTabLike): string[] {
  if (t.kind === 'diff') {
    if (t.compare) return [t.compare.left.path, t.compare.right.path]
    return !t.commit && !t.proposal && t.path !== undefined ? [t.path] : []
  }
  return (t.kind === 'image' || t.kind === 'markdownPreview') && t.path !== undefined ? [t.path] : []
}

/**
 * Next revision map by path of the tabs that re-read the disk (`files` = watcher batch; `null` = re-evaluate all).
 * Only the paths of open tabs stay in the map (closing the tab prunes it on the next batch). `null` = nothing changed.
 */
export function nextFileRevs(
  tabs: readonly RevTabLike[],
  current: Readonly<Record<string, number>>,
  files: readonly FileChange[] | null
): Record<string, number> | null {
  const paths = new Set<string>()
  for (const t of tabs) for (const p of watchedPaths(t)) paths.add(p)
  const touched = files ? new Set(files.map((f) => f.path)) : null
  const next: Record<string, number> = {}
  let changed = Object.keys(current).some((p) => !paths.has(p))
  for (const p of paths) next[p] = current[p] ?? 0
  for (const p of paths) {
    if (touched && !touched.has(p)) continue
    next[p] = (next[p] ?? 0) + 1
    changed = true
  }
  return changed ? next : null
}

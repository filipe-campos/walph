// List of the recent folders picker: fuzzy filter over the whole path, without the already open folder.
import type { RecentFolder } from '@shared/types'
import { rankByLabel } from './rankByLabel'
import { basename, samePath } from './path'

export interface RecentFolderMatch {
  path: string
  /** Last path segment. */
  name: string
  /** Offset of `name` inside `path` (to highlight the hits). */
  nameStart: number
  /** Indexes of `path` that matched the query. */
  matches: number[]
  score: number
}

export function rankRecentFolders(
  query: string,
  folders: readonly RecentFolder[],
  current: string | null,
  platform: string
): RecentFolderMatch[] {
  const candidates = folders.filter(({ path }) => current === null || !samePath(path, current, platform))
  // Without a query keeps the order (most recent first); with a query, the best match first.
  const ranked: RecentFolderMatch[] = rankByLabel(candidates, query, (f) => f.path, { sort: true }).map(
    ({ entry: { path }, matches, score }) => {
      const name = basename(path)
      return { path, name, nameStart: path.length - name.length, matches, score }
    }
  )
  return ranked
}

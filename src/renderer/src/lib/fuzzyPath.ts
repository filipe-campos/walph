// Path ranking for Quick Open, on top of `fuzzyMatch`: the file name weighs more than the folders.
import { fuzzyMatch } from './fuzzy'

/** Added when matching inside the file name: above any typical difference between matches only in the path. */
const BASENAME_BONUS = 100

export interface PathMatch {
  score: number
  /** Indexes in `path` (full relative path) of the matched letters. */
  matches: number[]
}

export interface RankedPath extends PathMatch {
  path: string
}

/** `path` uses `/` (as it comes from main). Spaces and `\` typed in the query are normalized. */
export function matchPath(query: string, path: string): PathMatch | null {
  const q = query.replace(/\s+/g, '').replace(/\\/g, '/')
  if (!q) return { score: 0, matches: [] }

  // A query with `/` targets the whole path; without `/`, tries the name first (the path is only tested if the name
  // fails,
  // which also saves the cost of matching the whole path for most files).
  if (!q.includes('/')) {
    const nameStart = path.lastIndexOf('/') + 1
    const result = fuzzyMatch(q, nameStart ? path.slice(nameStart) : path)
    if (result) {
      return {
        score: result.score + BASENAME_BONUS,
        matches: nameStart ? result.matches.map((i) => i + nameStart) : result.matches
      }
    }
  }
  return fuzzyMatch(q, path)
}

/** Best `limit` paths: highest score, then shorter path, then alphabetical order. */
export function rankPaths(query: string, paths: readonly string[], limit: number): RankedPath[] {
  const ranked: RankedPath[] = []
  for (const path of paths) {
    const result = matchPath(query, path)
    if (result) ranked.push({ path, ...result })
  }
  ranked.sort(
    (a, b) => b.score - a.score || a.path.length - b.path.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  )
  return ranked.length > limit ? ranked.slice(0, limit) : ranked
}

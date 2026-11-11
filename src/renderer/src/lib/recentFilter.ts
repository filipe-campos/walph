import type { RecentFolder } from '@shared/types'
import { basename } from './path'

/** Filters the recent ones by name, path or branch (each query term needs to appear; case-insensitive). */
export function filterRecents(folders: readonly RecentFolder[], query: string): RecentFolder[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...folders]
  return folders.filter((f) => {
    const hay = `${basename(f.path)}\n${f.path}\n${f.branch ?? ''}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

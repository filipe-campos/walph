// Files ignored by git in the explorer: main sends absolute paths (collapsed folders, e.g. `node_modules`);
// a row is ignored if the path itself or some ancestor (up to the root, exclusive) is in the set.
import { dirname, pathKey } from './path'

export type IgnoredSet = ReadonlySet<string>

export function buildIgnoredSet(ignored: readonly string[] | undefined, platform: string): IgnoredSet {
  return new Set((ignored ?? []).map((p) => pathKey(p, platform)))
}

export function isGitIgnored(set: IgnoredSet, path: string, root: string, platform: string): boolean {
  if (set.size === 0) return false
  const rootKey = pathKey(root, platform)
  let current = path
  for (;;) {
    const key = pathKey(current, platform)
    // The root is never ignored (and nothing above it counts).
    if (key === rootKey) return false
    if (set.has(key)) return true
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
}

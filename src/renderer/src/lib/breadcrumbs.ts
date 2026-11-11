// Path segments of the breadcrumbs: folders from the workspace root down to the file. Pure.
import { basename, dirname, isInside, relativeTo, sepOf } from './path'

export interface PathSegment {
  name: string
  path: string
  /** Folder that contains the segment (where the menu siblings come from). */
  parent: string
}

/**
 * Outside the workspace folder (or without a folder) only the file name shows, with its folder as the siblings' source.
 */
export function pathSegments(root: string | null, path: string): PathSegment[] {
  if (!root || path === root || !isInside(root, path)) return [{ name: basename(path), path, parent: dirname(path) }]
  const sep = sepOf(root)
  let parent = root
  return relativeTo(root, path)
    .split(/[\\/]/)
    .filter(Boolean)
    .map((name) => {
      const full = parent.endsWith(sep) ? parent + name : parent + sep + name
      const segment = { name, path: full, parent }
      parent = full
      return segment
    })
}

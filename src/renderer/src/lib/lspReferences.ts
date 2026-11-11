// List of locations (references, multiple definitions) for the panel: groups by file and trims the preview line.
import type { LspLocation } from '@shared/types'
import { rangeToReveal } from '@shared/lspPosition'
import { basename, dirname, relativeTo } from './path'

export interface ReferenceItem {
  path: string
  /** 1-based. */
  line: number
  /** 0-based, UTF-16. */
  column: number
  length: number
  /** Line text (already without indentation and capped); empty if the file could not be read. */
  preview: string
  /** Start of the matched span inside `preview`, and its length. */
  matchFrom: number
  matchTo: number
}

export interface ReferenceGroup {
  path: string
  name: string
  /** Folder relative to the root (empty for files at the root). */
  dir: string
  items: ReferenceItem[]
}

const PREVIEW_MAX = 200

/**
 * Preview of the line for the list: strips the indentation, caps the size keeping the matched span visible and adjusts
 * the highlighted range. `column`/`length` apply to the whole `lineText`.
 */
export function makePreview(
  lineText: string,
  column: number,
  length: number
): Pick<ReferenceItem, 'preview' | 'matchFrom' | 'matchTo'> {
  const indent = lineText.length - lineText.trimStart().length
  let text = lineText.slice(indent).trimEnd()
  let from = Math.max(column - indent, 0)
  let to = Math.min(from + Math.max(length, 0), text.length)
  from = Math.min(from, text.length)
  if (text.length > PREVIEW_MAX) {
    // Window of PREVIEW_MAX characters that contains the start of the span.
    const start = Math.max(Math.min(from - 40, text.length - PREVIEW_MAX), 0)
    text = text.slice(start, start + PREVIEW_MAX)
    from = Math.max(from - start, 0)
    to = Math.min(Math.max(to - start, from), text.length)
  }
  return { preview: text, matchFrom: from, matchTo: to }
}

export function locationToItem(location: LspLocation, lineText: string | undefined): ReferenceItem {
  const { line, column, length } = rangeToReveal(location.range)
  const preview =
    lineText === undefined ? { preview: '', matchFrom: 0, matchTo: 0 } : makePreview(lineText, column, length)
  return { path: location.path, line, column, length, ...preview }
}

/** Groups sorted by relative path, with the items by position. */
export function buildReferenceGroups(items: ReferenceItem[], root: string | null): ReferenceGroup[] {
  const byPath = new Map<string, ReferenceItem[]>()
  for (const item of items) {
    const list = byPath.get(item.path)
    if (list) list.push(item)
    else byPath.set(item.path, [item])
  }
  const groups: (ReferenceGroup & { key: string })[] = []
  for (const [path, list] of byPath) {
    const relative = root ? relativeTo(root, path) : path
    const dir = dirname(relative)
    groups.push({
      key: relative,
      path,
      name: basename(path),
      dir: relative === basename(path) || dir === relative || dir === '/' ? '' : dir,
      items: [...list].sort((a, b) => a.line - b.line || a.column - b.column)
    })
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key)).map(({ key: _key, ...group }) => group)
}

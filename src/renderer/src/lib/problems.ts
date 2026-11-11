// Pure logic of the "Problems" panel and of the status bar counters.
import type { Diagnostic, DiagnosticSeverity } from '@shared/types'
import { basename, dirname, relativeTo } from './path'

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2, hint: 3 }

/** Hints (`hint`) only show in the editor, as in VS Code: they go neither in the list nor in the counters. */
function isProblem(diagnostic: Diagnostic): boolean {
  return diagnostic.severity !== 'hint'
}

/** Error before warning before information; within the same severity, by position in the file. */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.range.start.line - b.range.start.line ||
    a.range.start.character - b.range.start.character ||
    a.range.end.line - b.range.end.line ||
    a.range.end.character - b.range.end.character
  )
}

export interface ProblemGroup {
  path: string
  /** File name. */
  name: string
  /** Folder relative to the window root (empty for files at the root). */
  dir: string
  items: Diagnostic[]
  errors: number
  warnings: number
}

// The counters run in store selectors (on every `set`, including the cursor one): memoized by the map reference,
// which only changes when a diagnostic is published.
const countsCache = new WeakMap<object, { errors: number; warnings: number }>()
const listedCache = new WeakMap<object, number>()

export function countProblems(byPath: Record<string, Diagnostic[]>): { errors: number; warnings: number } {
  const cached = countsCache.get(byPath)
  if (cached) return cached
  const counts = computeCounts(byPath)
  countsCache.set(byPath, counts)
  return counts
}

function computeCounts(byPath: Record<string, Diagnostic[]>): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const list of Object.values(byPath))
    for (const d of list) {
      if (d.severity === 'error') errors++
      else if (d.severity === 'warning') warnings++
    }
  return { errors, warnings }
}

/** Total items of the problems list (errors, warnings and infos; no hints): the tab counter. */
export function countListed(byPath: Record<string, Diagnostic[]>): number {
  const cached = listedCache.get(byPath)
  if (cached !== undefined) return cached
  let total = 0
  for (const list of Object.values(byPath)) total += list.filter(isProblem).length
  listedCache.set(byPath, total)
  return total
}

/** Groups by file (sorted by relative path), each with its sorted problems. Files without problems disappear. */
export function buildProblemGroups(byPath: Record<string, Diagnostic[]>, root: string | null): ProblemGroup[] {
  const groups: ProblemGroup[] = []
  for (const [path, list] of Object.entries(byPath)) {
    const items = list.filter(isProblem).sort(compareDiagnostics)
    if (items.length === 0) continue
    const relative = root ? relativeTo(root, path) : path
    const dir = dirname(relative)
    groups.push({
      path,
      name: basename(path),
      dir: relative === basename(path) || dir === relative || dir === '/' ? '' : dir,
      items,
      errors: items.filter((d) => d.severity === 'error').length,
      warnings: items.filter((d) => d.severity === 'warning').length
    })
  }
  return groups.sort((a, b) => relativeKey(a, root).localeCompare(relativeKey(b, root)))
}

function relativeKey(group: ProblemGroup, root: string | null): string {
  return root ? relativeTo(root, group.path) : group.path
}

/** "ts(2322)", "ts" or "2322": the diagnostic source to show next to the message. */
export function formatDiagnosticSource(d: Pick<Diagnostic, 'source' | 'code'>): string {
  const hasCode = d.code !== undefined && d.code !== ''
  if (d.source && hasCode) return `${d.source}(${d.code})`
  if (d.source) return d.source
  return hasCode ? String(d.code) : ''
}

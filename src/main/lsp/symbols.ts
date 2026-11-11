import { isNonEmptyString, isRecord } from '@shared/guards'
import type { LspDocumentSymbol, LspLocation, LspPosition, LspRange, LspSymbol } from '@shared/types'
import { normalizeLocation, type Canon } from './locations'
import { asRange } from './shape'
import { isInside } from '@shared/pathCompare'

const DOCUMENT_SYMBOL_LIMIT = 5000
export const WORKSPACE_SYMBOL_LIMIT = 500

const validKind = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 26

function base(raw: Record<string, unknown>): Pick<LspSymbol, 'name' | 'kind' | 'detail'> | null {
  if (typeof raw.name !== 'string' || raw.name === '' || !validKind(raw.kind)) return null
  return {
    name: raw.name,
    kind: raw.kind,
    ...(isNonEmptyString(raw.detail) ? { detail: raw.detail } : {})
  }
}

const comparePosition = (a: LspPosition, b: LspPosition): number => a.line - b.line || a.character - b.character
const byStart = (a: LspDocumentSymbol, b: LspDocumentSymbol): number => comparePosition(a.range.start, b.range.start)

/** `inner` is inside `outer` (edges inclusive). */
const contains = (outer: LspRange, inner: LspRange): boolean =>
  comparePosition(outer.start, inner.start) <= 0 && comparePosition(inner.end, outer.end) <= 0

/**
 * `DocumentSymbol[]` (tree) or `SymbolInformation[]` (flat) → tree with the children in document order (the server
 * may send them in alphabetical order). The flat list becomes a tree by range containment.
 */
export function normalizeDocumentSymbols(raw: unknown): LspDocumentSymbol[] {
  if (!Array.isArray(raw)) return []
  let count = 0
  const flat: LspDocumentSymbol[] = []
  const visit = (nodes: unknown[], depth: number): LspDocumentSymbol[] => {
    const result: LspDocumentSymbol[] = []
    for (const node of nodes) {
      if (count >= DOCUMENT_SYMBOL_LIMIT) break
      if (!isRecord(node)) continue
      const head = base(node)
      if (!head) continue
      if (isRecord(node.location)) {
        // SymbolInformation
        const range = asRange(node.location.range)
        if (!range) continue
        count++
        flat.push({ ...head, range, selectionRange: range, children: [] })
        continue
      }
      const range = asRange(node.range) ?? asRange(node.selectionRange)
      const selectionRange = asRange(node.selectionRange) ?? range
      if (!range || !selectionRange) continue
      count++
      // Limited depth: server output is untrusted (cycles do not exist in JSON, but huge trees do).
      const children = Array.isArray(node.children) && depth < 32 ? visit(node.children, depth + 1) : []
      result.push({ ...head, range, selectionRange, children })
    }
    return result.sort(byStart)
  }
  const tree = visit(raw, 0)
  return flat.length > 0 ? [...tree, ...nestByRange(flat)].sort(byStart) : tree
}

/** Flat list → tree: each symbol becomes a child of the last open one that contains it (larger first at same start). */
function nestByRange(symbols: LspDocumentSymbol[]): LspDocumentSymbol[] {
  const sorted = [...symbols].sort((a, b) => byStart(a, b) || comparePosition(b.range.end, a.range.end))
  const roots: LspDocumentSymbol[] = []
  const stack: LspDocumentSymbol[] = []
  for (const symbol of sorted) {
    let parent = stack.at(-1)
    while (parent && !contains(parent.range, symbol.range)) {
      stack.pop()
      parent = stack.at(-1)
    }
    if (parent) parent.children.push(symbol)
    else roots.push(symbol)
    stack.push(symbol)
  }
  return roots
}

/**
 * `SymbolInformation[]` | `WorkspaceSymbol[]` → at most `limit` symbols inside `root`. A `WorkspaceSymbol` whose
 * `location` has only a URI (no range) is dropped: the client does not declare `resolveSupport`, so servers that
 * respect that send the range; resolving symbol by symbol would cost one round trip per item.
 */
export function normalizeWorkspaceSymbols(
  raw: unknown,
  root: string,
  limit: number = WORKSPACE_SYMBOL_LIMIT,
  platform: string = process.platform,
  canon: Canon = (p) => p
): LspSymbol[] {
  if (!Array.isArray(raw)) return []
  const result: LspSymbol[] = []
  for (const node of raw) {
    if (result.length >= limit) break
    if (!isRecord(node)) continue
    const head = base(node)
    const location: LspLocation | null = head ? normalizeLocation(node.location, platform, canon) : null
    if (!head || !location || !isInside(root, location.path, { platform })) continue
    result.push({
      ...head,
      ...(isNonEmptyString(node.containerName) ? { containerName: node.containerName } : {}),
      location
    })
  }
  return result
}

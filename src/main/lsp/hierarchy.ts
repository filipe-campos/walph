import { flattenControl } from '@shared/controlChars'
import { isNonEmptyString, isRecord } from '@shared/guards'
import type { LspHierarchyDirection, LspHierarchyItem, LspHierarchyKind, LspRange } from '@shared/types'
import type { Canon } from './locations'
import { asRange } from './shape'
import { uriToPath } from './uri'

const ITEM_LIMIT = 1000
const PREPARE_LIMIT = 100
const RANGE_LIMIT = 200
const TEXT_MAX = 500
/** Raw items stored per manager: expanding the whole tree of a large project cannot grow without bound. */
const STORE_LIMIT = 10_000

type HierarchyItemShape = Omit<LspHierarchyItem, 'id'>

/** Normalized item and the raw one (with the server's `data`), which goes back to the server to request neighbors. */
export interface RawHierarchyItem {
  raw: Record<string, unknown>
  item: HierarchyItemShape
}

export interface RawHierarchyEdge extends RawHierarchyItem {
  ranges: LspRange[]
}

export const hierarchyKindOf = (direction: LspHierarchyDirection): LspHierarchyKind =>
  direction === 'incoming' || direction === 'outgoing' ? 'call' : 'type'

export const HIERARCHY_METHODS = {
  incoming: 'callHierarchy/incomingCalls',
  outgoing: 'callHierarchy/outgoingCalls',
  supertypes: 'typeHierarchy/supertypes',
  subtypes: 'typeHierarchy/subtypes'
} as const satisfies Record<LspHierarchyDirection, string>

const validKind = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 26

const text = (v: string): string => flattenControl(v).trim().slice(0, TEXT_MAX)

/** `CallHierarchyItem`/`TypeHierarchyItem` (same shape); `null` if malformed or outside `file://`. */
export function normalizeHierarchyItem(
  raw: unknown,
  kind: LspHierarchyKind,
  platform: string = process.platform,
  canon: Canon = (p) => p
): RawHierarchyItem | null {
  if (!isRecord(raw) || typeof raw.uri !== 'string' || typeof raw.name !== 'string') return null
  const name = text(raw.name)
  const range = asRange(raw.range)
  const path = uriToPath(raw.uri, platform)
  if (!name || !range || !path) return null
  const detail = isNonEmptyString(raw.detail) ? text(raw.detail) : ''
  return {
    raw,
    item: {
      kind,
      name,
      // An unknown kind does not drop the item: the renderer uses the generic icon.
      symbolKind: validKind(raw.kind) ? raw.kind : 0,
      ...(detail ? { detail } : {}),
      path: canon(path),
      range,
      selectionRange: asRange(raw.selectionRange) ?? range
    }
  }
}

/** Answer of `prepareCallHierarchy`/`prepareTypeHierarchy`. */
export function normalizeHierarchyItems(
  raw: unknown,
  kind: LspHierarchyKind,
  platform: string = process.platform,
  canon: Canon = (p) => p
): RawHierarchyItem[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : []
  const result: RawHierarchyItem[] = []
  for (const entry of list.slice(0, PREPARE_LIMIT)) {
    const item = normalizeHierarchyItem(entry, kind, platform, canon)
    if (item) result.push(item)
  }
  return result
}

const ranges = (v: unknown): LspRange[] =>
  Array.isArray(v)
    ? (v as unknown[])
        .slice(0, RANGE_LIMIT)
        .map(asRange)
        .filter((r): r is LspRange => r !== null)
    : []

/**
 * Neighbors of an item: `CallHierarchyIncomingCall[]` (`from` + `fromRanges`), `CallHierarchyOutgoingCall[]` (`to` +
 * `fromRanges`) or `TypeHierarchyItem[]` (no ranges).
 */
export function normalizeHierarchyEdges(
  raw: unknown,
  direction: LspHierarchyDirection,
  platform: string = process.platform,
  canon: Canon = (p) => p
): RawHierarchyEdge[] {
  if (!Array.isArray(raw)) return []
  const kind = hierarchyKindOf(direction)
  const result: RawHierarchyEdge[] = []
  for (const entry of raw as unknown[]) {
    if (result.length >= ITEM_LIMIT) break
    if (kind === 'type') {
      const item = normalizeHierarchyItem(entry, kind, platform, canon)
      if (item) result.push({ ...item, ranges: [] })
      continue
    }
    if (!isRecord(entry)) continue
    const item = normalizeHierarchyItem(direction === 'incoming' ? entry.from : entry.to, kind, platform, canon)
    if (item) result.push({ ...item, ranges: ranges(entry.fromRanges) })
  }
  return result
}

interface StoredItem<O> {
  owner: O
  kind: LspHierarchyKind
  raw: Record<string, unknown>
}

/** Raw items by id (the oldest leave first when the limit is exceeded). */
export class HierarchyStore<O> {
  private seq = 0
  private readonly items = new Map<number, StoredItem<O>>()

  add(owner: O, kind: LspHierarchyKind, raw: Record<string, unknown>): number {
    const id = ++this.seq
    this.items.set(id, { owner, kind, raw })
    if (this.items.size > STORE_LIMIT) {
      const oldest = this.items.keys().next()
      if (!oldest.done) this.items.delete(oldest.value)
    }
    return id
  }

  get(id: number): StoredItem<O> | undefined {
    return this.items.get(id)
  }

  dropOwner(match: (owner: O) => boolean): void {
    for (const [id, item] of this.items) if (match(item.owner)) this.items.delete(id)
  }

  clear(): void {
    this.items.clear()
  }
}

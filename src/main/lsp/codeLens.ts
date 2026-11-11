import { flattenControl } from '@shared/controlChars'
import { isRecord } from '@shared/guards'
import { pathKey } from '@shared/pathCompare'
import type { LspCodeLens, LspCodeLensCommand } from '@shared/types'
import { normalizeLocations, type Canon } from './locations'
import { asRange } from './shape'
import { parseCommand } from './validate'

const CODE_LENS_LIMIT = 2000
const TITLE_MAX = 200

/**
 * Commands that only show locations, with the arguments `[uri, position, Location[]]` (VS Code convention, used by
 * typescript-language-server and rust-analyzer). The server does not run them: the renderer shows the locations.
 */
const SHOW_LOCATIONS = new Set([
  'editor.action.showReferences',
  'editor.action.peekLocations',
  'editor.action.goToLocations',
  'rust-analyzer.showReferences'
])

/** A lens's `Command`; `null` if malformed or without a title (tsserver returns an empty title when it cancels). */
export function normalizeLensCommand(
  raw: unknown,
  platform: string = process.platform,
  canon: Canon = (p) => p
): LspCodeLensCommand | null {
  if (!isRecord(raw) || typeof raw.title !== 'string') return null
  const title = flattenControl(raw.title).trim().slice(0, TITLE_MAX)
  if (!title) return null
  const command = typeof raw.command === 'string' ? raw.command : ''
  if (SHOW_LOCATIONS.has(command)) {
    const args = Array.isArray(raw.arguments) ? (raw.arguments as unknown[]) : []
    return { title, locations: normalizeLocations(args[2], platform, canon) }
  }
  const parsed = command ? parseCommand(raw) : null
  return parsed ? { title, command: { ...parsed, title } } : { title }
}

/** A `CodeLens`; without a `command` (or with an invalid one) it comes back unresolved. */
export function normalizeCodeLens(
  raw: unknown,
  platform: string = process.platform,
  canon: Canon = (p) => p
): LspCodeLens | null {
  if (!isRecord(raw)) return null
  const range = asRange(raw.range)
  if (!range) return null
  const command = raw.command === undefined ? null : normalizeLensCommand(raw.command, platform, canon)
  return command ? { range, command } : { range }
}

/** Server list → valid lenses and the raw items in the same order (`codeLens/resolve` resends the raw one). */
export function normalizeCodeLenses(
  raw: unknown,
  platform: string = process.platform,
  canon: Canon = (p) => p
): { lenses: LspCodeLens[]; raws: Record<string, unknown>[] } {
  const lenses: LspCodeLens[] = []
  const raws: Record<string, unknown>[] = []
  if (!Array.isArray(raw)) return { lenses, raws }
  for (const item of raw as unknown[]) {
    if (lenses.length >= CODE_LENS_LIMIT) break
    const lens = normalizeCodeLens(item, platform, canon)
    if (!lens || !isRecord(item)) continue
    lenses.push(lens)
    raws.push(item)
  }
  return { lenses, raws }
}

interface CachedLenses<O> {
  id: number
  owner: O
  raws: Record<string, unknown>[]
}

/** The last lens list of each document (by `pathKey`), with the owner (server/process) that produced it. */
export class CodeLensCache<O> {
  private seq = 0
  private readonly lists = new Map<string, CachedLenses<O>>()

  store(path: string, owner: O, raws: Record<string, unknown>[]): number {
    const id = ++this.seq
    this.lists.set(pathKey(path), { id, owner, raws })
    return id
  }

  /** The document's list `id`, if it is still the last one. */
  get(path: string, id: number): CachedLenses<O> | null {
    const list = this.lists.get(pathKey(path))
    return list?.id === id ? list : null
  }

  delete(path: string): void {
    this.lists.delete(pathKey(path))
  }

  dropOwner(match: (owner: O) => boolean): void {
    for (const [key, list] of this.lists) if (match(list.owner)) this.lists.delete(key)
  }

  clear(): void {
    this.lists.clear()
  }
}

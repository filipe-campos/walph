import { isRecord } from '@shared/guards'
import type { LspLocation } from '@shared/types'
import { asRange } from './shape'
import { uriToPath } from './uri'

const LOCATION_LIMIT = 5000

/** Path spelling used by the renderer (see `canonicalPath`). */
export type Canon = (path: string) => string

/** A `Location` or `LocationLink`; `null` if malformed or if the URI is not a file. */
export function normalizeLocation(
  raw: unknown,
  platform: string = process.platform,
  canon: Canon = (p) => p
): LspLocation | null {
  if (!isRecord(raw)) return null
  // `LocationLink`: the target that matters for navigation is `targetSelectionRange` (the name), not the whole body.
  const link = typeof raw.targetUri === 'string'
  const uri = link ? raw.targetUri : raw.uri
  const range = link ? (asRange(raw.targetSelectionRange) ?? asRange(raw.targetRange)) : asRange(raw.range)
  if (typeof uri !== 'string' || !range) return null
  const path = uriToPath(uri, platform)
  return path ? { path: canon(path), range } : null
}

/** `Location | Location[] | LocationLink[] | null` → list (without exact duplicates). */
export function normalizeLocations(
  raw: unknown,
  platform: string = process.platform,
  canon: Canon = (p) => p
): LspLocation[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const seen = new Set<string>()
  const result: LspLocation[] = []
  for (const entry of list) {
    if (result.length >= LOCATION_LIMIT) break
    const location = normalizeLocation(entry, platform, canon)
    if (!location) continue
    const { start, end } = location.range
    const key = `${location.path}:${start.line}:${start.character}:${end.line}:${end.character}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(location)
  }
  return result
}

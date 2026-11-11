import type { LspCommand, LspPosition, LspRange, LspTextChange } from '@shared/types'

const isPos = (v: unknown): v is LspPosition => {
  const p = v as LspPosition | null
  return !!p && Number.isInteger(p.line) && Number.isInteger(p.character) && p.line >= 0 && p.character >= 0
}

/** Validates the change list coming from the renderer; `null` if any item is malformed. */
export function parseChanges(value: unknown): LspTextChange[] | null {
  if (!Array.isArray(value)) return null
  const result: LspTextChange[] = []
  for (const item of value as Array<
    { range?: { start?: unknown; end?: unknown }; text?: unknown } | null | undefined
  >) {
    if (!item || typeof item.text !== 'string' || !item.range) return null
    if (!isPos(item.range.start) || !isPos(item.range.end)) return null
    result.push({ range: { start: item.range.start, end: item.range.end }, text: item.text })
  }
  return result
}

/** Document version: non-negative integer. */
export const isVersion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

/** Non-negative `{ line, character }` position coming from the renderer; `null` if invalid. */
export const parsePosition = (v: unknown): LspPosition | null =>
  isPos(v) ? { line: v.line, character: v.character } : null

export function parseRange(v: unknown): LspRange | null {
  const r = v as { start?: unknown; end?: unknown } | null
  if (!r || typeof r !== 'object') return null
  const start = parsePosition(r.start)
  const end = parsePosition(r.end)
  return start && end ? { start, end } : null
}

/** `{ tabSize, insertSpaces }`: `tabSize` an integer from 1 to 16. */
export function parseFormatOptions(v: unknown): { tabSize: number; insertSpaces: boolean } | null {
  const o = v as { tabSize?: unknown; insertSpaces?: unknown } | null
  if (!o || typeof o !== 'object') return null
  if (typeof o.tabSize !== 'number' || !Number.isInteger(o.tabSize) || o.tabSize < 1 || o.tabSize > 16) return null
  if (typeof o.insertSpaces !== 'boolean') return null
  return { tabSize: o.tabSize, insertSpaces: o.insertSpaces }
}

/** Commands too large do not pass (the arguments go back to the server as JSON). */
const MAX_ARGUMENTS_JSON = 1_000_000

export function parseCommand(v: unknown): LspCommand | null {
  const c = v as { title?: unknown; command?: unknown; arguments?: unknown } | null
  if (!c || typeof c !== 'object') return null
  if (typeof c.title !== 'string' || typeof c.command !== 'string' || c.command === '' || c.command.length > 500) {
    return null
  }
  if (c.arguments === undefined) return { title: c.title, command: c.command }
  if (!Array.isArray(c.arguments)) return null
  try {
    // Must survive JSON (no functions, cycles or BigInt) and not be huge.
    const json = JSON.stringify(c.arguments)
    if (json.length > MAX_ARGUMENTS_JSON) return null
  } catch {
    return null
  }
  return { title: c.title, command: c.command, arguments: c.arguments }
}

/** Optional trigger character: at most 8 UTF-16 units. */
export const parseTrigger = (v: unknown): string | undefined | null =>
  v === undefined || v === null ? undefined : typeof v === 'string' && v.length > 0 && v.length <= 8 ? v : null

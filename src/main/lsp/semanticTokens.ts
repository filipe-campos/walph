import { isRecord } from '@shared/guards'
import type { LspSemanticTokens } from '@shared/types'
import type { SemanticTokensCaps } from './capabilities'

/** Tokens returned to the renderer; the rest of the document keeps only the Lezer highlighting. */
const SEMANTIC_TOKEN_LIMIT = 200_000
/** Above this (raw integers, 5 per token) the answer is dropped whole instead of validated. */
const RAW_DATA_LIMIT = 5 * 1_000_000
const EDIT_LIMIT = 10_000
const RESULT_ID_LIMIT = 1000
/** A document larger than this does not request tokens: the server would spend seconds and the renderer, memory. */
export const SEMANTIC_TOKENS_MAX_TEXT = 3_000_000

/** The document's last result: base of the deltas, valid only for the same server process. */
export interface SemanticTokensCache {
  serverId: string
  runId: number
  resultId: string
  data: number[]
}

const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffff_ffff

/** List of relative integers (5 per token); `null` if malformed or too large. */
export function parseTokenData(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length % 5 !== 0 || v.length > RAW_DATA_LIMIT) return null
  for (const n of v) if (!isUint32(n)) return null
  return v as number[]
}

/**
 * `SemanticTokensEdit[]` over the previous result. The edits apply to the ORIGINAL array and cannot overlap; any
 * invalid part returns `null` (the caller requests the whole document again).
 */
export function applySemanticEdits(previous: readonly number[], edits: unknown): number[] | null {
  if (!Array.isArray(edits) || edits.length > EDIT_LIMIT) return null
  const parsed: { start: number; deleteCount: number; data: number[] }[] = []
  for (const e of edits) {
    if (!isRecord(e) || !isUint32(e.start) || !isUint32(e.deleteCount)) return null
    const data = e.data === undefined ? [] : Array.isArray(e.data) && e.data.every(isUint32) ? e.data : null
    if (!data) return null
    parsed.push({ start: e.start, deleteCount: e.deleteCount, data: data })
  }
  parsed.sort((a, b) => a.start - b.start)
  const result: number[] = []
  let cursor = 0
  for (const { start, deleteCount, data } of parsed) {
    if (start < cursor || start + deleteCount > previous.length) return null
    for (let i = cursor; i < start; i++) result.push(previous[i] ?? 0)
    for (const n of data) result.push(n)
    cursor = start + deleteCount
  }
  for (let i = cursor; i < previous.length; i++) result.push(previous[i] ?? 0)
  return result.length % 5 === 0 && result.length <= RAW_DATA_LIMIT ? result : null
}

/**
 * Relative → absolute: each token's line and character stop depending on the previous one. Empty tokens or tokens
 * with a type outside the legend are dropped; at most `SEMANTIC_TOKEN_LIMIT`.
 */
export function decodeSemanticTokens(data: readonly number[], typeCount: number): number[] {
  const out: number[] = []
  let line = 0
  let char = 0
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i] ?? 0
    const deltaChar = data[i + 1] ?? 0
    const length = data[i + 2] ?? 0
    const type = data[i + 3] ?? 0
    if (deltaLine > 0) {
      line += deltaLine
      char = deltaChar
    } else {
      char += deltaChar
    }
    if (length === 0 || type >= typeCount) continue
    out.push(line, char, length, type, data[i + 4] ?? 0)
    if (out.length >= SEMANTIC_TOKEN_LIMIT * 5) break
  }
  return out
}

interface SemanticTokensResult {
  tokens: LspSemanticTokens | null
  /** New result to store; `null` = forget the previous one. */
  cache: Omit<SemanticTokensCache, 'serverId' | 'runId'> | null
}

/** Answer of `full` (`SemanticTokens`) or of `full/delta` (`SemanticTokensDelta`, or a whole `SemanticTokens`). */
export function normalizeSemanticTokens(
  raw: unknown,
  legend: SemanticTokensCaps,
  previous: readonly number[] | null
): SemanticTokensResult {
  if (!isRecord(raw)) return { tokens: null, cache: null }
  const data = Array.isArray(raw.edits)
    ? previous
      ? applySemanticEdits(previous, raw.edits)
      : null
    : parseTokenData(raw.data)
  if (!data) return { tokens: null, cache: null }
  const resultId =
    typeof raw.resultId === 'string' && raw.resultId !== '' && raw.resultId.length <= RESULT_ID_LIMIT
      ? raw.resultId
      : null
  return {
    tokens: {
      types: legend.types,
      modifiers: legend.modifiers,
      data: decodeSemanticTokens(data, legend.types.length)
    },
    cache: resultId ? { resultId, data } : null
  }
}

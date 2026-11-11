import { isFiniteNumber, isRecord } from '@shared/guards'
import type { Diagnostic, DiagnosticSeverity, LspRange } from '@shared/types'

/** LSP `DiagnosticSeverity` (1..4). With no severity the server leaves it to the client: we treat it as an error. */
export function mapSeverity(severity: unknown): DiagnosticSeverity {
  switch (severity) {
    case 2:
      return 'warning'
    case 3:
      return 'info'
    case 4:
      return 'hint'
    default:
      return 'error'
  }
}

const isNum = (v: unknown): v is number => isFiniteNumber(v) && v >= 0

function mapRange(v: unknown): LspRange | null {
  const r = v as {
    start?: { line?: unknown; character?: unknown }
    end?: { line?: unknown; character?: unknown }
  } | null
  if (!r || !r.start || !r.end) return null
  const { start, end } = r
  if (!isNum(start.line) || !isNum(start.character) || !isNum(end.line) || !isNum(end.character)) return null
  return { start: { line: start.line, character: start.character }, end: { line: end.line, character: end.character } }
}

/** Converts the raw `publishDiagnostics` list; malformed entries are dropped. */
export function mapDiagnostics(raw: unknown): Diagnostic[] {
  if (!Array.isArray(raw)) return []
  const result: Diagnostic[] = []
  for (const item of raw as unknown[]) {
    if (!isRecord(item)) continue
    const range = mapRange(item.range)
    if (!range || typeof item.message !== 'string') continue
    const diagnostic: Diagnostic = { range, severity: mapSeverity(item.severity), message: item.message }
    if (typeof item.source === 'string') diagnostic.source = item.source
    if (typeof item.code === 'string' || typeof item.code === 'number') diagnostic.code = item.code
    result.push(diagnostic)
  }
  return result
}

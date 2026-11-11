// Renderer arguments (untrusted) for the `debug:*` channels.
import { MAX_BREAKPOINTS_PER_FILE } from '@shared/debug'
import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import type { DebugSourceBreakpoint, DebugStartOptions } from '@shared/types'
import { isAbsolutePathInput } from '../fs/validate'

const MAX_TEXT = 1000
const MAX_SELECTION = 10_000

/** `start` options: invalid fields are dropped (none of them is required). */
export function parseStartOptions(value: unknown): DebugStartOptions {
  const v = isRecord(value) ? value : {}
  const line = isFiniteNumber(v.line) && v.line >= 1 ? Math.floor(v.line) : undefined
  return {
    ...(v.noDebug === true ? { noDebug: true } : {}),
    ...(isAbsolutePathInput(v.file) ? { file: v.file } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(typeof v.selectedText === 'string' && v.selectedText.length <= MAX_SELECTION
      ? { selectedText: v.selectedText }
      : {})
  }
}

const text = (v: unknown): string | undefined =>
  isNonEmptyString(v) && v.trim() !== '' && v.length <= MAX_TEXT && !v.includes('\0') ? v : undefined

/** Breakpoint list of a file; `null` if it is not a list. Invalid items and repeated lines are dropped. */
export function parseSourceBreakpoints(value: unknown): DebugSourceBreakpoint[] | null {
  if (!Array.isArray(value)) return null
  const lines = new Set<number>()
  const out: DebugSourceBreakpoint[] = []
  for (const raw of value.slice(0, MAX_BREAKPOINTS_PER_FILE)) {
    if (!isRecord(raw) || !isFiniteNumber(raw.line) || raw.line < 1 || !Number.isInteger(raw.line)) continue
    if (lines.has(raw.line)) continue
    lines.add(raw.line)
    const condition = text(raw.condition)
    const hitCondition = text(raw.hitCondition)
    const logMessage = text(raw.logMessage)
    out.push({
      line: raw.line,
      ...(condition ? { condition } : {}),
      ...(hitCondition ? { hitCondition } : {}),
      ...(logMessage ? { logMessage } : {})
    })
  }
  return out
}

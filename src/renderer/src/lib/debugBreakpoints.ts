// Breakpoints per file (list sorted by line, one entry per line): pure operations used by the store, the
// session and the editor marks.
import type { DebugBreakpointStatus, DebugSourceBreakpoint, SessionBreakpointFile } from '@shared/types'

export interface Breakpoint {
  /** Line from 1. */
  line: number
  enabled: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
}

export type BreakpointFields = Pick<Breakpoint, 'condition' | 'hitCondition' | 'logMessage'>

/** Look of the mark in the editor gutter. */
type BreakpointMarkKind = 'enabled' | 'unverified' | 'disabled' | 'conditional' | 'log'

export interface BreakpointMark {
  line: number
  kind: BreakpointMarkKind
  /** Reason for unverified, or the condition/message (tooltip). */
  title: string | null
}

const byLine = (a: Breakpoint, b: Breakpoint): number => a.line - b.line

/** Empty fields disappear: an erased condition goes back to being a plain breakpoint. */
function clean(bp: Breakpoint): Breakpoint {
  const out: Breakpoint = { line: bp.line, enabled: bp.enabled }
  if (bp.condition?.trim()) out.condition = bp.condition.trim()
  if (bp.hitCondition?.trim()) out.hitCondition = bp.hitCondition.trim()
  if (bp.logMessage?.trim()) out.logMessage = bp.logMessage.trim()
  return out
}

function hasBreakpoint(list: readonly Breakpoint[], line: number): boolean {
  return list.some((b) => b.line === line)
}

/** Turns the line on (new, enabled breakpoint) or removes the one already there. */
export function toggleBreakpoint(list: readonly Breakpoint[], line: number): Breakpoint[] {
  if (hasBreakpoint(list, line)) return list.filter((b) => b.line !== line)
  return [...list, { line, enabled: true }].sort(byLine)
}

/**
 * Replaces the line's condition/hit count/message (creates the breakpoint if it does not exist; creating or editing
 * enables it).
 */
export function setBreakpointFields(list: readonly Breakpoint[], line: number, fields: BreakpointFields): Breakpoint[] {
  const next = list.filter((b) => b.line !== line)
  next.push(clean({ line, enabled: true, ...fields }))
  return next.sort(byLine)
}

export function setBreakpointEnabled(list: readonly Breakpoint[], line: number, enabled: boolean): Breakpoint[] {
  return list.map((b) => (b.line === line ? { ...b, enabled } : b))
}

export function removeBreakpoint(list: readonly Breakpoint[], line: number): Breakpoint[] {
  return list.filter((b) => b.line !== line)
}

/**
 * An edit in the editor shifted lines: applies `from → to` (all over the previous list, no cascading). Two breakpoints
 * that land on the same line (deleted lines) become one, the first of the list.
 */
export function moveBreakpoints(
  list: readonly Breakpoint[],
  moves: readonly { from: number; to: number }[]
): Breakpoint[] {
  if (moves.length === 0) return [...list]
  const target = new Map(moves.map((m) => [m.from, m.to]))
  const seen = new Set<number>()
  const out: Breakpoint[] = []
  for (const bp of list) {
    const line = target.get(bp.line) ?? bp.line
    if (seen.has(line)) continue
    seen.add(line)
    out.push({ ...bp, line })
  }
  return out.sort(byLine)
}

/** What goes to the adapter: only the enabled ones, without empty fields. */
export function toSourceBreakpoints(list: readonly Breakpoint[]): DebugSourceBreakpoint[] {
  return list
    .filter((b) => b.enabled)
    .map((b) => {
      const { enabled: _enabled, ...rest } = clean(b)
      return rest
    })
}

/** Gutter marks: the adapter state (if there is a session) over the breakpoint kind. */
export function breakpointMarks(
  list: readonly Breakpoint[],
  statuses: readonly DebugBreakpointStatus[] | undefined
): BreakpointMark[] {
  return list.map((b) => {
    const status = statuses?.find((s) => s.line === b.line)
    const detail = b.logMessage ?? b.condition ?? b.hitCondition ?? null
    if (!b.enabled) return { line: b.line, kind: 'disabled', title: detail }
    if (status && !status.verified) return { line: b.line, kind: 'unverified', title: status.message ?? detail }
    if (b.logMessage) return { line: b.line, kind: 'log', title: detail }
    if (b.condition || b.hitCondition) return { line: b.line, kind: 'conditional', title: detail }
    return { line: b.line, kind: 'enabled', title: null }
  })
}

/** Session: files with at least one breakpoint, in key order. */
export function breakpointsToSession(map: Readonly<Record<string, readonly Breakpoint[]>>): SessionBreakpointFile[] {
  return Object.entries(map)
    .filter(([, list]) => list.length > 0)
    .map(([path, list]) => ({
      path,
      breakpoints: list.map((b) => {
        const { enabled, ...rest } = clean(b)
        return enabled ? rest : { ...rest, enabled: false }
      })
    }))
}

/**
 * Session → store map; invalid and repeated lines are dropped (main already sanitizes, the renderer does not trust it).
 */
export function breakpointsFromSession(
  files: readonly SessionBreakpointFile[] | undefined
): Record<string, Breakpoint[]> {
  const out: Record<string, Breakpoint[]> = {}
  for (const file of files ?? []) {
    const seen = new Set<number>()
    const list: Breakpoint[] = []
    for (const b of file.breakpoints) {
      if (!Number.isInteger(b.line) || b.line < 1 || seen.has(b.line)) continue
      seen.add(b.line)
      list.push(clean({ ...b, enabled: b.enabled !== false }))
    }
    if (list.length > 0) out[file.path] = list.sort(byLine)
  }
  return out
}

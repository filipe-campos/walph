// Normalization of the adapter responses and events (untrusted) into the contract types: validated fields, texts
// without control characters and capped, capped lists. Pure.
import { basename, isAbsolute } from 'node:path'
import { flattenControl, stripAnsi, stripControl } from '@shared/controlChars'
import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import type {
  DebugBreakpointStatus,
  DebugCapabilities,
  DebugEvaluateResult,
  DebugOutputCategory,
  DebugScope,
  DebugStackFrame,
  DebugThread,
  DebugVariable
} from '@shared/types'

const MAX_NAME = 500
const MAX_VALUE = 10_000
const MAX_OUTPUT = 100_000
const MAX_THREADS = 1000
const MAX_FRAMES = 500
const MAX_SCOPES = 100
const MAX_VARIABLES = 5000

const line = (v: unknown, max = MAX_NAME): string => flattenControl(typeof v === 'string' ? v : '').slice(0, max)
const optLine = (v: unknown, max = MAX_NAME): string | null => (isNonEmptyString(v) ? line(v, max) : null)
const posInt = (v: unknown, fallback: number): number => (isFiniteNumber(v) && v >= 1 ? Math.floor(v) : fallback)
const ref = (v: unknown): number => (isFiniteNumber(v) && v > 0 ? Math.floor(v) : 0)
const list = (body: unknown, key: string, max: number): unknown[] => {
  const value = isRecord(body) ? body[key] : undefined
  return Array.isArray(value) ? value.slice(0, max) : []
}

/** Capabilities the client uses (besides the ones the UI shows). */
export interface AdapterCapabilities extends DebugCapabilities {
  configurationDone: boolean
  /** Exception filters enabled by default (`default: true`), sent in `setExceptionBreakpoints`. */
  defaultExceptionFilters: string[]
  /** The adapter announced `exceptionBreakpointFilters` (only then is `setExceptionBreakpoints` sent). */
  exceptionBreakpoints: boolean
}

export function parseCapabilities(body: unknown, previous?: AdapterCapabilities): AdapterCapabilities {
  const c = isRecord(body) ? body : {}
  const flag = (key: string, fallback: boolean): boolean => (typeof c[key] === 'boolean' ? c[key] : fallback)
  const filters = Array.isArray(c.exceptionBreakpointFilters) ? c.exceptionBreakpointFilters : null
  return {
    conditionalBreakpoints: flag('supportsConditionalBreakpoints', previous?.conditionalBreakpoints ?? false),
    hitConditionalBreakpoints: flag('supportsHitConditionalBreakpoints', previous?.hitConditionalBreakpoints ?? false),
    logPoints: flag('supportsLogPoints', previous?.logPoints ?? false),
    restart: flag('supportsRestartRequest', previous?.restart ?? false),
    terminate: flag('supportsTerminateRequest', previous?.terminate ?? false),
    configurationDone: flag('supportsConfigurationDoneRequest', previous?.configurationDone ?? false),
    exceptionBreakpoints: filters ? true : (previous?.exceptionBreakpoints ?? false),
    defaultExceptionFilters: filters
      ? filters
          .filter((f) => isRecord(f) && f.default === true && isNonEmptyString(f.filter))
          .map((f) => String((f as Record<string, unknown>).filter))
      : (previous?.defaultExceptionFilters ?? [])
  }
}

export function publicCapabilities(caps: AdapterCapabilities): DebugCapabilities {
  return {
    conditionalBreakpoints: caps.conditionalBreakpoints,
    hitConditionalBreakpoints: caps.hitConditionalBreakpoints,
    logPoints: caps.logPoints,
    restart: caps.restart,
    terminate: caps.terminate
  }
}

/**
 * Message of a `success: false` response: the body `error.format` (with its `{variables}` filled in) wins over
 * `message`, which is often just a code (`cancelled`, `notStopped`).
 */
export function responseErrorMessage(response: Record<string, unknown>, command: string): string {
  const body = isRecord(response.body) ? response.body : {}
  const error = isRecord(body.error) ? body.error : null
  if (error && isNonEmptyString(error.format)) {
    const vars = isRecord(error.variables) ? error.variables : {}
    const text = error.format.replace(/\{([^}]+)\}/g, (all, name: string) => {
      const value = vars[name]
      return typeof value === 'string' ? value : all
    })
    return line(text, MAX_VALUE)
  }
  return isNonEmptyString(response.message) ? line(response.message, MAX_VALUE) : command
}

export function parseThreads(body: unknown): DebugThread[] {
  const threads: DebugThread[] = []
  for (const raw of list(body, 'threads', MAX_THREADS)) {
    if (!isRecord(raw) || !isFiniteNumber(raw.id)) continue
    threads.push({ id: Math.floor(raw.id), name: line(raw.name) || String(raw.id) })
  }
  return threads
}

const HINTS = ['normal', 'label', 'subtle'] as const

export function parseStackFrames(body: unknown): DebugStackFrame[] {
  const frames: DebugStackFrame[] = []
  for (const raw of list(body, 'stackFrames', MAX_FRAMES)) {
    if (!isRecord(raw) || !isFiniteNumber(raw.id)) continue
    const source = isRecord(raw.source) ? raw.source : {}
    const path = typeof source.path === 'string' && isAbsolute(source.path) ? source.path : null
    const sourceHint = source.presentationHint === 'deemphasize' ? 'subtle' : null
    const hint = HINTS.find((h) => h === raw.presentationHint) ?? sourceHint ?? 'normal'
    frames.push({
      id: Math.floor(raw.id),
      name: line(raw.name) || '?',
      path,
      sourceName: optLine(source.name) ?? (path ? basename(path) : null),
      line: posInt(raw.line, 1),
      column: posInt(raw.column, 1),
      hint
    })
  }
  return frames
}

export function parseScopes(body: unknown): DebugScope[] {
  const scopes: DebugScope[] = []
  for (const raw of list(body, 'scopes', MAX_SCOPES)) {
    if (!isRecord(raw)) continue
    scopes.push({
      name: line(raw.name) || '?',
      variablesReference: ref(raw.variablesReference),
      expensive: raw.expensive === true
    })
  }
  return scopes
}

const value = (v: unknown): string =>
  stripControl(typeof v === 'string' ? v : '', { keepNewlines: true }).slice(0, MAX_VALUE)

export function parseVariables(body: unknown): DebugVariable[] {
  const variables: DebugVariable[] = []
  for (const raw of list(body, 'variables', MAX_VARIABLES)) {
    if (!isRecord(raw)) continue
    variables.push({
      name: line(raw.name) || '?',
      value: value(raw.value),
      type: optLine(raw.type),
      variablesReference: ref(raw.variablesReference)
    })
  }
  return variables
}

export function parseEvaluate(body: unknown): DebugEvaluateResult {
  const b = isRecord(body) ? body : {}
  return { result: value(b.result), type: optLine(b.type), variablesReference: ref(b.variablesReference) }
}

/** Status of each requested breakpoint, in request order (short or malformed response = unverified). */
export function parseBreakpointStatuses(
  body: unknown,
  requested: readonly number[]
): { statuses: DebugBreakpointStatus[]; ids: Array<number | null> } {
  const answered = list(body, 'breakpoints', requested.length)
  const statuses: DebugBreakpointStatus[] = []
  const ids: Array<number | null> = []
  requested.forEach((requestedLine, i) => {
    const raw = answered[i]
    const status = isRecord(raw) ? raw : {}
    statuses.push(breakpointStatus(requestedLine, status))
    ids.push(isFiniteNumber(status.id) ? status.id : null)
  })
  return { statuses, ids }
}

export function breakpointStatus(requestedLine: number, raw: Record<string, unknown>): DebugBreakpointStatus {
  const actual = isFiniteNumber(raw.line) && raw.line >= 1 ? Math.floor(raw.line) : null
  return {
    line: requestedLine,
    verified: raw.verified === true,
    actualLine: actual !== null && actual !== requestedLine ? actual : null,
    message: optLine(raw.message)
  }
}

export interface StoppedInfo {
  threadId: number | null
  reason: string
  description: string | null
  allThreadsStopped: boolean
}

export function parseStopped(body: unknown): StoppedInfo {
  const b = isRecord(body) ? body : {}
  return {
    threadId: isFiniteNumber(b.threadId) ? Math.floor(b.threadId) : null,
    reason: line(b.reason, 100) || 'pause',
    description: optLine(b.text, MAX_VALUE) ?? optLine(b.description, MAX_VALUE),
    allThreadsStopped: b.allThreadsStopped === true
  }
}

export function parseContinued(body: unknown): { threadId: number | null; allThreadsContinued: boolean } {
  const b = isRecord(body) ? body : {}
  return {
    threadId: isFiniteNumber(b.threadId) ? Math.floor(b.threadId) : null,
    // The specification: absent = all threads continued.
    allThreadsContinued: b.allThreadsContinued !== false
  }
}

const CATEGORIES: readonly DebugOutputCategory[] = ['console', 'stdout', 'stderr', 'important']

/** `null` = does not go to the console (telemetry, empty text). */
export function parseOutput(body: unknown): { category: DebugOutputCategory; text: string } | null {
  const b = isRecord(body) ? body : {}
  if (b.category === 'telemetry' || typeof b.output !== 'string') return null
  const text = stripControl(stripAnsi(b.output), { keepNewlines: true }).slice(0, MAX_OUTPUT)
  if (text === '') return null
  const category = CATEGORIES.find((c) => c === b.category) ?? 'console'
  return { category, text }
}

export function parseExitCode(body: unknown): number | null {
  return isRecord(body) && isFiniteNumber(body.exitCode) ? Math.floor(body.exitCode) : null
}

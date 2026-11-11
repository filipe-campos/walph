// CLI messages that become simple panel events (retry, permission denied, subagent progress, prompt suggestion, tool
// progress, model switch). Everything comes from the CLI and is UNTRUSTED: sanitized numbers, single-line plain text,
// truncated. Pure and tested; `conversation.ts` only emits the result.

import { flattenControl } from '@shared/controlChars'
import { isModelId } from '@shared/claudeModel'
import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import type { ClaudeEvent, ClaudeTaskProgress } from '@shared/types'

const MAX_REASON = 300
const MAX_SUMMARY = 160
const MAX_SUGGESTION = 300
const MAX_NAME = 100
const MAX_ID = 200
const MAX_RETRACTED = 200
const MAX_COUNT = 1e12

/** Single-line plain text: controls become spaces, repeated spaces collapse, trimmed and truncated. */
export function oneLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  const text = flattenControl(v).replace(/ {2,}/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Finite integer ≥ 0 (anything else becomes `fallback`). */
export function count(v: unknown, fallback = 0): number {
  return isFiniteNumber(v) && v >= 0 ? Math.min(Math.round(v), MAX_COUNT) : fallback
}

function id(v: unknown): string | null {
  return isNonEmptyString(v) && v.length <= MAX_ID ? v : null
}

type EventBody<T extends ClaudeEvent['type']> = Omit<Extract<ClaudeEvent, { type: T }>, 'id' | 'type'>

export function normalizeRetry(m: Record<string, unknown>, now: number): EventBody<'retry'> {
  const status = typeof m.error_status === 'number' && Number.isInteger(m.error_status) ? m.error_status : null
  return {
    attempt: count(m.attempt),
    maxRetries: count(m.max_retries),
    delayMs: count(m.retry_delay_ms),
    errorStatus: status !== null && status >= 100 && status <= 599 ? status : null,
    timestamp: now
  }
}

export function normalizePermissionDenied(
  m: Record<string, unknown>,
  now: number
): EventBody<'permissionDenied'> | null {
  const toolUseId = id(m.tool_use_id)
  const toolName = oneLine(m.tool_name, MAX_NAME)
  if (!toolUseId || !toolName) return null
  const reason = oneLine(m.decision_reason, MAX_REASON) || oneLine(m.message, MAX_REASON)
  return { toolUseId, toolName, reason, timestamp: now }
}

export function normalizeTaskProgress(m: Record<string, unknown>): ClaudeTaskProgress | null {
  const taskId = id(m.task_id)
  if (!taskId) return null
  const usage = isRecord(m.usage) ? m.usage : {}
  return {
    taskId,
    toolUseId: id(m.tool_use_id),
    summary: oneLine(m.summary, MAX_SUMMARY) || null,
    totalTokens: count(usage.total_tokens),
    toolUses: count(usage.tool_uses),
    durationMs: count(usage.duration_ms),
    lastToolName: oneLine(m.last_tool_name, MAX_NAME) || null
  }
}

/** Next prompt suggestion (one line); empty = nothing to show. */
export function normalizeSuggestion(m: Record<string, unknown>): string | null {
  return oneLine(m.suggestion, MAX_SUGGESTION) || null
}

/** Same rule as `setModel` (`isModelId`): the name becomes `--model` on relaunch, so no truncating (invalid = drop). */
function modelName(v: unknown): string | null {
  return isModelId(v) ? v : null
}

export function normalizeModelFallback(m: Record<string, unknown>): EventBody<'modelFallback'> | null {
  const from = modelName(m.original_model)
  const to = modelName(m.fallback_model)
  if (!from || !to) return null
  const retracted = Array.isArray(m.retracted_message_uuids)
    ? m.retracted_message_uuids
        .filter((u): u is string => isNonEmptyString(u) && u.length <= MAX_ID)
        .slice(0, MAX_RETRACTED)
    : []
  // Missing (old CLIs) means `session`, as the SDK documents.
  return { from, to, scope: m.scope === 'local' ? 'local' : 'session', retracted }
}

/** `tool_progress` arrives several times per second: at most one event per second and per tool. */
export class ToolProgressThrottle {
  private readonly last = new Map<string, { at: number; seconds: number }>()

  /** Returns the seconds to emit, or `null` if this frame should be dropped. */
  accept(m: Record<string, unknown>, now: number): { toolUseId: string; elapsedSeconds: number } | null {
    const toolUseId = id(m.tool_use_id)
    if (!toolUseId) return null
    const seconds = Math.floor(count(m.elapsed_time_seconds))
    const prev = this.last.get(toolUseId)
    // A heartbeat/repeated frame without a new second carries no information.
    if (prev && (now - prev.at < 1000 || seconds <= prev.seconds)) return null
    // Safety cap: a CLI with endless ids does not make the map grow forever.
    if (!prev && this.last.size >= 500) this.last.clear()
    this.last.set(toolUseId, { at: now, seconds })
    return { toolUseId, elapsedSeconds: seconds }
  }

  /** End of turn: no tool is still running. */
  clear(): void {
    this.last.clear()
  }
}

import { describe, expect, it } from 'vitest'
import {
  ToolProgressThrottle,
  count,
  normalizeModelFallback,
  normalizePermissionDenied,
  normalizeRetry,
  normalizeSuggestion,
  normalizeTaskProgress,
  oneLine
} from './sdkEvents'

describe('oneLine / count', () => {
  it('one line, no controls, truncated', () => {
    expect(oneLine('  a \n\n b\u0000c  ', 50)).toBe('a b c')
    expect(oneLine('x'.repeat(20), 10)).toBe('xxxxxxxxx…')
    expect(oneLine(undefined, 10)).toBe('')
  })
  it('count: finite integer >= 0', () => {
    expect(count(3.6)).toBe(4)
    expect(count(-1)).toBe(0)
    expect(count(NaN, 7)).toBe(7)
    expect(count('9')).toBe(0)
    expect(count(Infinity)).toBe(0)
  })
})

describe('normalizeRetry', () => {
  it('sanitizes numbers and the HTTP status', () => {
    expect(normalizeRetry({ attempt: 2, max_retries: 5, retry_delay_ms: 2500.4, error_status: 529 }, 99)).toEqual({
      attempt: 2,
      maxRetries: 5,
      delayMs: 2500,
      errorStatus: 529,
      timestamp: 99
    })
    expect(normalizeRetry({ attempt: -1, max_retries: 'x', error_status: null }, 1)).toMatchObject({
      attempt: 0,
      maxRetries: 0,
      delayMs: 0,
      errorStatus: null
    })
    expect(normalizeRetry({ error_status: 9999 }, 1).errorStatus).toBeNull()
  })
})

describe('normalizePermissionDenied', () => {
  it('prefers decision_reason, falls back to message, truncates', () => {
    expect(
      normalizePermissionDenied(
        { tool_name: 'Bash', tool_use_id: 't1', decision_reason: 'classifier', message: 'm' },
        5
      )
    ).toEqual({ toolUseId: 't1', toolName: 'Bash', reason: 'classifier', timestamp: 5 })
    expect(
      normalizePermissionDenied({ tool_name: 'Bash', tool_use_id: 't1', message: 'x'.repeat(400) }, 5)?.reason
    ).toHaveLength(300)
  })
  it('without id or name there is nothing to show', () => {
    expect(normalizePermissionDenied({ tool_name: 'Bash' }, 1)).toBeNull()
    expect(normalizePermissionDenied({ tool_use_id: 't' }, 1)).toBeNull()
  })
})

describe('normalizeTaskProgress', () => {
  it('maps, truncates the summary and nulls what is missing', () => {
    expect(
      normalizeTaskProgress({
        task_id: 'a1',
        tool_use_id: 't1',
        summary: `Reading\nfiles ${'x'.repeat(300)}`,
        usage: { total_tokens: 1200, tool_uses: 3, duration_ms: 4000 },
        last_tool_name: 'Read'
      })
    ).toMatchObject({
      taskId: 'a1',
      toolUseId: 't1',
      totalTokens: 1200,
      toolUses: 3,
      durationMs: 4000,
      lastToolName: 'Read'
    })
    const long = normalizeTaskProgress({ task_id: 'a', summary: 'a\nb'.repeat(200) })!
    expect(long.summary).toHaveLength(160)
    expect(long.summary).not.toContain('\n')
    expect(normalizeTaskProgress({ task_id: 'a' })).toEqual({
      taskId: 'a',
      toolUseId: null,
      summary: null,
      totalTokens: 0,
      toolUses: 0,
      durationMs: 0,
      lastToolName: null
    })
    expect(normalizeTaskProgress({ task_id: 'a', usage: { total_tokens: -5, tool_uses: NaN } })).toMatchObject({
      totalTokens: 0,
      toolUses: 0
    })
  })
  it('without task_id it is dropped', () => {
    expect(normalizeTaskProgress({})).toBeNull()
  })
})

describe('normalizeSuggestion', () => {
  it('one trimmed and capped line; empty = nothing', () => {
    expect(normalizeSuggestion({ suggestion: '  run the\ntests ' })).toBe('run the tests')
    expect(normalizeSuggestion({ suggestion: 'x'.repeat(500) })).toHaveLength(300)
    expect(normalizeSuggestion({ suggestion: '  \n ' })).toBeNull()
    expect(normalizeSuggestion({})).toBeNull()
  })
})

describe('normalizeModelFallback', () => {
  it('default scope session, uuids filtered and capped', () => {
    expect(
      normalizeModelFallback({
        original_model: 'opus',
        fallback_model: 'sonnet',
        retracted_message_uuids: ['u1', 7, '', 'u2']
      })
    ).toEqual({ from: 'opus', to: 'sonnet', scope: 'session', retracted: ['u1', 'u2'] })
    expect(normalizeModelFallback({ original_model: 'a', fallback_model: 'b', scope: 'local' })?.scope).toBe('local')
    const many = Array.from({ length: 500 }, (_, i) => `u${i}`)
    expect(
      normalizeModelFallback({ original_model: 'a', fallback_model: 'b', retracted_message_uuids: many })?.retracted
    ).toHaveLength(200)
  })
  it('invalid model name (space, too long) drops the event instead of truncating', () => {
    expect(normalizeModelFallback({ original_model: 'opus', fallback_model: 'so net' })).toBeNull()
    expect(normalizeModelFallback({ original_model: 'x'.repeat(201), fallback_model: 'b' })).toBeNull()
  })
  it('without both models it is dropped', () => {
    expect(normalizeModelFallback({ original_model: 'a' })).toBeNull()
  })
})

describe('ToolProgressThrottle', () => {
  const frame = (seconds: number, id = 't1') => ({ tool_use_id: id, elapsed_time_seconds: seconds })

  it('at most one event per second per tool', () => {
    const t = new ToolProgressThrottle()
    expect(t.accept(frame(1), 0)).toEqual({ toolUseId: 't1', elapsedSeconds: 1 })
    expect(t.accept(frame(2), 400)).toBeNull()
    expect(t.accept(frame(2), 1000)).toEqual({ toolUseId: 't1', elapsedSeconds: 2 })
  })

  it('a frame without a new second (heartbeat) is dropped even after 1 s', () => {
    const t = new ToolProgressThrottle()
    t.accept(frame(3), 0)
    expect(t.accept({ ...frame(3), heartbeat: true }, 5000)).toBeNull()
  })

  it('different tools have their own clocks', () => {
    const t = new ToolProgressThrottle()
    expect(t.accept(frame(1, 'a'), 0)).not.toBeNull()
    expect(t.accept(frame(1, 'b'), 10)).not.toBeNull()
  })

  it('clear forgets the state; an invalid id is dropped', () => {
    const t = new ToolProgressThrottle()
    t.accept(frame(1), 0)
    t.clear()
    expect(t.accept(frame(1), 10)).not.toBeNull()
    expect(t.accept({ elapsed_time_seconds: 1 }, 0)).toBeNull()
  })
})

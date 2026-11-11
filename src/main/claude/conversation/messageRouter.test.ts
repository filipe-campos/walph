import { describe, expect, it } from 'vitest'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { MessageRouter, initCommandsOf, type RouteOp, type RouterView } from './messageRouter'

const NOW = 1_700_000_000_000
const idle: RouterView = { status: 'idle', hasCrons: false, interruptPending: false }
const working: RouterView = { status: 'working', hasCrons: false, interruptPending: false }

function router(): MessageRouter {
  return new MessageRouter('c1', () => NOW)
}

function sdk(message: Record<string, unknown>): SDKMessage {
  return message as unknown as SDKMessage
}

function emitted(ops: RouteOp[]): Array<Record<string, unknown>> {
  return ops.flatMap((o) => (o.op === 'emit' ? [o.event as unknown as Record<string, unknown>] : []))
}

function result(extra: Record<string, unknown> = {}): SDKMessage {
  return sdk({
    type: 'result',
    subtype: 'success',
    is_error: false,
    total_cost_usd: 0.5,
    duration_ms: 1200,
    result: '',
    ...extra
  })
}

describe('initCommandsOf', () => {
  it('drops malformed entries and fills in what is missing', () => {
    expect(
      initCommandsOf([{ name: 'compact', description: 'x' }, null, { name: '' }, { description: 'no name' }])
    ).toEqual([{ name: 'compact', description: 'x', argumentHint: '' }])
    expect(initCommandsOf('nope')).toEqual([])
  })
})

describe('MessageRouter: turns', () => {
  it('a text delta of the main turn becomes an event; a subagent one is ignored', () => {
    const delta = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }
    const main = router().route(sdk({ type: 'stream_event', parent_tool_use_id: null, event: delta }), working)
    expect(emitted(main)).toEqual([{ type: 'delta', id: 'c1', index: 0, kind: 'text', text: 'hi' }])
    const sub = router().route(sdk({ type: 'stream_event', parent_tool_use_id: 'tool_1', event: delta }), working)
    expect(sub).toEqual([])
  })

  it('the first turn signal with the conversation idle marks it as busy (a turn of the CLI itself)', () => {
    const delta = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'a' } }
    const message = sdk({ type: 'stream_event', parent_tool_use_id: null, event: delta })
    const background = router().route(message, idle)
    expect(background.slice(0, 2)).toEqual([
      { op: 'status', status: 'working' },
      { op: 'emit', event: { type: 'autoTurn', id: 'c1', reason: 'background', timestamp: NOW } }
    ])
    const scheduled = router().route(message, { ...idle, hasCrons: true })
    expect(emitted(scheduled)[0]).toMatchObject({ type: 'autoTurn', reason: 'scheduled' })
    expect(
      router()
        .route(message, working)
        .some((o) => o.op === 'status')
    ).toBe(false)
  })

  it('`result`: ends the turn, emits once and leaves the conversation idle', () => {
    const ops = router().route(result(), working)
    expect(ops).toEqual([
      { op: 'turnEnded' },
      {
        op: 'emit',
        event: { type: 'result', id: 'c1', costUsd: 0.5, durationMs: 1200, isError: false, context: null }
      },
      { op: 'session', input: { type: 'result', isError: false, interrupted: false } },
      { op: 'status', status: 'idle' }
    ])
  })

  it('`result` with a queued turn keeps the conversation working and tells the reducer', () => {
    const ops = router().route(result({ queued_turn_count: 2 }), working)
    expect(ops.some((o) => o.op === 'status')).toBe(false)
    expect(ops.at(-1)).toEqual({ op: 'session', input: { type: 'working' } })
  })

  it('`result` of an interrupted turn carries the mark to the reducer', () => {
    const ops = router().route(result(), { ...working, interruptPending: true })
    expect(ops).toContainEqual({ op: 'session', input: { type: 'result', isError: false, interrupted: true } })
  })
})

describe('MessageRouter: system', () => {
  it('`init` carries session, model and mode; an unknown mode becomes null', () => {
    const init = (permissionMode: string): SDKMessage =>
      sdk({ type: 'system', subtype: 'init', session_id: 's1', model: 'opus', permissionMode })
    expect(router().route(init('plan'), idle)).toEqual([
      { op: 'init', sessionId: 's1', model: 'opus', permissionMode: 'plan' }
    ])
    expect(router().route(init('made-up'), idle)).toEqual([
      { op: 'init', sessionId: 's1', model: 'opus', permissionMode: null }
    ])
  })

  it('`session_state_changed`: idle releases the interrupt deadline; any other state only marks busy', () => {
    expect(router().route(sdk({ type: 'system', subtype: 'session_state_changed', state: 'idle' }), working)).toEqual([
      { op: 'interruptSettled' },
      { op: 'status', status: 'idle' }
    ])
    expect(router().route(sdk({ type: 'system', subtype: 'session_state_changed', state: 'running' }), idle)).toEqual([
      { op: 'status', status: 'working' }
    ])
  })

  it('`commands_changed` only replaces the command base, without an event', () => {
    const ops = router().route(
      sdk({ type: 'system', subtype: 'commands_changed', commands: [{ name: 'skill-x', description: 'd' }] }),
      idle
    )
    expect(ops).toEqual([{ op: 'initCommands', commands: [{ name: 'skill-x', description: 'd', argumentHint: '' }] }])
  })

  it('`background_tasks_changed` carries the normalized set', () => {
    const ops = router().route(sdk({ type: 'system', subtype: 'background_tasks_changed', tasks: [] }), idle)
    expect(ops).toEqual([{ op: 'backgroundTasks', tasks: [] }])
  })

  it('session `model_refusal_fallback` adopts the model, retracts messages and re-emits `init` after the event', () => {
    const ops = router().route(
      sdk({
        type: 'system',
        subtype: 'model_refusal_fallback',
        original_model: 'opus',
        fallback_model: 'sonnet',
        retracted_message_uuids: ['u1']
      }),
      idle
    )
    expect(ops.map((o) => o.op)).toEqual(['adoptModel', 'retract', 'emit', 'emitInit'])
    expect(ops[0]).toEqual({ op: 'adoptModel', model: 'sonnet' })
    expect(ops[1]).toEqual({ op: 'retract', uuids: ['u1'] })
  })

  it('local `model_refusal_fallback` only retracts messages and warns, without switching the model', () => {
    const ops = router().route(
      sdk({
        type: 'system',
        subtype: 'model_refusal_fallback',
        original_model: 'opus',
        fallback_model: 'sonnet',
        scope: 'local'
      }),
      idle
    )
    expect(ops.map((o) => o.op)).toEqual(['emit'])
  })

  it('an unknown subtype produces nothing', () => {
    expect(router().route(sdk({ type: 'system', subtype: 'something_new' }), idle)).toEqual([])
    expect(router().route(sdk({ type: 'system', subtype: 'elicitation_complete' }), idle)).toEqual([])
  })
})

describe('MessageRouter: errors and limits', () => {
  it('an assistant error becomes an `error` event followed by the reducer, without a transcript message', () => {
    const ops = router().route(
      sdk({ type: 'assistant', error: 'authentication_failed', message: { role: 'assistant', content: [] } }),
      working
    )
    expect(ops.map((o) => o.op)).toEqual(['emit', 'session'])
    expect(emitted(ops)[0]).toMatchObject({ type: 'error', id: 'c1' })
    expect(ops[1]).toEqual({ op: 'session', input: { type: 'error' } })
  })

  it('`result` with an authentication error in the text appends the error after the status', () => {
    const ops = router().route(
      result({ is_error: true, subtype: 'success', result: 'Invalid API key · Please run /login' }),
      working
    )
    const kinds = ops.map((o) => o.op)
    expect(kinds.slice(-2)).toEqual(['emit', 'session'])
    expect(emitted(ops).at(-1)).toMatchObject({ type: 'error' })
  })

  it('a repeated `rate_limit_event` only emits the first time', () => {
    const r = router()
    const message = sdk({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed_warning',
        rateLimitType: 'five_hour',
        utilization: 0.9,
        resetsAt: 1_700_000_100
      }
    })
    expect(emitted(r.route(message, idle))).toHaveLength(1)
    expect(r.route(message, idle)).toEqual([])
  })

  it('`prompt_suggestion` only applies with the conversation idle', () => {
    const message = sdk({ type: 'prompt_suggestion', suggestion: 'run the tests' })
    expect(emitted(router().route(message, idle))).toEqual([
      { type: 'promptSuggestion', id: 'c1', suggestion: 'run the tests' }
    ])
    expect(router().route(message, working)).toEqual([])
  })

  it('`tool_progress` is limited to one per second per tool', () => {
    let now = NOW
    const r = new MessageRouter('c1', () => now)
    const message = sdk({ type: 'tool_progress', tool_use_id: 't1', tool_name: 'Bash', elapsed_time_seconds: 1 })
    const later = sdk({ type: 'tool_progress', tool_use_id: 't1', tool_name: 'Bash', elapsed_time_seconds: 2 })
    expect(emitted(r.route(message, working))).toHaveLength(1)
    now += 200
    expect(r.route(later, working)).toEqual([])
    now += 1000
    expect(emitted(r.route(later, working))).toHaveLength(1)
  })
})

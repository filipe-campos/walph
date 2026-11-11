import { describe, expect, it, vi } from 'vitest'
import type { ClaudeEvent, ClaudeMessage, ClaudePermissionRequest } from '@shared/types'
import {
  addQueued,
  bindQueuedUuid,
  createConversation,
  loadStep,
  sendReadiness,
  setUserTitle,
  type ClaudeConversation
} from './claudeConversation'
import { reduceEvent } from './claudeReducer'
import { buildTimeline } from './claudeTimeline'

const base = (): ClaudeConversation =>
  createConversation({ id: 'c1', messages: [], favorite: false }, { permissionMode: 'default', model: '' })

const msg = (over: Partial<ClaudeMessage> & Pick<ClaudeMessage, 'uuid' | 'role' | 'blocks'>): ClaudeMessage => ({
  parentToolUseId: null,
  ...over
})
const apply = (conv: ClaudeConversation, ...events: ClaudeEvent[]): ClaudeConversation =>
  events.reduce(reduceEvent, conv)

describe('reduceEvent', () => {
  it('init fills in commands, models and session', () => {
    const conv = apply(base(), {
      type: 'init',
      id: 'c1',
      sessionId: 's1',
      model: 'opus',
      permissionMode: 'plan',
      commands: [{ name: 'compact', description: '', argumentHint: '', scope: 'builtin' }],
      models: []
    })
    expect(conv).toMatchObject({ ready: true, sessionId: 's1', model: 'opus', permissionMode: 'plan' })
    expect(conv.commands).toHaveLength(1)
  })

  it('deltas accumulate per block and the complete message replaces them', () => {
    let conv = apply(
      base(),
      { type: 'status', id: 'c1', status: 'working' },
      { type: 'delta', id: 'c1', index: 0, kind: 'thinking', text: 'pen' },
      { type: 'delta', id: 'c1', index: 0, kind: 'thinking', text: 'so' },
      { type: 'delta', id: 'c1', index: 1, kind: 'text', text: 'Hello' }
    )
    expect(conv.streaming).toEqual([
      { index: 0, kind: 'thinking', text: 'penso' },
      { index: 1, kind: 'text', text: 'Hello' }
    ])
    conv = apply(conv, {
      type: 'message',
      id: 'c1',
      message: msg({ uuid: 'a1', role: 'assistant', blocks: [{ type: 'text', text: 'Hello!' }] })
    })
    // The text left the streaming; the ongoing reasoning goes on.
    expect(conv.streaming).toEqual([{ index: 0, kind: 'thinking', text: 'penso' }])
    expect(conv.messages).toHaveLength(1)
  })

  it('a message with only a tool ends the streaming, and so does idle status', () => {
    let conv = apply(
      base(),
      { type: 'delta', id: 'c1', index: 0, kind: 'thinking', text: 'x' },
      {
        type: 'message',
        id: 'c1',
        message: msg({
          uuid: 'a1',
          role: 'assistant',
          blocks: [{ type: 'toolUse', toolUseId: 't', name: 'Bash', input: {} }]
        })
      }
    )
    expect(conv.streaming).toEqual([])
    conv = apply(
      conv,
      { type: 'delta', id: 'c1', index: 0, kind: 'text', text: 'y' },
      { type: 'status', id: 'c1', status: 'idle' }
    )
    expect(conv.streaming).toEqual([])
  })

  it('a repeated message is replaced by uuid', () => {
    const m1 = msg({ uuid: 'a1', role: 'assistant', blocks: [{ type: 'text', text: 'a' }] })
    const m2 = { ...m1, blocks: [{ type: 'text', text: 'ab' } as const] }
    const conv = apply(base(), { type: 'message', id: 'c1', message: m1 }, { type: 'message', id: 'c1', message: m2 })
    expect(conv.messages).toEqual([m2])
  })

  it('permissions come in without duplicates and leave on cancel', () => {
    const request: ClaudePermissionRequest = { kind: 'plan', requestId: 'r1', plan: '# p' }
    let conv = apply(base(), { type: 'permission', id: 'c1', request }, { type: 'permission', id: 'c1', request })
    expect(conv.permissions).toHaveLength(1)
    conv = apply(conv, { type: 'permissionCancelled', id: 'c1', requestId: 'r1' })
    expect(conv.permissions).toEqual([])
  })

  it('result keeps the previous context when it comes null; an empty title is ignored', () => {
    const usage = { usedTokens: 1, maxTokens: 10, percentage: 10 }
    let conv = apply(base(), { type: 'result', id: 'c1', costUsd: 0.5, durationMs: 1, isError: false, context: usage })
    conv = apply(conv, { type: 'result', id: 'c1', costUsd: 0.7, durationMs: 1, isError: false, context: null })
    expect(conv).toMatchObject({ costUsd: 0.7, context: usage })
    conv = apply(conv, { type: 'title', id: 'c1', title: 'Corrigir bug' }, { type: 'title', id: 'c1', title: '  ' })
    expect(conv.title).toBe('Corrigir bug')
  })

  it('error and permissionMode', () => {
    const conv = apply(
      base(),
      { type: 'error', id: 'c1', error: { code: 'auth', message: 'not logged in' } },
      { type: 'permissionMode', id: 'c1', mode: 'acceptEdits' }
    )
    expect(conv.error?.code).toBe('auth')
    expect(conv.permissionMode).toBe('acceptEdits')
  })
})

describe('message queue', () => {
  const item = { key: 'k1', text: 'oi', imageCount: 0, uuid: null }
  const echo = (uuid: string, text: string): ClaudeEvent => ({
    type: 'message',
    id: 'c1',
    message: msg({ uuid, role: 'user', blocks: [{ type: 'text', text }], checkpoint: true })
  })

  it('the echo removes from the queue by uuid', () => {
    let conv = addQueued(base(), item)
    conv = bindQueuedUuid(conv, 'k1', 'u1')
    expect(conv.queued[0].uuid).toBe('u1')
    conv = apply(conv, echo('u1', 'oi'))
    expect(conv.queued).toEqual([])
  })

  it('an echo before send replies matches by text', () => {
    let conv = addQueued(base(), item)
    conv = apply(conv, echo('u1', 'oi'))
    expect(conv.queued).toEqual([])
  })

  it('send replying after the echo does not leave a stuck item', () => {
    let conv = apply(base(), echo('u1', 'outro'))
    conv = addQueued(conv, item)
    conv = bindQueuedUuid(conv, 'k1', 'u1')
    expect(conv.queued).toEqual([])
  })
})

describe('messages waiting for the turn', () => {
  const echo = (uuid: string, text: string): ClaudeEvent => ({
    type: 'message',
    id: 'c1',
    message: msg({ uuid, role: 'user', blocks: [{ type: 'text', text }], checkpoint: true })
  })
  const result: ClaudeEvent = { type: 'result', id: 'c1', costUsd: 0, durationMs: 1, isError: false, context: null }

  it('an echo with Claude idle does not go into the queue; with it working, it does', () => {
    let conv = apply(base(), { type: 'status', id: 'c1', status: 'idle' }, echo('u1', 'one'))
    expect(conv.waiting).toEqual([])
    conv = apply(conv, { type: 'status', id: 'c1', status: 'working' }, echo('u2', 'two'), echo('u3', 'three'))
    expect(conv.waiting).toEqual(['u2', 'u3'])
    // A repeated echo (same uuid) does not duplicate.
    expect(apply(conv, echo('u2', 'two')).waiting).toEqual(['u2', 'u3'])
  })

  it('subagent messages or those without a checkpoint do not count', () => {
    const conv = apply(
      base(),
      { type: 'status', id: 'c1', status: 'working' },
      {
        type: 'message',
        id: 'c1',
        message: msg({ uuid: 'x', role: 'user', blocks: [{ type: 'text', text: 'r' }] })
      }
    )
    expect(conv.waiting).toEqual([])
  })

  it('they leave one per finished turn and all when Claude goes idle', () => {
    let conv = apply(base(), { type: 'status', id: 'c1', status: 'working' }, echo('u1', 'a'), echo('u2', 'b'))
    conv = apply(conv, result)
    expect(conv.waiting).toEqual(['u2'])
    conv = apply(conv, { type: 'status', id: 'c1', status: 'idle' })
    expect(conv.waiting).toEqual([])
  })

  it('result + queued turn: the partial of turn 1 does not stick to the deltas of turn 2', () => {
    let conv = apply(
      base(),
      { type: 'status', id: 'c1', status: 'working' },
      { type: 'delta', id: 'c1', index: 0, kind: 'text', text: 'parcial 1' },
      echo('u2', 'next'),
      result,
      { type: 'delta', id: 'c1', index: 0, kind: 'text', text: 'reply 2' }
    )
    expect(conv.messages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(conv.messages.find((m) => m.role === 'assistant')?.blocks).toEqual([{ type: 'text', text: 'parcial 1' }])
    expect(conv.streaming).toEqual([{ index: 0, kind: 'text', text: 'reply 2' }])
    expect(conv.waiting).toEqual([])
    conv = apply(conv, { type: 'status', id: 'c1', status: 'idle' })
    expect(conv.messages.filter((m) => m.role === 'assistant')).toHaveLength(2)
  })
})

describe('reduceEvent - gaps', () => {
  it('assistant messages per block (distinct uuids) stay in order and the streaming follows', () => {
    const conv = apply(
      base(),
      { type: 'status', id: 'c1', status: 'working' },
      { type: 'delta', id: 'c1', index: 0, kind: 'thinking', text: 'hmm' },
      {
        type: 'message',
        id: 'c1',
        message: msg({ uuid: 'a1', role: 'assistant', blocks: [{ type: 'thinking', text: 'hmm' }] })
      },
      { type: 'delta', id: 'c1', index: 1, kind: 'text', text: 'Vou' },
      {
        type: 'message',
        id: 'c1',
        message: msg({ uuid: 'a2', role: 'assistant', blocks: [{ type: 'text', text: 'Vou ler' }] })
      },
      {
        type: 'message',
        id: 'c1',
        message: msg({
          uuid: 'a3',
          role: 'assistant',
          blocks: [{ type: 'toolUse', toolUseId: 't1', name: 'Read', input: {} }]
        })
      }
    )
    expect(conv.messages.map((m) => m.uuid)).toEqual(['a1', 'a2', 'a3'])
    expect(conv.streaming).toEqual([])
  })

  it('a duplicated init (from the system and from startup) neither loses commands nor duplicates the conversation', () => {
    const first: ClaudeEvent = {
      type: 'init',
      id: 'c1',
      sessionId: 's1',
      model: 'm',
      permissionMode: 'default',
      commands: [{ name: 'compact', description: '', argumentHint: '', scope: 'builtin' }],
      models: []
    }
    let conv = apply(base(), first, { ...first, sessionId: 's2', model: 'opus' })
    expect(conv).toMatchObject({ ready: true, sessionId: 's2', model: 'opus' })
    expect(conv.commands).toHaveLength(1)
    expect(conv.messages).toEqual([])
    // Does a late init not erase a newer error? Documents the behavior: init clears the previous error.
    conv = apply(conv, { type: 'error', id: 'c1', error: { code: 'auth', message: 'x' } })
    expect(conv.error).not.toBeNull()
    conv = apply(conv, { ...first, sessionId: 's2' })
    expect(conv.error).toBeNull()
  })
})

describe('turn ended with partial text', () => {
  it('idle status turns the remaining streaming into a local message', () => {
    const conv = apply(
      base(),
      { type: 'status', id: 'c1', status: 'working' },
      { type: 'delta', id: 'c1', index: 1, kind: 'text', text: 'reply' },
      { type: 'delta', id: 'c1', index: 0, kind: 'thinking', text: 'hum' },
      { type: 'status', id: 'c1', status: 'idle' }
    )
    expect(conv.streaming).toEqual([])
    expect(conv.messages).toHaveLength(1)
    expect(conv.messages[0]).toMatchObject({
      role: 'assistant',
      blocks: [
        { type: 'thinking', text: 'hum' },
        { type: 'text', text: 'reply' }
      ]
    })
  })
})

describe('user title', () => {
  it('the automatic title does not overwrite the user one, but is kept', () => {
    let conv = setUserTitle(base(), 'Pix at checkout')
    conv = reduceEvent(conv, { type: 'title', id: 'c1', title: 'Corrigir bug' })
    expect(conv.title).toBe('Pix at checkout')
    expect(conv.autoTitle).toBe('Corrigir bug')
    // Empty = back to the automatic one.
    conv = setUserTitle(conv, null)
    expect(conv).toMatchObject({ userTitle: null, title: 'Corrigir bug' })
  })

  it('on resume: userTitle locks the title; without it the title is the automatic one and accepts new events', () => {
    const opts = { permissionMode: 'default', model: '' } as const
    const named = createConversation({ id: 'c2', messages: [], title: 'Pix', userTitle: 'Pix', favorite: true }, opts)
    expect(named).toMatchObject({ title: 'Pix', userTitle: 'Pix', autoTitle: null, favorite: true })
    expect(reduceEvent(named, { type: 'title', id: 'c2', title: 'Other' }).title).toBe('Pix')
    const auto = createConversation({ id: 'c3', messages: [], title: 'Auto', favorite: false }, opts)
    expect(auto).toMatchObject({ title: 'Auto', userTitle: null, autoTitle: 'Auto' })
    expect(reduceEvent(auto, { type: 'title', id: 'c3', title: 'Novo' }).title).toBe('Novo')
  })
})

describe('background tasks', () => {
  const agent = { id: 'a1', kind: 'agent' as const, description: 'Pacote 3.1', agentType: 'backend-developer' }
  const shell = { id: 's1', kind: 'shell' as const, description: 'npm test', agentType: null }

  it('backgroundTasks replaces the list; closed clears, idle keeps', () => {
    let conv = apply(base(), { type: 'backgroundTasks', id: 'c1', tasks: [agent, shell] })
    expect(conv.background).toEqual([agent, shell])
    conv = apply(conv, { type: 'status', id: 'c1', status: 'idle' })
    expect(conv.background).toHaveLength(2)
    conv = apply(conv, { type: 'backgroundTasks', id: 'c1', tasks: [shell] })
    expect(conv.background).toEqual([shell])
    expect(apply(conv, { type: 'status', id: 'c1', status: 'closed' }).background).toEqual([])
  })
})

describe('turn duration', () => {
  it('result keeps the duration and a new turn resets it', () => {
    let conv = apply(base(), { type: 'status', id: 'c1', status: 'working' })
    conv = apply(conv, { type: 'result', id: 'c1', costUsd: 0.1, durationMs: 4200, isError: false, context: null })
    expect(conv.lastTurnMs).toBe(4200)
    conv = apply(conv, { type: 'status', id: 'c1', status: 'working' })
    expect(conv.lastTurnMs).toBeNull()
  })
})

describe('ephemeral panel events', () => {
  const progress = {
    taskId: 't1',
    toolUseId: 'u1',
    summary: 'Lendo arquivos',
    totalTokens: 1200,
    toolUses: 3,
    durationMs: 5000,
    lastToolName: 'Read'
  }
  const limit = { status: 'warning', window: 'five_hour', percent: 82, resetsAt: 1000, usingOverage: false } as const
  const retry: ClaudeEvent = {
    type: 'retry',
    id: 'c1',
    attempt: 2,
    maxRetries: 10,
    delayMs: 8000,
    errorStatus: 529,
    timestamp: 5
  }
  const delta: ClaudeEvent = { type: 'delta', id: 'c1', index: 0, kind: 'text', text: 'oi' }

  it('rateLimit keeps warning/rejected, allowed clears and a repeat keeps the reference', () => {
    let conv = apply(base(), { type: 'rateLimit', id: 'c1', limit })
    expect(conv.rateLimit).toEqual(limit)
    const same = apply(conv, { type: 'rateLimit', id: 'c1', limit: { ...limit } })
    expect(same).toBe(conv)
    conv = apply(conv, { type: 'rateLimit', id: 'c1', limit: { ...limit, status: 'allowed' } })
    expect(conv.rateLimit).toBeNull()
    const idle = base()
    expect(apply(idle, { type: 'rateLimit', id: 'c1', limit: { ...limit, status: 'allowed' } })).toBe(idle)
  })

  it('retry disappears on delta, message, result and idle/closed status (not on working)', () => {
    const withRetry = apply(base(), retry)
    expect(withRetry.retry).toMatchObject({ attempt: 2, maxRetries: 10, delayMs: 8000, errorStatus: 529 })
    expect(apply(withRetry, delta).retry).toBeNull()
    const message: ClaudeEvent = {
      type: 'message',
      id: 'c1',
      message: msg({ uuid: 'a1', role: 'assistant', blocks: [{ type: 'text', text: 'x' }] })
    }
    expect(apply(withRetry, message).retry).toBeNull()
    const result: ClaudeEvent = { type: 'result', id: 'c1', costUsd: 0, durationMs: 1, isError: false, context: null }
    expect(apply(withRetry, result).retry).toBeNull()
    expect(apply(withRetry, { type: 'status', id: 'c1', status: 'idle' }).retry).toBeNull()
    expect(apply(withRetry, { type: 'status', id: 'c1', status: 'closed' }).retry).toBeNull()
    expect(apply(withRetry, { type: 'status', id: 'c1', status: 'working' }).retry).not.toBeNull()
  })

  it('permissionDenied becomes a notice in the timeline, once per call', () => {
    const denied: ClaudeEvent = {
      type: 'permissionDenied',
      id: 'c1',
      toolUseId: 'u1',
      toolName: 'Bash',
      reason: 'rm -rf bloqueado',
      timestamp: 9
    }
    let conv = apply(base(), { type: 'message', id: 'c1', message: msg({ uuid: 'm0', role: 'user', blocks: [] }) })
    conv = apply(conv, denied)
    expect(apply(conv, denied)).toBe(conv)
    expect(buildTimeline(conv.messages, conv.notes).at(-1)).toMatchObject({
      type: 'denied',
      toolUseId: 'u1',
      toolName: 'Bash',
      reason: 'rm -rf bloqueado'
    })
  })

  it('taskProgress: the last wins, without toolUseId it is ignored, equal keeps the reference', () => {
    const conv = apply(base(), { type: 'taskProgress', id: 'c1', progress })
    expect(conv.taskProgress.u1.summary).toBe('Lendo arquivos')
    expect(apply(conv, { type: 'taskProgress', id: 'c1', progress: { ...progress } })).toBe(conv)
    const newer = apply(conv, { type: 'taskProgress', id: 'c1', progress: { ...progress, toolUses: 4 } })
    expect(newer.taskProgress.u1.toolUses).toBe(4)
    const idle = base()
    expect(apply(idle, { type: 'taskProgress', id: 'c1', progress: { ...progress, toolUseId: null } })).toBe(idle)
  })

  it('taskProgress and toolElapsed reset when a new turn starts, not within the same one', () => {
    let conv = apply(
      base(),
      { type: 'taskProgress', id: 'c1', progress },
      { type: 'toolProgress', id: 'c1', toolUseId: 'u1', elapsedSeconds: 3 }
    )
    conv = apply(conv, { type: 'status', id: 'c1', status: 'working' })
    expect(conv.taskProgress).toEqual({})
    conv = apply(
      conv,
      { type: 'taskProgress', id: 'c1', progress },
      { type: 'toolProgress', id: 'c1', toolUseId: 'u1', elapsedSeconds: 4 },
      { type: 'status', id: 'c1', status: 'working' }
    )
    expect(conv.taskProgress.u1).toBeDefined()
    expect(conv.toolElapsed.u1).toBe(4)
  })

  it('promptSuggestion disappears on turn start, on delta and on queuing a send', () => {
    const conv = apply(base(), { type: 'promptSuggestion', id: 'c1', suggestion: 'run the tests' })
    expect(conv.suggestion).toBe('run the tests')
    expect(apply(conv, { type: 'promptSuggestion', id: 'c1', suggestion: 'run the tests' })).toBe(conv)
    expect(apply(conv, { type: 'status', id: 'c1', status: 'working' }).suggestion).toBeNull()
    expect(apply(conv, delta).suggestion).toBeNull()
    expect(addQueued(conv, { key: 'q', text: 'x', imageCount: 0, uuid: null }).suggestion).toBeNull()
    expect(
      apply(conv, { type: 'result', id: 'c1', costUsd: 0, durationMs: 1, isError: false, context: null })
    ).toMatchObject({
      suggestion: 'run the tests'
    })
  })

  it('toolProgress keeps the seconds and the tool result removes the entry', () => {
    let conv = apply(base(), { type: 'toolProgress', id: 'c1', toolUseId: 'u1', elapsedSeconds: 42 })
    expect(conv.toolElapsed).toEqual({ u1: 42 })
    expect(apply(conv, { type: 'toolProgress', id: 'c1', toolUseId: 'u1', elapsedSeconds: 42 })).toBe(conv)
    const other = msg({
      uuid: 'r0',
      role: 'user',
      blocks: [{ type: 'toolResult', toolUseId: 'zz', content: '', isError: false }]
    })
    const kept = apply(conv, { type: 'message', id: 'c1', message: other })
    expect(kept.toolElapsed).toBe(conv.toolElapsed)
    const done = msg({
      uuid: 'r1',
      role: 'user',
      blocks: [{ type: 'toolResult', toolUseId: 'u1', content: 'ok', isError: false }]
    })
    conv = apply(conv, { type: 'message', id: 'c1', message: done })
    expect(conv.toolElapsed).toEqual({})
  })

  it('modelFallback removes the retracted messages (idempotent) and adjusts the notices', () => {
    const user = msg({ uuid: 'u', role: 'user', blocks: [{ type: 'text', text: 'oi' }] })
    const a1 = msg({ uuid: 'a1', role: 'assistant', blocks: [{ type: 'text', text: 'recusa' }] })
    const a2 = msg({ uuid: 'a2', role: 'assistant', blocks: [{ type: 'text', text: 'ok' }] })
    let conv = apply(
      base(),
      ...[user, a1, a2].map((message): ClaudeEvent => ({ type: 'message', id: 'c1', message })),
      { type: 'compacted', id: 'c1', trigger: 'auto', preTokens: null, timestamp: 1 }
    )
    const fallback: ClaudeEvent = {
      type: 'modelFallback',
      id: 'c1',
      from: 'a',
      to: 'b',
      scope: 'session',
      retracted: ['a1', 'inexistente']
    }
    conv = apply(conv, fallback)
    expect(conv.messages.map((m) => m.uuid)).toEqual(['u', 'a2'])
    expect(conv.notes[0].at).toBe(2)
    expect(apply(conv, fallback)).toBe(conv)
    const untouched = base()
    expect(apply(untouched, { ...fallback, retracted: [] })).toBe(untouched)
  })
})

describe('conversation loading', () => {
  const init = (): Extract<ClaudeEvent, { type: 'init' }> => ({
    type: 'init',
    id: 'c1',
    sessionId: 's1',
    model: 'opus',
    permissionMode: 'default',
    commands: [],
    models: [],
    account: { email: 'a@x.com', subscriptionType: 'max' }
  })

  it('waits for init and then mcpReady', () => {
    let conv = base()
    expect(loadStep(conv)).toBe('init')
    conv = apply(conv, init())
    expect(loadStep(conv)).toBe('mcp')
    expect(conv.account).toEqual({ email: 'a@x.com', subscriptionType: 'max' })
    conv = apply(conv, { type: 'mcpReady', id: 'c1', timedOut: false })
    expect(loadStep(conv)).toBeNull()
  })

  it('mcpReady before init also ends at the end', () => {
    const conv = apply(base(), { type: 'mcpReady', id: 'c1', timedOut: true }, init())
    expect(loadStep(conv)).toBeNull()
  })

  it('a new process (starting status) goes back to waiting', () => {
    let conv = apply(base(), init(), { type: 'mcpReady', id: 'c1', timedOut: false })
    conv = apply(conv, { type: 'status', id: 'c1', status: 'starting' })
    expect(loadStep(conv)).toBe('init')
  })

  it('an error or closed conversation does not keep spinning; init without an account keeps the previous one', () => {
    expect(loadStep(apply(base(), { type: 'error', id: 'c1', error: { code: 'auth', message: 'x' } }))).toBeNull()
    expect(loadStep(apply(base(), { type: 'status', id: 'c1', status: 'closed' }))).toBeNull()
    const { account: _account, ...withoutAccount } = init()
    const kept = apply(apply(base(), init()), withoutAccount)
    expect(kept.account?.email).toBe('a@x.com')
  })
})

describe('turnStartedAt', () => {
  const working: ClaudeEvent = { type: 'status', id: 'c1', status: 'working' }
  const idle: ClaudeEvent = { type: 'status', id: 'c1', status: 'idle' }
  const result: ClaudeEvent = { type: 'result', id: 'c1', costUsd: 0, durationMs: 5, isError: false, context: null }

  it('records the start when it starts working and does not move it while the turn goes on', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1000)
      let conv = apply(base(), working)
      expect(conv.turnStartedAt).toBe(1000)
      vi.setSystemTime(5000)
      conv = apply(conv, working)
      expect(conv.turnStartedAt).toBe(1000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets at the end of the turn, on error and on close', () => {
    for (const end of [idle, result, { type: 'status', id: 'c1', status: 'closed' } as const]) {
      expect(apply(base(), working, end).turnStartedAt).toBeNull()
    }
    expect(
      apply(base(), working, { type: 'error', id: 'c1', error: { code: 'other', message: 'x' } }).turnStartedAt
    ).toBeNull()
  })

  it('the result with a queued message opens the next turn', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(2000)
      const echo = (uuid: string): ClaudeEvent => ({
        type: 'message',
        id: 'c1',
        message: msg({ uuid, role: 'user', blocks: [{ type: 'text', text: uuid }], checkpoint: true })
      })
      let conv = apply(base(), working, echo('u1'), echo('u2'))
      vi.setSystemTime(9000)
      conv = apply(conv, result)
      expect(conv.turnStartedAt).toBe(9000)
      // u1 finished: u2 (the last of the queue) starts running.
      vi.setSystemTime(12_000)
      conv = apply(conv, result)
      expect(conv.turnStartedAt).toBe(12_000)
      conv = apply(conv, result)
      expect(conv.turnStartedAt).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sendReadiness', () => {
  it('pending while loading, ready after init and MCP', () => {
    const conv = base()
    expect(sendReadiness(conv)).toBe('pending')
    expect(sendReadiness({ ...conv, ready: true, mcpReady: true })).toBe('ready')
  })

  it('failed if it vanished, closed, errored or the dormant tab did not wake', () => {
    const ready = { ...base(), ready: true, mcpReady: true }
    expect(sendReadiness(undefined)).toBe('failed')
    expect(sendReadiness({ ...ready, status: 'closed' })).toBe('failed')
    expect(sendReadiness({ ...base(), error: { code: 'other', message: 'x' } })).toBe('failed')
    expect(sendReadiness({ ...base(), dormant: true, wakeState: 'failed' })).toBe('failed')
    expect(sendReadiness({ ...base(), dormant: true })).toBe('pending')
  })
})

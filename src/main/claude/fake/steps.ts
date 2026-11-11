// Steps of the fake SDK script (format in `script.ts`): one handler per step type.

import { randomUUID } from 'node:crypto'
import type {
  CanUseTool,
  OnElicitation,
  PermissionResult,
  PermissionUpdate,
  SDKMessage
} from '@anthropic-ai/claude-agent-sdk'
import { allowRulesOf } from '../localPermissions'
import type { FakeCallLog } from './callLog'
import type { FakeStep } from './script'

/**
 * `next` continues the turn; `stop` ends it (interrupted/denied: the `result` is missing); `done` already emitted the
 * `result`; `failed` broke the iterator.
 */
export type StepOutcome = 'next' | 'stop' | 'done' | 'failed'

/** SDK messages are huge types; the fake only needs the shape the normalizer consumes. */
export const msg = (value: Record<string, unknown>): SDKMessage => value as unknown as SDKMessage

export interface StepCtx {
  sessionId: string
  /** `query()` options the steps use. */
  canUseTool?: CanUseTool | undefined
  onElicitation?: OnElicitation | undefined
  /** Start of the current turn (ms), for the `result` `duration_ms`. */
  started: number
  log: FakeCallLog
  out: { push(message: SDKMessage): void; fail(err: Error): void }
  /** Session closed or turn interrupted. */
  halted(): boolean
  signal(): AbortSignal
  wait(ms: number): Promise<void>
  base: { session_id: string; parent_tool_use_id: null }
  assistant(content: unknown[], extra?: Record<string, unknown>): SDKMessage
  toolResult(toolUseId: string, content?: string, isError?: boolean, parentToolUseId?: string | null): SDKMessage
  say(text: string): void
  alreadyAllowed(suggestions: PermissionUpdate[]): boolean
  rememberAllowed(rules: string[]): void
  emitResult(isError: boolean, text: string, costUsd: number, started: number): void
}

type StepKey = FakeStep extends infer S ? (S extends unknown ? keyof S : never) : never
type StepArg<K extends StepKey> = Extract<FakeStep, Record<K, unknown>>[K]
type StepHandler<K extends StepKey> = (arg: StepArg<K>, ctx: StepCtx) => StepOutcome | Promise<StepOutcome>

const STEP_HANDLERS: { [K in StepKey]: StepHandler<K> } = {
  assistant: (text, ctx) => {
    ctx.say(text)
    return 'next'
  },
  commandOutput: (text, ctx) => {
    ctx.out.push(
      msg({
        type: 'user',
        uuid: randomUUID(),
        ...ctx.base,
        parent_tool_use_id: null,
        message: { role: 'user', content: `<local-command-stdout>${text}</local-command-stdout>` }
      })
    )
    return 'next'
  },
  compactBoundary: (c, ctx) => {
    ctx.out.push(
      msg({
        type: 'system',
        subtype: 'compact_boundary',
        uuid: randomUUID(),
        ...ctx.base,
        compact_metadata: {
          trigger: c.trigger,
          ...(c.preTokens !== undefined ? { pre_tokens: c.preTokens } : {})
        }
      })
    )
    return 'next'
  },
  delay: async (ms, ctx): Promise<StepOutcome> => {
    await ctx.wait(ms)
    return 'next'
  },
  assistantError: (text, ctx) => {
    ctx.out.push(ctx.assistant([{ type: 'text', text }], { error: text }))
    return 'next'
  },
  toolCall: ({ id, name, input, parentToolUseId }, ctx) => {
    ctx.out.push(ctx.assistant([{ type: 'tool_use', id, name, input }], { parent_tool_use_id: parentToolUseId }))
    return 'next'
  },
  toolResult: ({ id, content, isError, parentToolUseId }, ctx) => {
    ctx.out.push(ctx.toolResult(id, content, isError, parentToolUseId))
    return 'next'
  },
  subagentMessage: ({ parentToolUseId, text }, ctx) => {
    ctx.out.push(ctx.assistant([{ type: 'text', text }], { parent_tool_use_id: parentToolUseId }))
    return 'next'
  },
  toolUse: ({ name, input }, ctx) => {
    const id = `toolu_${randomUUID()}`
    ctx.out.push(ctx.assistant([{ type: 'tool_use', id, name, input }]))
    ctx.out.push(ctx.toolResult(id))
    return 'next'
  },
  permission: async ({ toolName, input, suggestions: raw }, ctx) => {
    const suggestions = (raw ?? []) as PermissionUpdate[]
    const id = `toolu_${randomUUID()}`
    const decision: PermissionResult | null =
      ctx.canUseTool && !ctx.alreadyAllowed(suggestions)
        ? await ctx.canUseTool(toolName, input, {
            signal: ctx.signal(),
            toolUseID: id,
            requestId: id,
            ...(suggestions.length > 0 ? { suggestions } : {})
          })
        : { behavior: 'allow', updatedInput: input }
    if (ctx.halted()) return 'stop'
    if (decision?.behavior === 'deny' && decision.interrupt) return 'stop'
    if (decision?.behavior === 'allow') ctx.rememberAllowed(allowRulesOf(decision.updatedPermissions))
    ctx.out.push(ctx.assistant([{ type: 'tool_use', id, name: toolName, input }]))
    ctx.out.push(ctx.toolResult(id))
    return 'next'
  },
  question: async ({ questions }, ctx) => {
    const input = { questions }
    const id = `toolu_${randomUUID()}`
    const decision: PermissionResult | null = ctx.canUseTool
      ? await ctx.canUseTool('AskUserQuestion', input, { signal: ctx.signal(), toolUseID: id, requestId: id })
      : { behavior: 'deny', message: 'no canUseTool' }
    if (ctx.halted()) return 'stop'
    if (decision?.behavior === 'deny' && decision.interrupt) return 'stop'
    ctx.out.push(ctx.assistant([{ type: 'tool_use', id, name: 'AskUserQuestion', input }]))
    ctx.out.push(ctx.toolResult(id))
    if (decision?.behavior === 'allow') {
      const answers = decision.updatedInput?.answers
      ctx.say(`Answers: ${JSON.stringify(answers)}`)
    } else ctx.say(`Skipped: ${decision?.behavior === 'deny' ? decision.message : ''}`)
    return 'next'
  },
  elicitation: async (raw, ctx) => {
    const request = { serverName: 'fake', message: '', ...raw }
    const result = ctx.onElicitation
      ? await ctx.onElicitation(request, {
          signal: ctx.signal(),
          requestId: `elicit_${randomUUID()}`
        })
      : null
    ctx.log({ type: 'elicitation', request, result })
    if (ctx.halted()) return 'stop'
    if (result?.action === 'cancel' || result === null) return 'stop'
    return 'next'
  },
  rateLimit: (info, ctx) => {
    ctx.out.push(
      msg({ type: 'rate_limit_event', rate_limit_info: info, uuid: randomUUID(), session_id: ctx.sessionId })
    )
    return 'next'
  },
  apiRetry: (r, ctx) => {
    ctx.out.push(
      msg({
        type: 'system',
        subtype: 'api_retry',
        attempt: r.attempt,
        max_retries: r.maxRetries,
        retry_delay_ms: r.delayMs,
        error_status: r.errorStatus,
        error: 'server_error',
        uuid: randomUUID(),
        session_id: ctx.sessionId
      })
    )
    return 'next'
  },
  permissionDenied: (r, ctx) => {
    ctx.out.push(
      msg({
        type: 'system',
        subtype: 'permission_denied',
        tool_name: r.toolName,
        tool_use_id: r.toolUseId,
        decision_reason: r.reason,
        message: `Permission to use ${r.toolName} was denied.`,
        uuid: randomUUID(),
        session_id: ctx.sessionId
      })
    )
    return 'next'
  },
  taskProgress: (r, ctx) => {
    ctx.out.push(
      msg({
        type: 'system',
        subtype: 'task_progress',
        task_id: r.taskId,
        ...(typeof r.toolUseId === 'string' ? { tool_use_id: r.toolUseId } : {}),
        description: 'Subagent',
        usage: {
          total_tokens: typeof r.totalTokens === 'number' ? r.totalTokens : 0,
          tool_uses: typeof r.toolUses === 'number' ? r.toolUses : 0,
          duration_ms: typeof r.durationMs === 'number' ? r.durationMs : 0
        },
        ...(typeof r.lastToolName === 'string' ? { last_tool_name: r.lastToolName } : {}),
        ...(typeof r.summary === 'string' ? { summary: r.summary } : {}),
        uuid: randomUUID(),
        session_id: ctx.sessionId
      })
    )
    return 'next'
  },
  // Comes out after the `result` (see `runTurn`).
  promptSuggestion: () => 'next',
  toolProgress: (r, ctx) => {
    ctx.out.push(
      msg({
        type: 'tool_progress',
        tool_use_id: r.toolUseId,
        tool_name: r.toolName,
        parent_tool_use_id: null,
        elapsed_time_seconds: r.elapsedSeconds,
        ...(r.heartbeat ? { heartbeat: true } : {}),
        uuid: randomUUID(),
        session_id: ctx.sessionId
      })
    )
    return 'next'
  },
  commandsChanged: (commands, ctx) => {
    ctx.out.push(
      msg({ type: 'system', subtype: 'commands_changed', commands, uuid: randomUUID(), session_id: ctx.sessionId })
    )
    return 'next'
  },
  modelRefusalFallback: (r, ctx) => {
    ctx.out.push(
      msg({
        type: 'system',
        subtype: 'model_refusal_fallback',
        trigger: 'refusal',
        direction: 'retry',
        scope: r.scope,
        original_model: r.from,
        fallback_model: r.to,
        request_id: null,
        retracted_message_uuids: r.retracted,
        content: `Falling back from ${r.from} to ${r.to}`,
        uuid: randomUUID(),
        session_id: ctx.sessionId
      })
    )
    return 'next'
  },
  error: (message, ctx) => {
    ctx.out.fail(new Error(message))
    return 'failed'
  },
  result: (r, ctx) => {
    ctx.emitResult(r.isError, r.text, r.costUsd, ctx.started)
    return 'done'
  }
}

/** Runs a step by its type (the object's only key). */
export async function runFakeStep(step: FakeStep, ctx: StepCtx): Promise<StepOutcome> {
  if (ctx.halted()) return 'stop'
  const key = Object.keys(step)[0] as StepKey | undefined
  const handler =
    key === undefined
      ? undefined
      : (STEP_HANDLERS[key] as ((arg: unknown, ctx: StepCtx) => StepOutcome | Promise<StepOutcome>) | undefined)
  if (key === undefined || !handler) {
    ctx.out.fail(new Error(`unknown step "${String(key)}"`))
    return 'failed'
  }
  return handler((step as Record<string, unknown>)[key], ctx)
}

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { isClaudePermissionMode } from '@shared/claudeModes'
import type {
  ClaudeBackgroundTask,
  ClaudeConversationStatus,
  ClaudeError,
  ClaudeEvent,
  ClaudeMessage,
  ClaudePermissionMode,
  ClaudeRateLimit
} from '@shared/types'
import { normalizeBackgroundTasks } from '../backgroundTasks'
import { cleanCommandText, extractCommandOutput, parseCompactMetadata } from '../commandOutput'
import { classifyAssistantError, classifyResultText } from '../errors'
import { normalizeMessage, streamDelta } from '../normalizeMessage'
import { normalizeRateLimit, sameRateLimit } from '../rateLimit'
import {
  ToolProgressThrottle,
  normalizeModelFallback,
  normalizePermissionDenied,
  normalizeRetry,
  normalizeSuggestion,
  normalizeTaskProgress
} from '../sdkEvents'
import { asRecord, isUntypedSystem } from '../sdkTypes'
import type { SessionInput } from '../sessionStatus'

export interface InitCommand {
  name: string
  description: string
  argumentHint: string
}

/**
 * What the router decides for an SDK message, in the order the conversation must apply it. Events and state changes
 * stay together in a single list because the order between them is observable by the renderer.
 */
export type RouteOp =
  | { op: 'emit'; event: ClaudeEvent }
  | { op: 'status'; status: ClaudeConversationStatus }
  | { op: 'session'; input: SessionInput }
  /** Goes into the transcript and becomes the `message` event. */
  | { op: 'message'; message: ClaudeMessage }
  /** CLI `init`: reported session, model and mode (`permissionMode` null = unknown value, ignored). */
  | { op: 'init'; sessionId: string; model: string; permissionMode: ClaudePermissionMode | null }
  | { op: 'emitInit' }
  /** End of a turn: the conversation marks the session as saved and resets what held only until then. */
  | { op: 'turnEnded' }
  | { op: 'interruptSettled' }
  | { op: 'backgroundTasks'; tasks: ClaudeBackgroundTask[] }
  | { op: 'initCommands'; commands: InitCommand[] }
  | { op: 'adoptModel'; model: string }
  | { op: 'retract'; uuids: string[] }

/** What the router needs to know about the conversation at the time of the message. */
export interface RouterView {
  status: ClaudeConversationStatus
  /** The current process has a scheduled `/loop`/cron (tells the automatic turn apart). */
  hasCrons: boolean
  /** There is a requested interruption whose `result` has not arrived yet. */
  interruptPending: boolean
}

/** CLI commands (`init`/`commands_changed`) without scope; malformed entries are discarded. */
export function initCommandsOf(raw: unknown): InitCommand[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((c: unknown) => {
    const r = c as { name?: unknown; description?: unknown; argumentHint?: unknown } | null
    if (!r || typeof r.name !== 'string' || r.name === '') return []
    return [
      {
        name: r.name,
        description: typeof r.description === 'string' ? r.description : '',
        argumentHint: typeof r.argumentHint === 'string' ? r.argumentHint : ''
      }
    ]
  })
}

/** Message that only exists inside a turn (model response): a sign that a turn has started. */
function startsTurn(message: SDKMessage): boolean {
  return message.type === 'stream_event' || message.type === 'assistant'
}

/**
 * Translates SDK messages into the contract events. It does not touch the SDK nor the conversation state: it returns
 * the list of `RouteOp` the conversation applies. It keeps only what is its own (last rate limit, `tool_progress`
 * throttling).
 */
export class MessageRouter {
  /** Last emitted rate limit: the CLI repeats the event, the renderer only needs the changes. */
  private rateLimit: ClaudeRateLimit | null = null
  /** `tool_progress` arrives in bursts: at most 1 event/s per tool (forgotten on every `result`). */
  private readonly toolProgress = new ToolProgressThrottle()

  constructor(
    private readonly id: string,
    private readonly now: () => number = Date.now
  ) {}

  route(message: SDKMessage, view: RouterView): RouteOp[] {
    const ops: RouteOp[] = []
    // Turn the CLI itself started (`/loop`, cron, end of a background task): it does not go through `send`, so its
    // first sign marks the conversation as busy; otherwise it would fall asleep midway and the panel would not show the
    // turn.
    if (view.status === 'idle' && startsTurn(message)) {
      ops.push({ op: 'status', status: 'working' })
      this.emit(ops, {
        type: 'autoTurn',
        id: this.id,
        reason: view.hasCrons ? 'scheduled' : 'background',
        timestamp: this.now()
      })
    }
    switch (message.type) {
      case 'system':
        this.system(ops, message)
        break
      case 'stream_event': {
        if (message.parent_tool_use_id !== null) break
        const delta = streamDelta(message.event)
        if (delta) this.emit(ops, { type: 'delta', id: this.id, ...delta })
        break
      }
      case 'assistant':
        if (message.error) this.error(ops, classifyAssistantError(message.error))
        else this.pushMessage(ops, normalizeMessage(message))
        break
      case 'user':
        this.user(ops, message)
        break
      case 'result':
        this.result(ops, message, view)
        break
      case 'rate_limit_event': {
        const limit = normalizeRateLimit(message.rate_limit_info)
        if (limit && !sameRateLimit(limit, this.rateLimit)) {
          this.rateLimit = limit
          this.emit(ops, { type: 'rateLimit', id: this.id, limit })
        }
        break
      }
      case 'prompt_suggestion': {
        // Arrives after the `result` (idle conversation): not a turn sign (`startsTurn`), nor does it wake/delay sleep.
        const suggestion = normalizeSuggestion(asRecord(message))
        // A late suggestion, with another turn already running, no longer holds.
        if (suggestion && view.status === 'idle') this.emit(ops, { type: 'promptSuggestion', id: this.id, suggestion })
        break
      }
      case 'tool_progress': {
        const accepted = this.toolProgress.accept(asRecord(message), this.now())
        if (accepted) this.emit(ops, { type: 'toolProgress', id: this.id, ...accepted })
        break
      }
      default:
        break
    }
    return ops
  }

  private emit(ops: RouteOp[], event: ClaudeEvent): void {
    ops.push({ op: 'emit', event })
  }

  private pushMessage(ops: RouteOp[], message: ClaudeMessage | null): void {
    if (message) ops.push({ op: 'message', message })
  }

  private error(ops: RouteOp[], error: ClaudeError): void {
    this.emit(ops, { type: 'error', id: this.id, error })
    ops.push({ op: 'session', input: { type: 'error' } })
  }

  private user(ops: RouteOp[], message: Extract<SDKMessage, { type: 'user' }>): void {
    // The echo of typed messages was already emitted in `send`; here only what the CLI adds (tool results).
    // Local command output (`/context`, `/cost`…): becomes its own card, not a user bubble.
    const normalized = normalizeMessage(message)
    // A tool result has priority: it is never swallowed by a command output.
    if (normalized && normalized.blocks.some((b) => b.type === 'toolResult')) {
      this.pushMessage(ops, normalized)
      return
    }
    const output = extractCommandOutput(message.message.content)
    if (output !== null) this.emit(ops, { type: 'commandOutput', id: this.id, text: output, timestamp: this.now() })
  }

  private system(ops: RouteOp[], message: Extract<SDKMessage, { type: 'system' }>): void {
    if (message.subtype === 'init') {
      ops.push({
        op: 'init',
        sessionId: message.session_id,
        model: message.model,
        permissionMode: isClaudePermissionMode(message.permissionMode) ? message.permissionMode : null
      })
    } else if (isUntypedSystem(message, 'local_command_output')) {
      const raw = asRecord(message).content
      const text = typeof raw === 'string' ? cleanCommandText(raw) : null
      if (text !== null) this.emit(ops, { type: 'commandOutput', id: this.id, text, timestamp: this.now() })
    } else if (message.subtype === 'background_tasks_changed') {
      ops.push({ op: 'backgroundTasks', tasks: normalizeBackgroundTasks(message.tasks) })
    } else if (message.subtype === 'compact_boundary') {
      const { trigger, preTokens } = parseCompactMetadata(message.compact_metadata)
      this.emit(ops, { type: 'compacted', id: this.id, trigger, preTokens, timestamp: this.now() })
    } else if (message.subtype === 'session_state_changed') {
      if (message.state === 'idle') {
        ops.push({ op: 'interruptSettled' })
        ops.push({ op: 'status', status: 'idle' })
      } else ops.push({ op: 'status', status: 'working' })
    } else this.systemInfo(ops, asRecord(message))
  }

  /**
   * Informational `system` messages that only become an event (or update the command list); the CLI is the source,
   * nothing is trusted.
   */
  private systemInfo(ops: RouteOp[], message: Record<string, unknown>): void {
    switch (message.subtype) {
      case 'api_retry':
        this.emit(ops, { type: 'retry', id: this.id, ...normalizeRetry(message, this.now()) })
        return
      case 'permission_denied': {
        const denied = normalizePermissionDenied(message, this.now())
        if (denied) this.emit(ops, { type: 'permissionDenied', id: this.id, ...denied })
        return
      }
      case 'task_progress': {
        const progress = normalizeTaskProgress(message)
        if (progress) this.emit(ops, { type: 'taskProgress', id: this.id, progress })
        return
      }
      case 'commands_changed':
        // The CLI sends the whole list (skills discovered mid-session). The `/` menu calls `slashCommands()` on every
        // open, which merges with the files: replacing the base is enough, no event (an `init` would touch model/mode).
        ops.push({ op: 'initCommands', commands: initCommandsOf(message.commands) })
        return
      case 'model_refusal_fallback': {
        const fallback = normalizeModelFallback(message)
        if (!fallback) return
        // The `init` of the next process/turn must not undo the switch.
        if (fallback.scope === 'session') ops.push({ op: 'adoptModel', model: fallback.to })
        // Retracting is idempotent and applies to both scopes (an unknown uuid is ignored).
        if (fallback.retracted.length > 0) ops.push({ op: 'retract', uuids: fallback.retracted })
        this.emit(ops, { type: 'modelFallback', id: this.id, ...fallback })
        // The toast comes from `modelFallback`; the `init` only updates the model chip.
        if (fallback.scope === 'session') ops.push({ op: 'emitInit' })
        return
      }
      case 'elicitation_complete':
        // Only confirms that the URL login finished: the card was already resolved when the user accepted/declined, and
        // `mcpStatus` (/mcp modal) shows the real server state. Nothing to do.
        return
      default:
        return
    }
  }

  private result(ops: RouteOp[], message: Extract<SDKMessage, { type: 'result' }>, view: RouterView): void {
    ops.push({ op: 'turnEnded' })
    this.toolProgress.clear()
    // One `result` per turn (the renderer counts turns by it for the queue); without waiting for the context usage,
    // which the renderer requests later with `contextUsage`, so as not to hold the `pump`.
    this.emit(ops, {
      type: 'result',
      id: this.id,
      costUsd: message.total_cost_usd,
      durationMs: message.duration_ms,
      isError: message.is_error,
      context: null
    })
    ops.push({
      op: 'session',
      input: { type: 'result', isError: message.is_error, interrupted: view.interruptPending }
    })
    // Without `session_state_changed` (the CLI only emits it on demand): the end of the last pending turn leaves the
    // conversation idle.
    if ((message.queued_turn_count ?? 0) === 0) ops.push({ op: 'status', status: 'idle' })
    // There is a queued turn: the conversation stays `working` (no status change), so the reducer needs to know.
    else ops.push({ op: 'session', input: { type: 'working' } })
    if (message.is_error) {
      const text = message.subtype === 'success' ? message.result : ''
      const auth = classifyResultText(text)
      if (auth) this.error(ops, auth)
    }
  }
}

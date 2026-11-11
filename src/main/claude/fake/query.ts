import { isRecord } from '@shared/guards'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CanUseTool, OnElicitation, PermissionUpdate, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { allowRulesOf } from '../localPermissions'
import { PushStream } from '../pushStream'
import { SerialQueue } from '../../util/serialQueue'
import type { FakeCallLog } from './callLog'
import type { FakeMcpState } from './cli'
import { DEFAULT_COMMANDS, DEFAULT_MODELS, DEFAULT_REPLY, type FakeScript, type FakeStep } from './script'
import type { FakeSessionStore } from './sessionStore'
import { msg, runFakeStep, type StepCtx, type StepOutcome } from './steps'

export interface QueryParams {
  prompt: string | AsyncIterable<unknown>
  options?: {
    canUseTool?: CanUseTool
    onElicitation?: OnElicitation
    agentProgressSummaries?: boolean
    promptSuggestions?: boolean
    fallbackModel?: string
    sessionId?: string
    resume?: string
    resumeSessionAt?: string
    model?: string
    permissionMode?: string
    allowDangerouslySkipPermissions?: boolean
    effort?: string
    cwd?: string
  }
}

export function createFakeQuery(
  script: FakeScript,
  cursor: { next: number },
  store: FakeSessionStore,
  log: FakeCallLog,
  mcp: FakeMcpState,
  params: QueryParams
): Query {
  const options = params.options ?? {}
  log({
    type: 'query',
    options: {
      permissionMode: options.permissionMode ?? null,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions === true,
      model: options.model ?? null,
      effort: options.effort ?? null,
      agentProgressSummaries: options.agentProgressSummaries === true,
      promptSuggestions: options.promptSuggestions === true,
      fallbackModel: options.fallbackModel ?? null,
      onElicitation: typeof options.onElicitation === 'function'
    }
  })
  const sessionId = options.resume ?? options.sessionId ?? randomUUID()
  const cwd = options.cwd ?? ''
  const outbox = new PushStream<SDKMessage>()
  const outboxIterator = outbox[Symbol.asyncIterator]()
  if (options.resume) store.open(sessionId, options.resumeSessionAt)
  // Everything the CLI would write to the transcript (`user`/`assistant` messages) goes to the store before going out.
  const out = {
    push(message: SDKMessage): void {
      const m = message as unknown as Record<string, unknown>
      if ((m.type === 'assistant' || m.type === 'user') && typeof m.uuid === 'string') {
        store.append(sessionId, cwd, {
          type: m.type,
          uuid: m.uuid,
          message: m.message,
          parent_tool_use_id: typeof m.parent_tool_use_id === 'string' ? m.parent_tool_use_id : null
        })
      }
      outbox.push(message)
    },
    end: () => outbox.end(),
    fail: (err: Error) => outbox.fail(err),
    next: () => outboxIterator.next()
  }
  let closed = false
  // A function: TS does not invalidate the narrowing of `closed` (changed in callbacks) across the loop's `await`s.
  const isClosed = (): boolean => closed
  let turnAbort = new AbortController()
  let initEmitted = false
  // Current mode (the CLI `init` reports the current one, not the `query()` one).
  let currentMode = options.permissionMode ?? 'default'
  let queuedTurns = 0
  const turns = new SerialQueue()

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (turnAbort.signal.aborted) return resolve()
      const timer = setTimeout(done, ms)
      function done(): void {
        clearTimeout(timer)
        turnAbort.signal.removeEventListener('abort', done)
        resolve()
      }
      turnAbort.signal.addEventListener('abort', done, { once: true })
    })

  const base = { session_id: sessionId, parent_tool_use_id: null }
  const assistant = (content: unknown[], extra: Record<string, unknown> = {}): SDKMessage =>
    msg({ type: 'assistant', uuid: randomUUID(), ...base, message: { role: 'assistant', content }, ...extra })
  const toolResult = (
    toolUseId: string,
    content = 'ok',
    isError = false,
    parentToolUseId: string | null = null
  ): SDKMessage =>
    msg({
      type: 'user',
      uuid: randomUUID(),
      ...base,
      parent_tool_use_id: parentToolUseId,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content, ...(isError ? { is_error: true } : {}) }]
      }
    })
  /**
   * `allow` rules that already apply without asking: the folder's `settings.local.json` or accepted earlier in this
   * conversation.
   */
  const sessionAllowed = new Set<string>()
  function alreadyAllowed(suggestions: PermissionUpdate[]): boolean {
    const rules = allowRulesOf(suggestions)
    if (rules.length === 0) return false
    let local = new Set<string>()
    try {
      const parsed = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.local.json'), 'utf8')) as {
        permissions?: { allow?: unknown }
      }
      const allow = parsed.permissions?.allow
      local = new Set(Array.isArray(allow) ? allow.filter((r): r is string => typeof r === 'string') : [])
    } catch {
      // no file or unreadable: no local rule
    }
    return rules.every((r) => local.has(r) || sessionAllowed.has(r))
  }

  function say(text: string): void {
    out.push(
      msg({
        type: 'stream_event',
        uuid: randomUUID(),
        ...base,
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }
      })
    )
    out.push(assistant([{ type: 'text', text }]))
  }

  const stepCtx: StepCtx = {
    sessionId,
    canUseTool: options.canUseTool,
    onElicitation: options.onElicitation,
    started: 0,
    log,
    out,
    halted: () => closed || turnAbort.signal.aborted,
    signal: () => turnAbort.signal,
    wait,
    base,
    assistant,
    toolResult,
    say,
    alreadyAllowed,
    rememberAllowed: (rules) => rules.forEach((r) => sessionAllowed.add(r)),
    emitResult
  }

  function emitResult(isError: boolean, text: string, costUsd: number, started: number): void {
    out.push(
      msg({
        type: 'result',
        subtype: isError ? 'error_during_execution' : 'success',
        is_error: isError,
        result: text,
        duration_ms: Date.now() - started,
        duration_api_ms: 0,
        num_turns: 1,
        total_cost_usd: costUsd,
        queued_turn_count: queuedTurns,
        uuid: randomUUID(),
        session_id: sessionId
      })
    )
  }

  async function runTurn(): Promise<void> {
    if (isClosed()) return
    turnAbort = new AbortController()
    const steps = cursor.next < script.turns.length ? script.turns[cursor.next] : null
    cursor.next++
    const started = Date.now()
    stepCtx.started = started
    if (!initEmitted) {
      initEmitted = true
      out.push(
        msg({
          type: 'system',
          subtype: 'init',
          uuid: randomUUID(),
          session_id: sessionId,
          model: options.model ?? 'fake-model',
          permissionMode: currentMode,
          cwd: '',
          tools: [],
          mcp_servers: mcp.servers.map((m) => ({ name: m.name, status: m.status })),
          slash_commands: (script.commands ?? DEFAULT_COMMANDS).map((c) => c.name),
          apiKeySource: 'none'
        })
      )
    }
    out.push(msg({ type: 'system', subtype: 'session_state_changed', state: 'running', uuid: randomUUID(), ...base }))
    queuedTurns--
    const list: FakeStep[] = steps ?? [{ assistant: DEFAULT_REPLY }]
    let outcome: StepOutcome = 'next'
    for (const step of list) {
      outcome = await runFakeStep(step, stepCtx)
      if (outcome !== 'next') break
    }
    if (isClosed() || outcome === 'failed') return
    // No explicit `result` (or interrupted): an ok `result` closes the turn.
    if (outcome !== 'done') emitResult(false, 'ok', 0, started)
    if (queuedTurns === 0) {
      out.push(msg({ type: 'system', subtype: 'session_state_changed', state: 'idle', uuid: randomUUID(), ...base }))
    }
    // The CLI predicts the next prompt after the turn; only if `query()` asked for `promptSuggestions`.
    if (options.promptSuggestions === true) {
      for (const step of list) {
        if ('promptSuggestion' in step) {
          out.push(
            msg({
              type: 'prompt_suggestion',
              suggestion: step.promptSuggestion,
              uuid: randomUUID(),
              session_id: sessionId
            })
          )
        }
      }
    }
  }

  // Each user message queues a turn; turns run one at a time.
  if (typeof params.prompt !== 'string') {
    void (async () => {
      for await (const raw of params.prompt as AsyncIterable<unknown>) {
        // The typed message also goes into the transcript (with the injected context, as in the CLI).
        const user = isRecord(raw) ? raw : {}
        log({ type: 'user', content: isRecord(user.message) ? user.message.content : null })
        store.append(sessionId, cwd, {
          type: 'user',
          uuid: typeof user.uuid === 'string' ? user.uuid : randomUUID(),
          message: user.message,
          parent_tool_use_id: null
        })
        queuedTurns++
        void turns.run(runTurn).catch(() => undefined)
      }
    })().catch(() => undefined)
  }

  const setMcp = (name: string, change: (s: Record<string, unknown>) => unknown): Promise<void> => {
    const server = mcp.servers.find((s) => s.name === name)
    if (!server) return Promise.reject(new Error(`Server not found: ${name}`))
    change(server)
    return Promise.resolve()
  }

  const fake = {
    [Symbol.asyncIterator]: () => ({ next: () => out.next() }),
    next: () => out.next(),
    initializationResult: () =>
      Promise.resolve({
        commands: script.commands ?? DEFAULT_COMMANDS,
        models: script.models ?? DEFAULT_MODELS,
        ...(mcp.auth.account ? { account: mcp.auth.account } : {})
      }),
    ...(script.usage
      ? {
          usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: (opts?: unknown) => {
            log({ type: 'usage', opts: opts ?? null })
            return Promise.resolve(structuredClone(script.usage))
          }
        }
      : {}),
    interrupt: () => {
      turnAbort.abort()
      return Promise.resolve()
    },
    stopTask: (taskId: string) => {
      log({ type: 'stopTask', taskId })
      return Promise.resolve()
    },
    setPermissionMode: (mode: string) => {
      log({ type: 'setPermissionMode', mode })
      // Like the CLI: bypass only applies if the process started with the flag.
      if (mode === 'bypassPermissions' && options.allowDangerouslySkipPermissions !== true) {
        return Promise.reject(
          new Error('Cannot set permission mode to bypassPermissions because the session was not launched with it')
        )
      }
      currentMode = mode
      return Promise.resolve()
    },
    setModel: (model?: string) => {
      log({ type: 'setModel', model: model ?? null })
      return Promise.resolve()
    },
    applyFlagSettings: (settings: Record<string, unknown>) => {
      log({ type: 'applyFlagSettings', settings })
      return Promise.resolve()
    },
    mcpServerStatus: () => {
      log({ type: 'mcpServerStatus' })
      return Promise.resolve(structuredClone(mcp.servers))
    },
    toggleMcpServer: (name: string, enabled: boolean) => {
      log({ type: 'toggleMcpServer', name, enabled })
      return setMcp(name, (s) => (s.status = enabled ? 'connected' : 'disabled'))
    },
    reconnectMcpServer: (name: string) => {
      log({ type: 'reconnectMcpServer', name })
      return setMcp(name, (s) => {
        if (s.status === 'failed') {
          s.status = 'connected'
          delete s.error
        }
      })
    },
    mcpAuthenticate: (name: string) => {
      const authUrl = 'https://example.invalid/oauth'
      log({ type: 'mcpAuthenticate', name, authUrl })
      return setMcp(name, () => undefined).then(() => ({
        authUrl,
        requiresUserAction: true,
        callbackExpected: true
      }))
    },
    mcpSubmitOAuthCallbackUrl: (name: string, callbackUrl: string) => {
      log({ type: 'mcpSubmitOAuthCallbackUrl', name, callbackUrl })
      return setMcp(name, (s) => (s.status = 'connected'))
    },
    mcpClearAuth: (name: string) => {
      log({ type: 'mcpClearAuth', name })
      return setMcp(name, (s) => (s.status = 'needs-auth'))
    },
    reloadPlugins: () => {
      log({ type: 'reloadPlugins' })
      return Promise.resolve({ mcpServers: structuredClone(mcp.servers) })
    },
    getContextUsage: () => Promise.resolve({ totalTokens: 1000, maxTokens: 200_000, percentage: 0.5 }),
    rewindFiles: () => Promise.resolve({ canRewind: true, filesChanged: [] }),
    close: () => {
      closed = true
      turnAbort.abort()
      out.end()
    }
  }
  return fake as unknown as Query
}

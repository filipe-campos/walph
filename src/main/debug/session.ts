import { basename } from 'node:path'
import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import { getLocale, t } from '@shared/i18n'
import type {
  DebugBreakpointStatus,
  DebugControl,
  DebugEvaluateContext,
  DebugEvaluateResult,
  DebugEvent,
  DebugOutputCategory,
  DebugScope,
  DebugSessionInfo,
  DebugSessionState,
  DebugSourceBreakpoint,
  DebugStackFrame,
  DebugThread,
  DebugVariable
} from '@shared/types'
import { UserError } from '../errors'
import { TIMEOUT, rejectAfter, withDeadline } from '../util/deadline'
import { DapConnection, type DapStreams } from './connection'
import type { LaunchConfig } from './launchConfig'
import {
  breakpointStatus,
  parseBreakpointStatuses,
  parseCapabilities,
  parseContinued,
  parseEvaluate,
  parseExitCode,
  parseOutput,
  parseScopes,
  parseStackFrames,
  parseStopped,
  parseThreads,
  parseVariables,
  publicCapabilities,
  type AdapterCapabilities
} from './normalize'

const DAP_TIMEOUTS = {
  initialize: 15_000,
  /** `launch`/`attach` (the adapter may compile or wait for the process before replying). */
  launch: 60_000,
  request: 10_000,
  evaluate: 15_000,
  disconnect: 3_000,
  /** After the `launch` response, how long to still wait for `initialized` from an adapter that sends it late. */
  lateInitialized: 2_000
}

export type DapTimeouts = typeof DAP_TIMEOUTS

const MAX_STACK_LEVELS = 200

export interface SessionHost {
  /** Current breakpoints per file (the ones the renderer sent last). */
  breakpoints(): ReadonlyMap<string, { path: string; breakpoints: DebugSourceBreakpoint[] }>
  onBreakpointStatus(path: string, statuses: DebugBreakpointStatus[]): void
  output(sessionId: string, category: DebugOutputCategory, text: string): void
  emit(event: DebugEvent): void
  /** A session state or capabilities changed (the list goes to the renderer again). */
  changed(): void
  runInTerminal(session: DebugSession, args: unknown): Promise<unknown>
  startChild(parent: DebugSession, request: 'launch' | 'attach', configuration: Record<string, unknown>): Promise<void>
  /**
   * The session ended (once). `error` translated when the cause is known; `unexpected` = the channel closed without
   * `stop` or `terminated` (the reason is usually the adapter exit, which may arrive right after).
   */
  ended(session: DebugSession, error: string | null, unexpected: boolean): void
}

export interface SessionOptions {
  id: string
  parentId: string | null
  config: LaunchConfig
  noDebug: boolean
  streams: DapStreams
  host: SessionHost
  timeouts?: Partial<DapTimeouts>
}

/** A DAP session over a channel: startup sequence, stopped/running state, requests, breakpoints and shutdown. */
export class DebugSession {
  readonly id: string
  readonly parentId: string | null
  readonly config: LaunchConfig
  readonly noDebug: boolean
  state: DebugSessionState = 'starting'
  stoppedThreadId: number | null = null
  caps: AdapterCapabilities = parseCapabilities(undefined)
  private readonly connection: DapConnection
  private readonly host: SessionHost
  private readonly timeouts: DapTimeouts
  /** The adapter sent `initialized`: from then on the breakpoints go straight through. */
  private initializedSeen = false
  private markInitialized!: () => void
  private readonly initialized = new Promise<void>((resolve) => (this.markInitialized = resolve))
  private terminatedSeen = false
  private ending = false
  private finished = false
  /** Breakpoint ids per file (in the order of the last `setBreakpoints`), for the `breakpoint` event. */
  private readonly bpIds = new Map<string, { path: string; lines: number[]; ids: Array<number | null> }>()
  private readonly bpStatuses = new Map<string, DebugBreakpointStatus[]>()

  constructor(opts: SessionOptions) {
    this.id = opts.id
    this.parentId = opts.parentId
    this.config = opts.config
    this.noDebug = opts.noDebug
    this.host = opts.host
    this.timeouts = { ...DAP_TIMEOUTS, ...opts.timeouts }
    this.connection = new DapConnection(opts.streams, {
      onEvent: (event, body) => this.onEvent(event, body),
      onRequest: (command, args) => this.onReverseRequest(command, args),
      onClose: (protocolError) =>
        this.finish(protocolError === null ? null : t().debug.errors.communication(protocolError), !this.ending)
    })
  }

  get name(): string {
    return this.config.name
  }

  get type(): string {
    return this.config.type
  }

  get isEnded(): boolean {
    return this.finished
  }

  info(): DebugSessionInfo {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      parentId: this.parentId,
      state: this.state,
      stoppedThreadId: this.state === 'stopped' ? this.stoppedThreadId : null,
      capabilities: publicCapabilities(this.caps),
      noDebug: this.noDebug
    }
  }

  /** `initialize` → `launch`/`attach` → (`initialized`) breakpoints + `configurationDone` → `launch` response. */
  async start(): Promise<void> {
    try {
      await this.handshake()
    } catch (err) {
      // A program that ended before the `launch` response (`terminated` closed the channel): not a failure.
      if (!this.terminatedSeen) throw err
    }
  }

  private async handshake(): Promise<void> {
    const init = await this.request(
      'initialize',
      {
        clientID: 'walph',
        clientName: 'Walph',
        adapterID: this.type,
        locale: getLocale(),
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: 'path',
        supportsVariableType: true,
        supportsVariablePaging: false,
        supportsRunInTerminalRequest: true,
        supportsStartDebuggingRequest: true,
        supportsArgsCanBeInterpretedByShell: false,
        supportsProgressReporting: false,
        supportsInvalidatedEvent: false,
        supportsMemoryReferences: false
      },
      this.timeouts.initialize
    )
    this.caps = parseCapabilities(init)
    const { request } = this.config
    const launched = this.request(
      request,
      { ...this.config, ...(this.noDebug ? { noDebug: true } : {}) },
      this.timeouts.launch
    )
    // The refusal arrives through the `await` below; without this, a refusal before `initialized` would go unhandled.
    launched.catch(() => undefined)
    const first = await rejectAfter(
      Promise.race([this.initialized.then(() => 'initialized' as const), launched.then(() => 'launched' as const)]),
      this.timeouts.launch,
      () => new UserError(t().debug.errors.timeout(request))
    )
    // Some adapters only send `initialized` after replying to `launch`.
    const ready =
      first === 'initialized' || (await withDeadline(this.initialized, this.timeouts.lateInitialized)) !== TIMEOUT
    if (ready) await this.configure()
    await launched
    if (this.state === 'starting') {
      this.state = 'running'
      this.host.changed()
    }
  }

  private async configure(): Promise<void> {
    if (!this.noDebug)
      await Promise.all([...this.host.breakpoints().values()].map((f) => this.sendBreakpoints(f.path, f.breakpoints)))
    if (this.caps.exceptionBreakpoints) {
      await this.request('setExceptionBreakpoints', { filters: this.caps.defaultExceptionFilters }).catch(
        () => undefined
      )
    }
    if (this.caps.configurationDone) await this.request('configurationDone', {})
  }

  /** Full list of the file; sent right away if the adapter is ready, otherwise it goes in `configure`. */
  setBreakpoints(path: string, breakpoints: DebugSourceBreakpoint[]): void {
    if (!this.initializedSeen || this.noDebug || this.ending || this.finished) return
    void this.sendBreakpoints(path, breakpoints)
  }

  private async sendBreakpoints(path: string, breakpoints: DebugSourceBreakpoint[]): Promise<void> {
    const { caps } = this
    const lines = breakpoints.map((b) => b.line)
    const sent = breakpoints.map((b) => ({
      line: b.line,
      ...(b.condition && caps.conditionalBreakpoints ? { condition: b.condition } : {}),
      ...(b.hitCondition && caps.hitConditionalBreakpoints ? { hitCondition: b.hitCondition } : {}),
      ...(b.logMessage && caps.logPoints ? { logMessage: b.logMessage } : {})
    }))
    let statuses: DebugBreakpointStatus[]
    try {
      const body = await this.request('setBreakpoints', {
        source: { path, name: basename(path) },
        breakpoints: sent,
        lines,
        sourceModified: false
      })
      const parsed = parseBreakpointStatuses(body, lines)
      statuses = parsed.statuses
      this.bpIds.set(path, { path, lines, ids: parsed.ids })
    } catch (err) {
      if (this.finished) return
      const message = err instanceof Error ? err.message : String(err)
      statuses = lines.map((line) => ({ line, verified: false, actualLine: null, message }))
      this.bpIds.delete(path)
    }
    this.bpStatuses.set(path, statuses)
    this.host.onBreakpointStatus(path, statuses)
  }

  threads(): Promise<DebugThread[]> {
    return this.request('threads', undefined).then(parseThreads)
  }

  stackTrace(threadId: number): Promise<DebugStackFrame[]> {
    return this.request('stackTrace', { threadId, startFrame: 0, levels: MAX_STACK_LEVELS }).then(parseStackFrames)
  }

  scopes(frameId: number): Promise<DebugScope[]> {
    return this.request('scopes', { frameId }).then(parseScopes)
  }

  variables(variablesReference: number): Promise<DebugVariable[]> {
    return this.request('variables', { variablesReference }).then(parseVariables)
  }

  evaluate(expression: string, frameId: number | null, context: DebugEvaluateContext): Promise<DebugEvaluateResult> {
    return this.request(
      'evaluate',
      { expression, context, ...(frameId === null ? {} : { frameId }) },
      this.timeouts.evaluate
    ).then(parseEvaluate)
  }

  async control(action: DebugControl, threadId: number | null): Promise<void> {
    const target = threadId ?? this.stoppedThreadId ?? (await this.threads())[0]?.id
    if (target === undefined) throw new UserError(t().debug.errors.noThread)
    const body = await this.request(action, { threadId: target })
    if (action === 'pause') return
    // The adapter does not send `continued` for what the client asked: the renderer gets an equivalent one.
    const all = action === 'continue' ? parseContinued(body).allThreadsContinued : false
    this.markRunning()
    this.host.emit({ kind: 'continued', sessionId: this.id, threadId: target, allThreadsContinued: all })
  }

  /** The adapter's own `restart` (only with `capabilities.restart`). */
  async restartInAdapter(): Promise<void> {
    await this.request('restart', { arguments: this.config }, this.timeouts.launch)
    this.markRunning()
    this.host.emit({ kind: 'continued', sessionId: this.id, threadId: null, allThreadsContinued: true })
  }

  /**
   * Graceful shutdown: `terminate` (if the adapter supports it and launched the program), then `disconnect`
   * (`terminateDebuggee` only on `launch`). A second `stop` during the first closes the channel at once.
   */
  async stop(): Promise<void> {
    if (this.finished) return
    if (this.ending) {
      this.finish(null)
      return
    }
    this.ending = true
    const launch = this.config.request === 'launch'
    if (this.caps.terminate && launch && !this.terminatedSeen) {
      await this.request('terminate', {}, this.timeouts.disconnect).catch(() => undefined)
    }
    await this.disconnect(launch)
    this.finish(null)
  }

  /** Closes the channel without a handshake (the adapter crashed or the view went away). */
  finish(error: string | null, unexpected = false): void {
    if (this.finished) return
    this.finished = true
    this.ending = true
    this.connection.close()
    this.host.ended(this, error, unexpected)
  }

  private async disconnect(terminateDebuggee: boolean): Promise<void> {
    if (this.connection.isClosed) return
    await this.request('disconnect', { restart: false, terminateDebuggee }, this.timeouts.disconnect).catch(
      () => undefined
    )
  }

  private request(command: string, args: unknown, timeoutMs = this.timeouts.request): Promise<unknown> {
    if (this.finished) return Promise.reject(new UserError(t().debug.errors.sessionEnded))
    return this.connection.request(command, args, timeoutMs)
  }

  private markRunning(): void {
    if (this.state !== 'stopped') return
    this.state = 'running'
    this.stoppedThreadId = null
    this.host.changed()
  }

  private onEvent(event: string, body: unknown): void {
    if (this.finished) return
    switch (event) {
      case 'initialized':
        this.initializedSeen = true
        this.markInitialized()
        break
      case 'stopped': {
        const info = parseStopped(body)
        this.state = 'stopped'
        this.stoppedThreadId = info.threadId ?? this.stoppedThreadId
        this.host.changed()
        this.host.emit({ kind: 'stopped', sessionId: this.id, ...info, threadId: this.stoppedThreadId })
        break
      }
      case 'continued': {
        const info = parseContinued(body)
        this.markRunning()
        this.host.emit({ kind: 'continued', sessionId: this.id, ...info })
        break
      }
      case 'thread':
        this.host.emit({ kind: 'threads', sessionId: this.id })
        break
      case 'output': {
        const output = parseOutput(body)
        if (output) this.host.output(this.id, output.category, output.text)
        break
      }
      case 'breakpoint':
        this.onBreakpointEvent(body)
        break
      case 'exited': {
        const code = parseExitCode(body)
        if (code !== null) this.host.output(this.id, 'console', `${t().debug.console.exited(code)}\n`)
        break
      }
      case 'terminated':
        this.terminatedSeen = true
        void this.onTerminated()
        break
      case 'capabilities':
        this.caps = parseCapabilities(isRecord(body) ? body.capabilities : undefined, this.caps)
        this.host.changed()
        break
      default:
        break
    }
  }

  private async onTerminated(): Promise<void> {
    if (this.ending) return
    this.ending = true
    await this.disconnect(false)
    this.finish(null)
  }

  private onBreakpointEvent(body: unknown): void {
    if (!isRecord(body) || !isRecord(body.breakpoint) || !isFiniteNumber(body.breakpoint.id)) return
    const raw = body.breakpoint
    for (const entry of this.bpIds.values()) {
      const index = entry.ids.indexOf(raw.id as number)
      const statuses = this.bpStatuses.get(entry.path)
      const requested = entry.lines[index]
      if (index < 0 || !statuses || requested === undefined) continue
      const next = [...statuses]
      next[index] = breakpointStatus(requested, raw)
      this.bpStatuses.set(entry.path, next)
      this.host.onBreakpointStatus(entry.path, next)
      return
    }
  }

  private async onReverseRequest(command: string, args: unknown): Promise<unknown> {
    if (command === 'runInTerminal') return this.host.runInTerminal(this, args)
    if (command === 'startDebugging') {
      const a = isRecord(args) ? args : {}
      const request = a.request
      if (!isRecord(a.configuration) || (request !== 'launch' && request !== 'attach'))
        throw new Error('Invalid startDebugging arguments.')
      await this.host.startChild(this, request, a.configuration)
      return {}
    }
    throw new Error(`Unsupported request: ${isNonEmptyString(command) ? command : '?'}`)
  }
}

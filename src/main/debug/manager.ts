import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isNonEmptyString } from '@shared/guards'
import { t } from '@shared/i18n'
import { pathKey } from '@shared/pathCompare'
import type { DebugAdapterSetting } from '@shared/settings'
import type {
  DebugBreakpointStatus,
  DebugConfigList,
  DebugControl,
  DebugEvaluateContext,
  DebugEvaluateResult,
  DebugEvent,
  DebugOutputCategory,
  DebugOutputEntry,
  DebugScope,
  DebugSourceBreakpoint,
  DebugStackFrame,
  DebugStartOptions,
  DebugThread,
  DebugVariable
} from '@shared/types'
import { UserError } from '../errors'
import { createBatcher } from '../util/batcher'
import { withDeadline } from '../util/deadline'
import { resolveAdapter, type ResolvedAdapter } from './adapters'
import type { DapStreams } from './connection'
import {
  asLaunchConfig,
  builtinConfigs,
  forPlatform,
  launchFileTemplate,
  parseLaunchFile,
  substituteVariables,
  summarize,
  type LaunchConfig
} from './launchConfig'
import { DebugSession, type DapTimeouts, type SessionHost } from './session'
import { parseRunInTerminal, type RunInTerminalRequest } from './runInTerminal'
import type { AdapterCallbacks, AdapterHandle, AdapterLaunch } from './transport'

const OUTPUT_BATCH_MS = 50
const RUN_TICKET_TIMEOUT_MS = 15_000
/** After `disconnect`, how long the adapter has to exit on its own before its tree is killed. */
const ADAPTER_EXIT_GRACE_MS = 2_000
/** Lost channel: how long to wait for the adapter exit to show the reason. */
const LOST_EXIT_WAIT_MS = 1_000

export interface RunTicket extends RunInTerminalRequest {
  sessionId: string
  /** Pid of the process in the terminal, or `null` if it did not start. Once. */
  settle(pid: number | null): void
}

export interface DebugManagerDeps {
  getRoot(): string | null
  getAdapters(): Record<string, DebugAdapterSetting> | undefined
  emit(event: DebugEvent): void
  /** Adapter executable and environment (login shell PATH, the configuration `env`). */
  resolveLaunch(adapter: ResolvedAdapter, cwd: string): Promise<AdapterLaunch>
  startAdapter(launch: AdapterLaunch, callbacks: AdapterCallbacks): Promise<AdapterHandle>
  createFile(path: string, text: string): Promise<void>
  readText?: (path: string) => Promise<string | null>
  platform?: string
  timeouts?: Partial<DapTimeouts>
}

interface RootRun {
  adapter: AdapterHandle
  config: LaunchConfig
  noDebug: boolean
  /** The user (or the view) asked for the end: the adapter exit is not an error. */
  stopping: boolean
  /** Still in `start`: the failure comes back as a rejection, not as an event. */
  starting: boolean
  /** Reason the adapter went down, for the `start` rejection. */
  failure: string | null
  exited: boolean
  /** Last adapter stderr line (the reason for a crash, e.g. `No module named debugpy`). */
  lastStderr: string | null
  /** The root channel closed without `stop`/`terminated`: the reason comes with the adapter exit. */
  lost: boolean
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new UserError(t().debug.errors.launchJsonRead(err instanceof Error ? err.message : String(err)))
  }
}

/** The debug sessions of a view: adapters, breakpoints, output and terminal requests. Knows nothing of Electron. */
export class DebugManager {
  private readonly sessions = new Map<string, DebugSession>()
  private readonly roots = new Map<string, RootRun>()
  private readonly breakpoints = new Map<string, { path: string; breakpoints: DebugSourceBreakpoint[] }>()
  private readonly tickets = new Map<string, RunTicket>()
  private readonly outputBatch = createBatcher<DebugOutputEntry>(OUTPUT_BATCH_MS, (entries) =>
    this.emit({ kind: 'output', entries })
  )
  private disposed = false
  private muted = false
  /** Changes on every folder switch: an in-flight `start` of the previous folder gives up after each `await`. */
  private generation = 0
  private restarting: Promise<void> | null = null

  constructor(private readonly deps: DebugManagerDeps) {}

  private emit(event: DebugEvent): void {
    if (!this.muted) this.deps.emit(event)
  }

  private get platform(): string {
    return this.deps.platform ?? process.platform
  }

  private requireRoot(): string {
    const root = this.deps.getRoot()
    if (!root) throw new UserError(t().debug.errors.noFolder)
    return root
  }

  private launchFile(root: string): string {
    return join(root, '.vscode', 'launch.json')
  }

  private async loadFile(
    root: string
  ): Promise<{ exists: boolean; configs: Record<string, unknown>[]; error: string | null }> {
    const text = await (this.deps.readText ?? readOptional)(this.launchFile(root))
    if (text === null) return { exists: false, configs: [], error: null }
    const parsed = parseLaunchFile(text)
    return { exists: true, configs: parsed.configurations, error: parsed.error }
  }

  async configurations(): Promise<DebugConfigList> {
    const root = this.requireRoot()
    const { exists, configs, error } = await this.loadFile(root)
    const own = summarize(configs, this.platform)
    const configurations =
      error === null && own.length === 0
        ? builtinConfigs().map((c) => ({ name: c.name, type: c.type, request: c.request, builtin: true }))
        : own
    return { configurations, file: this.launchFile(root), exists, error }
  }

  async createLaunchFile(): Promise<string> {
    const root = this.requireRoot()
    const path = this.launchFile(root)
    const { exists } = await this.loadFile(root)
    if (!exists) await this.deps.createFile(path, launchFileTemplate())
    return path
  }

  private async findConfig(root: string, name: string): Promise<LaunchConfig> {
    const { configs, error } = await this.loadFile(root)
    if (error !== null) throw new UserError(error)
    const raw = configs.map((c) => forPlatform(c, this.platform)).find((c) => c.name === name)
    if (raw) {
      const config = asLaunchConfig(raw)
      if (!config) throw new UserError(t().debug.errors.invalidConfig(name))
      return config
    }
    const builtin =
      summarize(configs, this.platform).length === 0 ? builtinConfigs().find((c) => c.name === name) : null
    if (!builtin) throw new UserError(t().debug.errors.configNotFound(name))
    return builtin
  }

  async start(name: string, options: DebugStartOptions): Promise<string> {
    const root = this.requireRoot()
    const generation = this.generation
    const config = await this.findConfig(root, name)
    this.assertCurrent(generation)
    const resolved = substituteVariables(config, {
      root,
      file: options.file ?? null,
      line: options.line ?? null,
      selectedText: options.selectedText ?? null,
      env: process.env,
      home: homedir()
    })
    return this.launchRoot(resolved, options.noDebug === true, root, generation)
  }

  private assertCurrent(generation: number): void {
    if (this.disposed || generation !== this.generation) throw new UserError(t().debug.errors.sessionEnded)
  }

  private async launchRoot(config: LaunchConfig, noDebug: boolean, root: string, generation: number): Promise<string> {
    const adapter = resolveAdapter(config.type, this.deps.getAdapters(), this.platform)
    if (!adapter) throw new UserError(t().debug.errors.noAdapter(config.type))
    const launch = await this.deps.resolveLaunch(adapter, root)
    this.assertCurrent(generation)
    const id = randomUUID()
    for (const key of ['preLaunchTask', 'postDebugTask'] as const) {
      const task = config[key]
      if (!isNonEmptyString(task)) continue
      const message =
        key === 'preLaunchTask'
          ? t().debug.console.preLaunchTaskIgnored(task)
          : t().debug.console.postDebugTaskIgnored(task)
      this.output(id, 'important', `${message}\n`)
    }
    const handle = await this.deps.startAdapter(launch, {
      onStderr: (text) => {
        const run = this.roots.get(id)
        if (run) run.lastStderr = text.trim().slice(0, 500)
        this.output(id, 'console', `${text}\n`)
      },
      onExit: (code, signal, spawnError) => this.onAdapterExit(id, code, signal, spawnError)
    })
    this.output(id, 'console', `${t().debug.console.starting(handle.command)}\n`)
    const run: RootRun = {
      adapter: handle,
      config,
      noDebug,
      stopping: false,
      starting: true,
      failure: null,
      exited: false,
      lastStderr: null,
      lost: false
    }
    this.roots.set(id, run)
    try {
      this.assertCurrent(generation)
      const streams = await handle.connect()
      if (run.stopping) streams?.close()
      this.assertCurrent(generation)
      if (run.stopping) throw new UserError(t().debug.errors.sessionEnded)
      if (!streams) throw new UserError(t().debug.errors.communication('connect'))
      const session = this.createSession(id, null, config, noDebug, streams)
      await session.start()
      this.assertCurrent(generation)
      run.starting = false
      return id
    } catch (err) {
      if (run.lost && !run.exited) await withDeadline(handle.proc.closed, LOST_EXIT_WAIT_MS)
      const failure = run.failure
      run.starting = false
      run.stopping = true
      this.endTree(id, null)
      handle.kill()
      this.roots.delete(id)
      throw failure ? new UserError(failure) : err
    }
  }

  private createSession(
    id: string,
    parentId: string | null,
    config: LaunchConfig,
    noDebug: boolean,
    streams: DapStreams
  ): DebugSession {
    const session = new DebugSession({
      id,
      parentId,
      config,
      noDebug,
      streams,
      host: this.sessionHost,
      ...(this.deps.timeouts ? { timeouts: this.deps.timeouts } : {})
    })
    this.sessions.set(id, session)
    this.changed()
    return session
  }

  private readonly sessionHost: SessionHost = {
    breakpoints: () => this.breakpoints,
    onBreakpointStatus: (path, statuses) => this.onBreakpointStatus(path, statuses),
    output: (sessionId, category, text) => this.output(sessionId, category, text),
    emit: (event) => this.emit(event),
    changed: () => this.changed(),
    runInTerminal: (session, args) => this.runInTerminal(session, args),
    startChild: (parent, request, configuration) => this.startChild(parent, request, configuration),
    ended: (session, error, unexpected) => this.onSessionEnded(session, error, unexpected)
  }

  private onBreakpointStatus(path: string, statuses: DebugBreakpointStatus[]): void {
    this.emit({ kind: 'breakpoints', path, breakpoints: statuses })
  }

  private output(sessionId: string, category: DebugOutputCategory, text: string): void {
    this.outputBatch.push({ sessionId, category, text })
  }

  private changed(): void {
    if (this.disposed) return
    this.emit({ kind: 'sessions', sessions: [...this.sessions.values()].map((s) => s.info()) })
  }

  private rootOf(id: string): string | null {
    let current = this.sessions.get(id)
    let guard = 0
    while (current?.parentId && guard++ < 100) {
      const parent = this.sessions.get(current.parentId)
      if (!parent) break
      current = parent
    }
    if (current) return current.id
    return this.roots.has(id) ? id : null
  }

  private treeOf(rootId: string): DebugSession[] {
    const out: DebugSession[] = []
    const visit = (id: string): void => {
      for (const s of this.sessions.values()) if (s.parentId === id) visit(s.id)
      const own = this.sessions.get(id)
      if (own) out.push(own)
    }
    visit(rootId)
    return out
  }

  /** Children before the parent: ending the root first would bring down the adapter under the children. */
  private endTree(rootId: string, error: string | null): void {
    for (const s of this.treeOf(rootId)) s.finish(error)
  }

  private onSessionEnded(session: DebugSession, error: string | null, unexpected: boolean): void {
    const rootId = this.rootOf(session.id) ?? session.id
    this.sessions.delete(session.id)
    for (const ticket of [...this.tickets.values()]) if (ticket.sessionId === session.id) ticket.settle(null)
    const run = this.roots.get(rootId)
    this.outputBatch.flush()
    const silent = !run || run.starting || run.stopping
    const report = (message: string | null): void => {
      if (message && !silent && !this.disposed) this.emit({ kind: 'error', sessionId: session.id, message })
    }
    if (run && session.id === rootId) {
      run.stopping = true
      this.endTree(rootId, null)
      if (unexpected && !run.exited) {
        run.lost = true
        // The end of stdout usually arrives before `exit`: waits for the code (and stderr) to explain the crash.
        void withDeadline(run.adapter.proc.closed, LOST_EXIT_WAIT_MS).then(() => {
          report(run.failure ?? error ?? t().debug.errors.exited(t().debug.errors.exitCode('?')))
          this.roots.delete(rootId)
          run.adapter.kill()
        })
      } else {
        report(error ?? (unexpected ? run.failure : null))
        this.roots.delete(rootId)
        // Exits on its own after `disconnect`; otherwise the tree is killed.
        void withDeadline(run.adapter.proc.closed, ADAPTER_EXIT_GRACE_MS).then(() => run.adapter.kill())
      }
    } else report(error)
    this.changed()
  }

  private onAdapterExit(
    rootId: string,
    code: number | null,
    signal: NodeJS.Signals | null,
    spawnError: string | null
  ): void {
    const run = this.roots.get(rootId)
    if (!run) return
    run.exited = true
    const how = signal ? t().debug.errors.exitSignal(signal) : t().debug.errors.exitCode(String(code))
    const errors = t().debug.errors
    const crash = run.lastStderr ? errors.exitedDetail(how, run.lastStderr) : errors.exited(how)
    run.failure = spawnError ?? crash
    this.endTree(rootId, run.stopping ? null : run.failure)
  }

  /** Request to a live session; one that already ended rejects (the renderer may be one event behind). */
  private withSession<T>(id: string, run: (session: DebugSession) => Promise<T>): Promise<T> {
    const session = this.sessions.get(id)
    if (!session || session.isEnded) return Promise.reject(new UserError(t().debug.errors.sessionEnded))
    return run(session)
  }

  async stop(id: string): Promise<void> {
    const rootId = this.rootOf(id)
    if (!rootId) return
    const run = this.roots.get(rootId)
    if (run) run.stopping = true
    for (const s of this.treeOf(rootId)) await s.stop()
  }

  restart(id: string): Promise<void> {
    // Two requests in a row (repeated F5) must not start two sessions.
    this.restarting ??= this.restartOnce(id).finally(() => (this.restarting = null))
    return this.restarting
  }

  private async restartOnce(id: string): Promise<void> {
    const rootId = this.rootOf(id)
    const run = rootId ? this.roots.get(rootId) : undefined
    const root = rootId ? this.sessions.get(rootId) : undefined
    if (!rootId || !run || !root) throw new UserError(t().debug.errors.sessionEnded)
    if (root.caps.restart && this.treeOf(rootId).length === 1) {
      await root.restartInAdapter()
      return
    }
    const generation = this.generation
    await this.stop(rootId)
    await this.launchRoot(run.config, run.noDebug, this.requireRoot(), generation)
  }

  control(id: string, action: DebugControl, threadId: number | null): Promise<void> {
    return this.withSession(id, (s) => s.control(action, threadId))
  }

  threads(id: string): Promise<DebugThread[]> {
    return this.withSession(id, (s) => s.threads())
  }

  stackTrace(id: string, threadId: number): Promise<DebugStackFrame[]> {
    return this.withSession(id, (s) => s.stackTrace(threadId))
  }

  scopes(id: string, frameId: number): Promise<DebugScope[]> {
    return this.withSession(id, (s) => s.scopes(frameId))
  }

  variables(id: string, variablesReference: number): Promise<DebugVariable[]> {
    return this.withSession(id, (s) => s.variables(variablesReference))
  }

  evaluate(
    id: string,
    expression: string,
    frameId: number | null,
    context: DebugEvaluateContext
  ): Promise<DebugEvaluateResult> {
    return this.withSession(id, (s) => s.evaluate(expression, frameId, context))
  }

  setBreakpoints(path: string, breakpoints: DebugSourceBreakpoint[]): void {
    const key = pathKey(path)
    if (breakpoints.length === 0) this.breakpoints.delete(key)
    else this.breakpoints.set(key, { path, breakpoints })
    for (const session of this.sessions.values()) session.setBreakpoints(path, breakpoints)
  }

  private async startChild(
    parent: DebugSession,
    request: 'launch' | 'attach',
    configuration: Record<string, unknown>
  ): Promise<void> {
    const rootId = this.rootOf(parent.id)
    const run = rootId ? this.roots.get(rootId) : undefined
    if (!run || run.stopping) throw new Error('The parent session has ended.')
    const streams = await run.adapter.connect()
    if (!streams) throw new Error('startDebugging is only supported for adapters reached over TCP.')
    const config: LaunchConfig = {
      ...configuration,
      name: isNonEmptyString(configuration.name) ? configuration.name : parent.name,
      type: isNonEmptyString(configuration.type) ? configuration.type : parent.type,
      request
    }
    const session = this.createSession(randomUUID(), parent.id, config, parent.noDebug, streams)
    session.start().catch((err: unknown) => {
      if (!session.isEnded && !this.disposed)
        this.emit({
          kind: 'error',
          sessionId: session.id,
          message: err instanceof Error ? err.message : String(err)
        })
      session.finish(null)
    })
  }

  private runInTerminal(session: DebugSession, args: unknown): Promise<unknown> {
    const request = parseRunInTerminal(args, this.deps.getRoot())
    if (!request) return Promise.reject(new Error('Invalid runInTerminal arguments.'))
    const ticket = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.tickets.delete(ticket)
        reject(new Error('The terminal was not opened in time.'))
      }, RUN_TICKET_TIMEOUT_MS)
      let settled = false
      this.tickets.set(ticket, {
        ...request,
        sessionId: session.id,
        settle: (pid) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          this.tickets.delete(ticket)
          if (pid === null) reject(new Error('The program could not be started in the terminal.'))
          else resolve({ processId: pid })
        }
      })
      this.emit({ kind: 'runInTerminal', ticket, title: request.title || session.name })
    })
  }

  /** Pending terminal request (single use: the ticket leaves the list; whoever took it calls `settle`). */
  takeRunTicket(ticket: unknown): RunTicket | null {
    if (typeof ticket !== 'string') return null
    const found = this.tickets.get(ticket)
    if (!found) return null
    this.tickets.delete(ticket)
    return found
  }

  /** The view folder changed: the sessions and breakpoints belonged to the previous folder. */
  async resetForFolder(): Promise<void> {
    this.generation++
    this.breakpoints.clear()
    await Promise.all([...this.roots.keys()].map((id) => this.stop(id)))
  }

  /** The view went away (reset): short graceful shutdown, then the process is killed. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    // The view reloaded or died: nothing from the shutdown reaches the new page.
    this.muted = true
    this.generation++
    await withDeadline(Promise.all([...this.roots.keys()].map((id) => this.stop(id))), ADAPTER_EXIT_GRACE_MS)
    this.killAll()
  }

  /** `will-quit` and the end of `dispose`: kills everything at once. */
  killAll(): void {
    this.disposed = true
    this.outputBatch.dispose()
    for (const ticket of [...this.tickets.values()]) ticket.settle(null)
    for (const run of this.roots.values()) {
      run.stopping = true
      run.adapter.kill()
    }
    for (const s of [...this.sessions.values()]) s.finish(null)
    this.roots.clear()
    this.sessions.clear()
  }
}

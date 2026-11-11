import { basename } from 'node:path'
import {
  CancellationTokenSource,
  createMessageConnection,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
  type CancellationToken,
  type MessageConnection
} from 'vscode-jsonrpc/node'
import { t } from '@shared/i18n'
import type { LspLogLevel, LspRefreshKind, LspServerState } from '@shared/types'
import { MAX_RESTARTS, nextRestart } from './backoff'
import { clientCapabilities, parseServerCaps, type ServerCaps } from './capabilities'
import { spawnErrorMessage, type Launch } from './launch'
import { spawnGroup, type GroupProcess } from '../process/spawnGroup'
import { TIMEOUT, withDeadline } from '../util/deadline'
import { createLineSplitter, type LineSplitter } from '../util/lineSplitter'
import { SerialQueue } from '../util/serialQueue'
import { parseSyncOptions, type SyncOptions } from './syncOptions'
import { pathToUri } from './uri'
import { matchesWatch, parseWatchers, WATCH_METHOD, type WatchedChange, type WatchSpec } from './watchers'
import type { LspTextChange } from '@shared/types'
import { UserError } from '../errors'

/** Document as seen by the server (the mirror belongs to the manager; the server only reads it on (re)start). */
export interface ServerDocument {
  uri: string
  languageId: string
  text: string
  version: number
}

interface ServerHost {
  /** Open documents that belong to this server (resent with `didOpen` on every start). */
  getDocuments(): ServerDocument[]
  onState(state: LspServerState, message?: string): void
  onLog(level: LspLogLevel, message: string): void
  onDiagnostics(uri: string, version: number | null, diagnostics: unknown): void
  /** Server `workspace/applyEdit` (the manager normalizes, asks the renderer and answers). */
  applyEdit(params: unknown): Promise<{ applied: boolean; failureReason?: string }>
  /** Gave up (start error or attempts exhausted): the old diagnostics no longer hold. */
  onGaveUp(): void
  /** The server asked the client to request the `kind` data of all its documents again. */
  onRefresh(kind: LspRefreshKind): void
}

/** Server `workspace/…/refresh` requests and what each one invalidates in the renderer. */
const REFRESH_METHODS: Record<string, LspRefreshKind> = {
  'workspace/inlayHint/refresh': 'inlayHints',
  'workspace/semanticTokens/refresh': 'semanticTokens',
  'workspace/codeLens/refresh': 'codeLens'
}

export interface ServerOptions {
  id: string
  root: string
  launch: () => Launch
  initializationOptions?: () => Record<string, unknown> | undefined
  /** Sent in `workspace/didChangeConfiguration` right after `initialized`. */
  settings?: () => Record<string, unknown> | undefined
  host: ServerHost
  /** Window for `shutdown`/`exit` before killing the process. */
  shutdownTimeoutMs?: number
  initializeTimeoutMs?: number
  /** Replaces the delay computation (tests). */
  restartDelay?: (plannedMs: number) => number
}

interface Run {
  id: number
  proc: GroupProcess
  connection: MessageConnection
  startedAt: number
  ready: boolean
  stopping: boolean
  /** `onExit` already handled the exit (the `proc`'s `exited` turns `true` before, on spawn error too). */
  exited: boolean
  sync: SyncOptions
  caps: ServerCaps
  /** `workspace/didChangeWatchedFiles` watchers by registration id (valid only for this process). */
  watchers: Map<string, WatchSpec[]>
  stderr: LineSplitter
}

/** The server answered with an error (≠ deadline or crash): the caller may treat it as a refusal (`prepareRename`). */
export class ServerResponseError extends UserError {
  constructor(readonly serverMessage: string) {
    super(t().lsp.errors.server(serverMessage))
  }
}

/** Every live server (including those slow to exit after `stopRun`), to mark them `stopping` on `will-quit`. */
const live = new Set<Run>()

// Only marks: the killing is done by `killAllSpawnedGroups`, which gathers every group in a single `taskkill` on
// Windows. A `proc.kill(true)` here would spend one `taskkill` per server and the batch would skip them as dead.
function markQuitting(run: Run): void {
  run.stopping = true
  live.delete(run)
}

/** Marks every live server as stopping, even those already in an asynchronous shutdown (`will-quit`). */
export function markAllLanguageServersQuitting(): void {
  for (const run of [...live]) markQuitting(run)
}

const MAX_STDERR_LINE = 8192

/** RequestCancelled, ContentModified and ServerCancelled: the result became stale, it is not a failure. */
const CANCELLED_CODES = new Set([-32800, -32801, -32802])

const levelOf = (type: unknown): LspLogLevel =>
  type === 1 ? 'error' : type === 2 ? 'warning' : type === 3 ? 'info' : 'log'

/**
 * A language server process (stdio + JSON-RPC) with a lifecycle: start, `initialize`, resending the documents,
 * restart with backoff, `shutdown` and termination of the process tree. Does not know Electron.
 */
export class LanguageServer {
  private run: Run | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private attempts = 0
  private stopped = true
  /** After `stop`/`quitNow` the object never starts a process again (an in-flight `restart` gives up too). */
  private disposed = false
  private readonly queue = new SerialQueue()
  private runCounter = 0

  constructor(private readonly opts: ServerOptions) {}

  get ready(): boolean {
    return !!this.run?.ready
  }

  /** Starts (on demand). No effect if already running or waiting for a restart. */
  start(): void {
    if (this.run || this.restartTimer || this.disposed) return
    this.stopped = false
    this.spawnRun()
  }

  /** Restarts now and resets the backoff (also takes the server out of the `error` state). */
  restart(): Promise<void> {
    return this.queue.run(async () => {
      await this.stopRun()
      if (this.disposed) return
      this.attempts = 0
      this.stopped = false
      this.spawnRun()
    })
  }

  /** Polite shutdown (`shutdown` + `exit`, then kills the tree). */
  stop(): Promise<void> {
    this.disposed = true
    return this.queue.run(() => this.stopRun())
  }

  /** App exit (`will-quit`): does not restart or start anything else; the process dies in `killAllSpawnedGroups`. */
  quitNow(): void {
    this.disposed = true
    this.stopped = true
    this.clearRestartTimer()
    if (this.run) markQuitting(this.run)
  }

  /** Identifies the current process: changes on every (re)start, to invalidate what depended on the previous one. */
  get runId(): number {
    return this.run?.id ?? 0
  }

  /** Capabilities announced in `initialize`; `null` while there is no ready server. */
  get capabilities(): ServerCaps | null {
    return this.run?.ready ? this.run.caps : null
  }

  /**
   * Request with a deadline and cancellation. Resolves `null` if it was cancelled (`parent`, or the server answered
   * "cancelled"/"content modified"); rejects with a translated message on a server error, an expired deadline or if
   * the server crashed. On the deadline it sends `$/cancelRequest`, but does not wait for the answer: the server may
   * not even answer.
   */
  request<R>(
    method: string,
    params: unknown,
    timeoutMs: number,
    label: string,
    parent?: CancellationToken
  ): Promise<R | null> {
    const run = this.run
    if (!run?.ready) return Promise.reject(new UserError(t().lsp.errors.notReady))
    if (parent?.isCancellationRequested) return Promise.resolve(null)
    return new Promise<R | null>((resolve, reject) => {
      const source = new CancellationTokenSource()
      let finished = false
      const subscription = parent?.onCancellationRequested(() => {
        source.cancel()
        finish(() => resolve(null))
      })
      const timer = setTimeout(() => {
        source.cancel()
        finish(() => reject(new UserError(t().lsp.errors.timeout(label))))
      }, timeoutMs)
      function finish(done: () => void): void {
        if (finished) return
        finished = true
        clearTimeout(timer)
        subscription?.dispose()
        source.dispose()
        done()
      }
      let sent: Promise<R>
      try {
        sent = run.connection.sendRequest<R>(method, params, source.token)
      } catch {
        // Connection already disposed: `sendRequest` throws synchronously.
        finish(() => reject(new UserError(t().lsp.errors.communication(label))))
        return
      }
      sent.then(
        (result) => finish(() => resolve(result ?? null)),
        (err: unknown) =>
          finish(() => {
            if (err instanceof ResponseError && CANCELLED_CODES.has(err.code)) resolve(null)
            else if (err instanceof ResponseError) reject(new ServerResponseError(err.message))
            else reject(new UserError(t().lsp.errors.communication(label)))
          })
      )
    })
  }

  didOpen(doc: ServerDocument): void {
    const run = this.run
    if (!run?.ready || !run.sync.openClose) return
    this.notify(run, 'textDocument/didOpen', {
      textDocument: { uri: doc.uri, languageId: doc.languageId, version: doc.version, text: doc.text }
    })
  }

  /** `doc` already carries the text and the version after the changes. */
  didChange(doc: ServerDocument, changes: readonly LspTextChange[]): void {
    const run = this.run
    if (!run?.ready || run.sync.change === 0) return
    const contentChanges =
      run.sync.change === 2 ? changes.map((c) => ({ range: c.range, text: c.text })) : [{ text: doc.text }]
    this.notify(run, 'textDocument/didChange', {
      textDocument: { uri: doc.uri, version: doc.version },
      contentChanges
    })
  }

  didSave(doc: ServerDocument): void {
    const run = this.run
    if (!run?.ready || !run.sync.save) return
    this.notify(run, 'textDocument/didSave', {
      textDocument: { uri: doc.uri },
      ...(run.sync.includeText ? { text: doc.text } : {})
    })
  }

  didClose(uri: string): void {
    const run = this.run
    if (!run?.ready || !run.sync.openClose) return
    this.notify(run, 'textDocument/didClose', { textDocument: { uri } })
  }

  /**
   * `workspace/didChangeWatchedFiles`: sends only what the watchers registered by the server ask for. Without a
   * registration (or without a ready server) it sends nothing, as the specification says.
   */
  didChangeWatchedFiles(changes: readonly WatchedChange[]): void {
    const run = this.run
    if (!run?.ready || run.watchers.size === 0) return
    const specs = [...run.watchers.values()].flat()
    const matched = changes.filter((c) => matchesWatch(specs, c, this.opts.root))
    if (matched.length === 0) return
    this.notify(run, WATCH_METHOD, { changes: matched.map((c) => ({ uri: pathToUri(c.path), type: c.type })) })
  }

  private notify(run: Run, method: string, params: unknown): void {
    try {
      void run.connection.sendNotification(method, params).catch(() => undefined)
    } catch {
      // connection already closed: the process is going down and the restart resends the documents
    }
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
  }

  private fail(message: string): void {
    this.opts.host.onLog('error', message)
    this.opts.host.onState('error', message)
    this.opts.host.onGaveUp()
  }

  private spawnRun(): void {
    if (this.disposed) return
    const { host, root } = this.opts
    host.onState('starting', this.attempts > 0 ? t().lsp.state.restarting(this.attempts, MAX_RESTARTS) : undefined)

    let launch: Launch
    try {
      launch = this.opts.launch()
    } catch (err) {
      this.stopped = true
      this.fail(err instanceof Error ? err.message : String(err))
      return
    }

    let proc: GroupProcess
    try {
      proc = spawnGroup(launch.command, launch.args, { cwd: root, env: launch.env, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      this.stopped = true
      this.fail(spawnErrorMessage(launch.command, err))
      return
    }
    host.onLog('info', t().lsp.log.starting(`${launch.command} ${launch.args.join(' ')}`))

    const { child } = proc
    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout!),
      new StreamMessageWriter(child.stdin!)
    )
    const run: Run = {
      id: ++this.runCounter,
      proc,
      connection,
      startedAt: Date.now(),
      ready: false,
      stopping: false,
      exited: false,
      sync: parseSyncOptions(undefined),
      caps: parseServerCaps(undefined),
      watchers: new Map(),
      stderr: createLineSplitter(MAX_STDERR_LINE)
    }
    this.run = run
    live.add(run)
    child.stderr!.setEncoding('utf8')

    child.stdin!.on('error', () => undefined)
    child.stdout!.on('error', () => undefined)
    child.stderr!.on('data', (chunk: string) => this.onStderr(run, chunk))
    child.on('error', (err) => {
      // No pid = the process never existed (missing executable, no permission…): retrying is pointless.
      if (child.pid !== undefined) return
      this.onExit(run, null, null, spawnErrorMessage(launch.command, err))
    })
    child.on('exit', (code, signal) => this.onExit(run, code, signal))

    this.registerHandlers(run)
    connection.onError(([err]) => host.onLog('warning', t().lsp.log.protocolError(err.message)))
    connection.listen()
    void this.initialize(run)
  }

  private registerHandlers(run: Run): void {
    const { connection } = run
    const { host, root } = this.opts
    const current = (): boolean => this.run === run
    const folder = { uri: pathToUri(root), name: basename(root) }

    connection.onNotification(
      'textDocument/publishDiagnostics',
      (p: { uri: string; version?: number; diagnostics: unknown }) => {
        if (current()) host.onDiagnostics(p.uri, typeof p.version === 'number' ? p.version : null, p.diagnostics)
      }
    )
    const message = (p: { type?: unknown; message?: unknown } | null | undefined): void => {
      if (current() && typeof p?.message === 'string') host.onLog(levelOf(p.type), p.message)
    }
    connection.onNotification('window/logMessage', message)
    connection.onNotification('window/showMessage', message)
    // Progress and telemetry have no UI at this stage.
    connection.onNotification('$/progress', () => undefined)
    connection.onNotification('telemetry/event', () => undefined)
    connection.onNotification(() => undefined)

    connection.onRequest('window/showMessageRequest', (p: { type?: unknown; message?: unknown } | null | undefined) => {
      message(p)
      return null
    })
    connection.onRequest('workspace/configuration', (p: { items?: unknown[] } | null | undefined) =>
      (p?.items ?? []).map(() => null)
    )
    // Only the dynamic registration of watchers is stored; the rest is accepted and ignored.
    connection.onRequest('client/registerCapability', (p: { registrations?: unknown[] } | null | undefined) => {
      if (!current()) return null
      for (const r of Array.isArray(p?.registrations) ? p.registrations : []) {
        const reg = r as { id?: unknown; method?: unknown; registerOptions?: unknown } | null
        if (reg?.method === WATCH_METHOD && typeof reg.id === 'string') {
          run.watchers.set(reg.id, parseWatchers(reg.registerOptions))
        }
      }
      return null
    })
    // `unregisterations` (sic) is the specification's spelling; we also accept the correct one.
    connection.onRequest(
      'client/unregisterCapability',
      (p: { unregisterations?: unknown[]; unregistrations?: unknown[] } | null | undefined) => {
        const list = p?.unregisterations ?? p?.unregistrations
        for (const r of Array.isArray(list) ? list : []) {
          const reg = r as { id?: unknown; method?: unknown } | null
          if (reg?.method === WATCH_METHOD && typeof reg.id === 'string') run.watchers.delete(reg.id)
        }
        return null
      }
    )
    connection.onRequest('window/workDoneProgress/create', () => null)
    connection.onRequest('workspace/workspaceFolders', () => [folder])
    for (const [method, kind] of Object.entries(REFRESH_METHODS)) {
      connection.onRequest(method, () => {
        if (current()) host.onRefresh(kind)
        return null
      })
    }
    connection.onRequest('workspace/applyEdit', (params: unknown) =>
      current() ? host.applyEdit(params) : { applied: false, failureReason: 'The server was restarted.' }
    )
  }

  private onStderr(run: Run, text: string): void {
    for (const line of run.stderr.feed(text)) if (line.trim()) this.opts.host.onLog('info', line.slice(0, 4000))
  }

  private async initialize(run: Run): Promise<void> {
    const { host, root } = this.opts
    const uri = pathToUri(root)
    // A function: `stopping` changes during the `await`s, and TS does not invalidate the narrowing between them.
    const superseded = (): boolean => this.run !== run || run.stopping
    try {
      const result = await withDeadline(
        run.connection.sendRequest<{ capabilities?: Record<string, unknown> } | null | undefined>('initialize', {
          processId: process.pid,
          clientInfo: { name: 'Walph' },
          rootUri: uri,
          rootPath: root,
          workspaceFolders: [{ uri, name: basename(root) }],
          initializationOptions: this.opts.initializationOptions?.(),
          capabilities: clientCapabilities(),
          trace: 'off'
        }),
        this.opts.initializeTimeoutMs ?? 30_000
      )
      if (superseded()) return
      if (result === TIMEOUT) throw new UserError(t().lsp.errors.initializeTimeout)

      run.sync = parseSyncOptions(result?.capabilities?.textDocumentSync)
      run.caps = parseServerCaps(result?.capabilities)
      await run.connection.sendNotification('initialized', {})
      if (superseded()) return
      const settings = this.opts.settings?.()
      if (settings) await run.connection.sendNotification('workspace/didChangeConfiguration', { settings })
      if (superseded()) return
      // Marks as ready before resending: documents opened during the wait are already in the mirror.
      run.ready = true
      for (const doc of host.getDocuments()) this.didOpen(doc)
      host.onLog('info', t().lsp.log.ready)
      host.onState('ready')
    } catch (err) {
      if (this.run !== run || run.stopping) return
      host.onLog('error', t().lsp.log.initializeFailed(err instanceof Error ? err.message : String(err)))
      // The shutdown lands in `onExit`, which decides on the restart.
      run.proc.kill()
    }
  }

  private onExit(run: Run, code: number | null, signal: NodeJS.Signals | null, spawnError?: string): void {
    if (run.exited) return
    run.exited = true
    live.delete(run)
    try {
      run.connection.dispose()
    } catch {
      // already disposed
    }
    if (this.run === run) this.run = null
    if (run.stopping) return

    const { host } = this.opts
    if (spawnError) {
      this.stopped = true
      this.fail(spawnError)
      return
    }
    const how = signal ? t().lsp.state.exitSignal(signal) : t().lsp.state.exitCode(String(code))
    host.onLog('error', t().lsp.log.crashed(how))
    if (this.stopped) return

    const uptime = Date.now() - run.startedAt
    const plan = nextRestart(this.attempts, uptime)
    if (!plan) {
      this.stopped = true
      this.attempts = 0
      this.fail(t().lsp.state.gaveUp(how, MAX_RESTARTS))
      return
    }
    this.attempts = plan.attempt
    host.onState('starting', t().lsp.state.restarting(plan.attempt, MAX_RESTARTS))
    const delay = this.opts.restartDelay?.(plan.delayMs) ?? plan.delayMs
    host.onLog('warning', t().lsp.log.restartingIn(Math.round(delay / 1000), plan.attempt, MAX_RESTARTS))
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.stopped) this.spawnRun()
    }, delay)
  }

  private async stopRun(): Promise<void> {
    this.stopped = true
    this.clearRestartTimer()
    const run = this.run
    if (!run) return
    const wasReady = run.ready
    run.ready = false
    run.stopping = true
    const budget = this.opts.shutdownTimeoutMs ?? 2000
    const deadline = Date.now() + budget
    // Without a completed `initialize` there is nothing to negotiate: kill now instead of waiting the whole deadline.
    if (!wasReady) run.proc.kill()
    if (wasReady && !run.exited) {
      try {
        const left = (): number => Math.max(0, deadline - Date.now())
        const answer = await withDeadline(run.connection.sendRequest('shutdown'), left())
        if (answer !== TIMEOUT) await run.connection.sendNotification('exit')
      } catch {
        // connection dropped during the shutdown: the kill below handles it
      }
    }
    await withDeadline(run.proc.closed, Math.max(0, deadline - Date.now()))
    // Did not exit in time: kill the tree. (If it exited, `spawnGroup` already swept the group.)
    if (!run.exited) {
      run.proc.kill()
      await withDeadline(run.proc.closed, 1000)
    }
    if (this.run === run) this.run = null
    // No `exited` nor exit of `live`: if the process still dies later, `onExit` cleans up; else `will-quit` kills it.
    if (!run.exited) {
      try {
        run.connection.dispose()
      } catch {
        // already disposed
      }
    }
  }
}

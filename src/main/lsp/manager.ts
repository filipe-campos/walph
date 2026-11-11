import type { LspServerSetting } from '@shared/settings'
import type { CancellationToken } from 'vscode-jsonrpc/node'
import { t, type Messages } from '@shared/i18n'
import type {
  Diagnostic,
  FileDiagnostics,
  LspApplyEditRequest,
  LspCodeAction,
  LspCodeLens,
  LspCodeLensList,
  LspCommand,
  LspCompletionItem,
  LspCompletionList,
  LspDocumentHighlight,
  LspHierarchyDirection,
  LspHierarchyEdge,
  LspHierarchyItem,
  LspHierarchyKind,
  LspHover,
  LspInlayHint,
  LspLocation,
  LspLogEntry,
  LspLogLevel,
  LspPosition,
  LspRange,
  LspRefresh,
  LspSemanticTokens,
  LspServerStatus,
  LspSignatureHelp,
  LspSymbol,
  LspDocumentSymbol,
  LspTextChange,
  LspTextEdit,
  LspWorkspaceEdit
} from '@shared/types'
import { ApplyEditBroker, type ApplyEditResult } from './applyEditBroker'
import { CodeLensCache, normalizeCodeLens } from './codeLens'
import { HIERARCHY_METHODS, HierarchyStore, hierarchyKindOf, normalizeHierarchyEdges } from './hierarchy'
import { normalizeCompletionItem } from './completion'
import { DocumentMirror, type ManagedDoc } from './documentMirror'
import { ExclusiveRequests } from './exclusive'
import { LogBuffer } from './logBuffer'
import { createBatcher } from '../util/batcher'
import {
  REQUEST_TIMEOUTS_MS,
  requests,
  type RequestHost,
  type RequestKind,
  type RequestSpec,
  type ServerEntry,
  type Target
} from './requests'
import { normalizeWorkspaceSymbols, WORKSPACE_SYMBOL_LIMIT } from './symbols'
import { normalizeWorkspaceEdit } from './workspaceEdit'
import { mapDiagnostics } from './diagnostics'
import { buildLaunch, initializationOptions, workspaceSettings, type Launch } from './launch'
import { IdleController } from './idlePolicy'
import { LanguageServer, ServerResponseError, type ServerOptions } from './server'
import { configSignature, languageIdFor, resolveServers, serverForPath, type ResolvedServer } from './serverConfig'
import { toWatchedType, type WatchedChange } from './watchers'
import { isInside, pathKey } from '@shared/pathCompare'
import { uriToPath } from './uri'
import { UserError } from '../errors'

/** Window during which log lines are batched before going to the renderer. */
const LOG_BATCH_MS = 100

/** How long the renderer has to apply an edit requested by the server. */
const APPLY_EDIT_TIMEOUT_MS = 10_000

// The methods use `t` as the name of the request target.
const msg = (): Messages['lsp'] => t().lsp

export interface ManagerDeps {
  /** Current folder of the window (read on every call: it changes with `workspace:open`). */
  getRoot(): string | null
  getServersSetting(): Record<string, LspServerSetting>
  emitDiagnostics(d: FileDiagnostics): void
  emitStatus(list: LspServerStatus[]): void
  emitLog(entries: LspLogEntry[]): void
  /** Server `workspace/applyEdit`: the renderer applies it and answers through `resolveApplyEdit`. */
  emitApplyEdit?(request: LspApplyEditRequest): void
  /** Main gave up waiting for the answer to request `id` (deadline, or window/folder closed). */
  emitApplyEditCancelled?(id: number): void
  /** Server `workspace/…/refresh`. */
  emitRefresh?(refresh: LspRefresh): void
  timeouts?: Partial<Record<RequestKind, number>>
  applyEditTimeoutMs?: number
  /** Replaceable in tests. */
  launchFor?(def: ResolvedServer, root: string): Launch
  initOptionsFor?(def: ResolvedServer, root: string): Record<string, unknown> | undefined
  serverOptions?: Partial<ServerOptions>
  /** Idle deadlines (tests). */
  idle?: { noDocsMs?: number; inactiveMs?: number }
}

interface AskOptions {
  method: string
  params: unknown
  kind: RequestKind
  label: string
  /** Key of the exclusive request: a new one cancels the previous one with the same key. */
  exclusive?: string | undefined
}

/** Server and process that produced a stored result: restarting invalidates the raw items. */
interface ResultOwner {
  entry: ServerEntry
  runId: number
}

interface CompletionCache {
  id: number
  entry: ServerEntry
  /** Process that produced the list: restarting the server invalidates the raw items (`data` of the resolve). */
  runId: number
  raws: Record<string, unknown>[]
}

/**
 * The language servers of ONE window: owns the file → server routing and their lifecycle; the document mirror, the
 * log, the pending edits and the request table belong to their own modules. Does not know Electron (`lsp/registry.ts`
 * binds this to the window).
 */
export class LspManager {
  private root: string | null = null
  private readonly servers = new Map<string, ServerEntry>()
  private readonly mirror = new DocumentMirror()
  private readonly logs = new LogBuffer()
  private readonly logBatch = createBatcher<LspLogEntry>(LOG_BATCH_MS, (entries) =>
    this.emit(() => this.deps.emitLog(entries))
  )
  private alive = true
  private completionSeq = 0
  private lastCompletion: CompletionCache | null = null
  /** Completion/hover/signature in flight: a new request of the same kind cancels the previous one (fast typing). */
  private readonly exclusive = new ExclusiveRequests()
  private readonly edits: ApplyEditBroker
  private readonly lenses = new CodeLensCache<ResultOwner>()
  private readonly hierarchyItems = new HierarchyStore<ResultOwner>()

  /** Shuts down servers without documents and those of a hidden view; they reopen on demand from the mirror. */
  private readonly idle: IdleController

  private readonly host: RequestHost = {
    canon: () => this.mirror.canon(this.root),
    editContext: () => this.mirror.editContext(this.root),
    storeCompletion: (target, raws) => {
      // Only the last list is kept: `resolveCompletion` of an old list returns `null`.
      const id = ++this.completionSeq
      this.lastCompletion = { id, entry: target.entry, runId: target.entry.server.runId, raws }
      return id
    },
    storeCodeLenses: (target, raws) => this.lenses.store(target.doc.path, this.ownerOf(target.entry), raws),
    storeHierarchyItem: (target, kind, raw) => this.hierarchyItems.add(this.ownerOf(target.entry), kind, raw),
    requestRaw: (target, method, params, kind, label) =>
      target.entry.server.request<unknown>(method, params, this.timeout(kind), label)
  }

  constructor(private readonly deps: ManagerDeps) {
    this.idle = new IdleController(
      {
        docCount: (id) => this.mirror.forServer(id).length,
        stopServer: (id) => this.sleepServer(id, msg().log.idleNoDocuments),
        hibernate: () => {
          for (const id of [...this.servers.keys()]) this.sleepServer(id, msg().log.idleWorkspace)
        }
      },
      deps.idle
    )
    this.edits = new ApplyEditBroker({
      timeoutMs: deps.applyEditTimeoutMs ?? APPLY_EDIT_TIMEOUT_MS,
      emitRequest: (request) => this.emit(() => this.deps.emitApplyEdit?.(request)),
      emitCancelled: (id) => this.emit(() => this.deps.emitApplyEditCancelled?.(id))
    })
  }

  /** The view became (or stopped being) the window's active one; on return, the servers of open documents start. */
  setActive(active: boolean): void {
    const was = this.idle.isActive
    this.idle.setActive(active)
    if (active && !was) this.wakeAll()
  }

  open(path: string, text: string, version: number): void {
    const root = this.currentRoot()
    if (!root || !isInside(root, path)) return
    const def = serverForPath(resolveServers(this.deps.getServersSetting()), path)
    this.idle.used()
    const { doc, previous } = this.mirror.open({
      path,
      text,
      version,
      languageId: def ? languageIdFor(def, path) : 'plaintext',
      serverId: def?.id ?? null
    })
    if (previous) this.serverOf(previous)?.server.didClose(previous.uri)
    if (def) this.ensureServer(def, root).server.didOpen(doc)
    if (previous?.serverId) this.idle.serverTouched(previous.serverId)
    if (def) this.idle.serverTouched(def.id)
  }

  change(path: string, version: number, changes: readonly LspTextChange[]): void {
    const doc = this.mirror.change(path, version, changes)
    if (!doc) return
    this.idle.used()
    const entry = this.serverOf(doc)
    // Sleeping server: when it starts it receives the already updated text from the mirror.
    if (entry) entry.server.didChange(doc, changes)
    else this.wake(doc)
  }

  save(path: string): void {
    const doc = this.mirror.get(path)
    if (doc) this.serverOf(doc)?.server.didSave(doc)
  }

  close(path: string): void {
    const doc = this.mirror.close(path)
    if (!doc) return
    this.lenses.delete(path)
    this.serverOf(doc)?.server.didClose(doc.uri)
    this.clearDiagnostics(doc)
    if (doc.serverId) this.idle.serverTouched(doc.serverId)
  }

  /**
   * Files changed on disk (window watcher). `change` of an open document is ignored: the server already has the text
   * through `didChange`; create and delete are always forwarded. Each server filters by the watchers it registered.
   */
  fileChanges(changes: readonly { path: string; type: 'add' | 'change' | 'unlink' }[]): void {
    if (!this.alive || this.servers.size === 0) return
    const list: WatchedChange[] = []
    for (const c of changes) {
      // Atomic save (rename over it) arrives as `add` on macOS/Windows: a mirrored document is already up to date.
      if (c.type !== 'unlink' && this.mirror.has(c.path)) continue
      list.push({ path: c.path, type: toWatchedType(c.type) })
    }
    if (list.length === 0) return
    for (const entry of this.servers.values()) entry.server.didChangeWatchedFiles(list)
  }

  async restart(id?: string): Promise<void> {
    const targets = [...this.servers.entries()].filter(([key]) => id === undefined || key === id).map(([, e]) => e)
    await Promise.all(targets.map((e) => e.server.restart()))
  }

  status(): LspServerStatus[] {
    return [...this.servers.values()].map((e) => ({
      id: e.def.id,
      name: e.def.name,
      state: e.state,
      extensions: e.def.extensions,
      ...(e.message ? { message: e.message } : {})
    }))
  }

  log(): LspLogEntry[] {
    // The batch goes out before the invoke response: the renderer dedupes history and events only in this order.
    this.logBatch.flush()
    return this.logs.snapshot()
  }

  /** Current diagnostics of the open documents that have any (IDE tools of the Claude panel). */
  diagnosticsSnapshot(path?: string): { path: string; diagnostics: Diagnostic[] }[] {
    const only = path ? this.mirror.get(path) : undefined
    if (path && !only) return []
    const result: { path: string; diagnostics: Diagnostic[] }[] = []
    for (const doc of only ? [only] : this.mirror.values()) {
      const diagnostics = mapDiagnostics(doc.diagnostics)
      if (diagnostics.length > 0) result.push({ path: doc.path, diagnostics })
    }
    return result
  }

  /** `lsp.servers` changed: restarts those whose config changed, stops those turned off and reroutes the files. */
  applySettings(): void {
    const root = this.root
    if (!root) return
    const defs = resolveServers(this.deps.getServersSetting())
    for (const [id, entry] of [...this.servers]) {
      const def = defs.find((d) => d.id === id)
      if (def && configSignature(def) === entry.signature) continue
      this.detach(id, entry)
    }
    for (const doc of [...this.mirror.values()]) {
      const def = serverForPath(defs, doc.path)
      if (!def) {
        // Stays in the mirror: if a server is turned on later, the already open file reaches it.
        if (doc.serverId) {
          this.serverOf(doc)?.server.didClose(doc.uri)
          this.clearDiagnostics(doc)
          doc.serverId = null
        }
        continue
      }
      const previous = this.serverOf(doc)
      const entry = this.ensureServer(def, root)
      if (doc.serverId !== def.id) {
        previous?.server.didClose(doc.uri)
        this.clearDiagnostics(doc)
        doc.serverId = def.id
        doc.languageId = languageIdFor(def, doc.path)
        entry.server.didOpen(doc)
      }
    }
    for (const id of this.servers.keys()) this.idle.serverTouched(id)
    this.emitStatus()
  }

  /** The window folder changed (or the window is about to close): shuts everything down. */
  async shutdown(): Promise<void> {
    this.idle.dispose()
    this.logBatch.flush()
    const entries = [...this.servers.values()]
    this.servers.clear()
    this.dropRequests('The folder or window changed before the edit was applied.')
    for (const doc of this.mirror.values()) this.clearDiagnostics(doc)
    this.mirror.clear()
    this.root = null
    this.emitStatus()
    await Promise.all(entries.map((e) => e.server.stop()))
    this.logBatch.flush()
  }

  /** The window no longer exists: shuts down without emitting anything else. */
  async dispose(): Promise<void> {
    this.alive = false
    this.logBatch.dispose()
    await this.shutdown()
  }

  /** App exit (`will-quit`): drops the state; the processes die in `killAllSpawnedGroups`. */
  killAll(): void {
    this.alive = false
    this.logBatch.dispose()
    this.idle.dispose()
    this.dropRequests('The window was closed.')
    for (const e of this.servers.values()) e.server.quitNow()
    this.servers.clear()
    this.mirror.clear()
  }

  // ---- Requests ----
  // IPC delivers `change` and `invoke` in order, so the mirror (and the server) have already seen the version the
  // position was computed on. No open document, server or capability → `null`/empty, never an error.

  /** Characters that trigger completion/signature help in the file's server. */
  triggerCharacters(path: string): { completion: string[]; signature: string[]; signatureRetrigger: string[] } {
    const caps = this.target(path)?.caps
    return {
      completion: caps?.completionTriggers ?? [],
      signature: caps?.signatureTriggers ?? [],
      signatureRetrigger: caps?.signatureRetriggers ?? []
    }
  }

  completion(path: string, position: LspPosition, triggerCharacter?: string): Promise<LspCompletionList | null> {
    return this.run(requests.completion, path, position, triggerCharacter)
  }

  async resolveCompletion(resultId: number, index: number): Promise<LspCompletionItem | null> {
    const cache = this.lastCompletion
    if (!cache || cache.id !== resultId || index < 0 || index >= cache.raws.length) return null
    const { entry } = cache
    if (
      this.servers.get(entry.def.id) !== entry ||
      entry.server.runId !== cache.runId ||
      !entry.server.capabilities?.completionResolve
    ) {
      return null
    }
    const original = cache.raws[index]
    const resolved = await entry.server.request<Record<string, unknown>>(
      'completionItem/resolve',
      original,
      this.timeout('resolve'),
      msg().requests.resolveCompletion
    )
    if (!resolved || typeof resolved !== 'object') return null
    // The server may return only what changed: the resolved item completes the original.
    return normalizeCompletionItem({ ...original, ...resolved }, false)
  }

  hover(path: string, position: LspPosition): Promise<LspHover | null> {
    return this.run(requests.hover, path, position)
  }

  signatureHelp(path: string, position: LspPosition, triggerCharacter?: string): Promise<LspSignatureHelp | null> {
    return this.run(requests.signatureHelp, path, position, triggerCharacter)
  }

  definition(path: string, position: LspPosition): Promise<LspLocation[]> {
    return this.run(requests.definition, path, position)
  }

  references(path: string, position: LspPosition): Promise<LspLocation[]> {
    return this.run(requests.references, path, position)
  }

  prepareRename(path: string, position: LspPosition): Promise<{ range: LspRange; placeholder: string } | null> {
    return this.run(requests.prepareRename, path, position)
  }

  rename(path: string, position: LspPosition, newName: string): Promise<LspWorkspaceEdit | null> {
    return this.run(requests.rename, path, position, newName)
  }

  format(path: string, options: { tabSize: number; insertSpaces: boolean }): Promise<LspTextEdit[]> {
    return this.run(requests.format, path, options)
  }

  codeActions(path: string, range: LspRange): Promise<LspCodeAction[]> {
    return this.run(requests.codeActions, path, range)
  }

  async executeCommand(path: string, command: LspCommand): Promise<void> {
    const target = this.target(path)
    if (!target) throw new UserError(msg().errors.noServer)
    if (!target.caps.executeCommands?.includes(command.command)) {
      throw new UserError(msg().errors.commandRejected(command.command))
    }
    await this.ask<unknown>(target, {
      method: 'workspace/executeCommand',
      params: { command: command.command, ...(command.arguments ? { arguments: command.arguments } : {}) },
      kind: 'executeCommand',
      label: msg().requests.executeCommand
    })
  }

  documentSymbols(path: string): Promise<LspDocumentSymbol[]> {
    return this.run(requests.documentSymbols, path)
  }

  /** `workspace/symbol` on every ready server of the window, merging the results (global limit). */
  async workspaceSymbols(query: string): Promise<LspSymbol[]> {
    const root = this.root
    if (!root) return []
    const entries = [...this.servers.values()].filter((e) => e.server.capabilities?.workspaceSymbol)
    if (entries.length === 0) return []
    const canon = this.mirror.canon(root)
    // Typing in the symbol search fires one request per key: the new one cancels the previous one.
    return this.exclusive.withExclusive('workspaceSymbols', async (token) => {
      const settled = await Promise.allSettled(
        entries.map((e) =>
          e.server.request<unknown>(
            'workspace/symbol',
            { query },
            this.timeout('workspaceSymbols'),
            msg().requests.workspaceSymbols,
            token
          )
        )
      )
      if (token.isCancellationRequested || this.root !== root) return []
      const symbols: LspSymbol[] = []
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          symbols.push(
            ...normalizeWorkspaceSymbols(
              r.value,
              root,
              WORKSPACE_SYMBOL_LIMIT - symbols.length,
              process.platform,
              canon
            )
          )
        }
      }
      // One server failing does not hide what the others found; only if all failed does the error reach the user.
      const failed = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      const [firstFailure] = failed
      if (firstFailure && failed.length === settled.length) throw firstFailure.reason
      return symbols
    })
  }

  inlayHints(path: string, range: LspRange): Promise<LspInlayHint[]> {
    return this.run(requests.inlayHints, path, range)
  }

  documentHighlights(path: string, position: LspPosition): Promise<LspDocumentHighlight[]> {
    return this.run(requests.documentHighlights, path, position)
  }

  /** Delta over the document's last result when the server offers it; if refused, falls back to the whole document. */
  async semanticTokens(path: string): Promise<LspSemanticTokens | null> {
    const doc = this.mirror.get(path)
    const entry = doc ? this.serverOf(doc) : undefined
    const previous = doc?.semanticTokens
    if (
      doc &&
      previous &&
      entry?.def.id === previous.serverId &&
      entry.server.runId === previous.runId &&
      entry.server.capabilities?.semanticTokens?.delta
    ) {
      try {
        return await this.run(requests.semanticTokensDelta, path, previous)
      } catch (err) {
        if (!(err instanceof ServerResponseError)) throw err
        doc.semanticTokens = undefined
      }
    }
    return this.run(requests.semanticTokens, path)
  }

  implementation(path: string, position: LspPosition): Promise<LspLocation[]> {
    return this.run(requests.implementation, path, position)
  }

  typeDefinition(path: string, position: LspPosition): Promise<LspLocation[]> {
    return this.run(requests.typeDefinition, path, position)
  }

  declaration(path: string, position: LspPosition): Promise<LspLocation[]> {
    return this.run(requests.declaration, path, position)
  }

  codeLens(path: string): Promise<LspCodeLensList | null> {
    return this.run(requests.codeLens, path)
  }

  /** `codeLens/resolve` of lens `index` of the document's last list; list replaced or server restarted → `null`. */
  async resolveCodeLens(path: string, resultId: number, index: number): Promise<LspCodeLens | null> {
    const list = this.lenses.get(path, resultId)
    const original = list?.raws[index]
    if (!list || !original || !this.isCurrent(list.owner) || !list.owner.entry.server.capabilities?.codeLensResolve) {
      return null
    }
    const resolved = await this.ask<unknown>(list.owner, {
      method: 'codeLens/resolve',
      params: original,
      kind: 'codeLensResolve',
      label: t().lspNavigation.requests.resolveCodeLens
    })
    if (!resolved || typeof resolved !== 'object') return null
    // The server may return only what changed: the resolved one completes the original (and is stored in its place).
    const merged = { ...original, ...resolved }
    if (this.lenses.get(path, resultId) === list) list.raws[index] = merged
    return normalizeCodeLens(merged, process.platform, this.mirror.canon(this.root))
  }

  prepareHierarchy(kind: LspHierarchyKind, path: string, position: LspPosition): Promise<LspHierarchyItem[]> {
    return this.run(kind === 'call' ? requests.prepareCallHierarchy : requests.prepareTypeHierarchy, path, position)
  }

  /** Neighbors of a stored item; the item must belong to the server's current process and to the direction's kind. */
  async hierarchyRelated(id: number, direction: LspHierarchyDirection): Promise<LspHierarchyEdge[]> {
    const stored = this.hierarchyItems.get(id)
    const kind = hierarchyKindOf(direction)
    const caps = stored?.owner.entry.server.capabilities
    if (!stored || stored.kind !== kind || !this.isCurrent(stored.owner) || !caps) return []
    if (kind === 'call' ? !caps.callHierarchy : !caps.typeHierarchy) return []
    const raw = await this.ask<unknown>(stored.owner, {
      method: HIERARCHY_METHODS[direction],
      params: { item: stored.raw },
      kind: 'hierarchy',
      label: kind === 'call' ? t().lspNavigation.requests.callHierarchy : t().lspNavigation.requests.typeHierarchy
    })
    if (raw === null) return []
    return normalizeHierarchyEdges(raw, direction, process.platform, this.mirror.canon(this.root)).map((edge) => ({
      item: { ...edge.item, id: this.hierarchyItems.add(stored.owner, kind, edge.raw) },
      ranges: edge.ranges
    }))
  }

  /** The renderer answered an `lsp:applyEdit`. Unknown id (already expired) is ignored. */
  resolveApplyEdit(id: number, applied: boolean, failureReason?: string): void {
    this.edits.resolve(id, applied, failureReason)
  }

  private ownerOf(entry: ServerEntry): ResultOwner {
    return { entry, runId: entry.server.runId }
  }

  /** The server that produced the result is still the same active process. */
  private isCurrent(owner: ResultOwner): boolean {
    return this.servers.get(owner.entry.def.id) === owner.entry && owner.entry.server.runId === owner.runId
  }

  /** Stored results (lenses, hierarchy items) of a server that exited. */
  private dropResults(entry: ServerEntry): void {
    this.lenses.dropOwner((o) => o.entry === entry)
    this.hierarchyItems.dropOwner((o) => o.entry === entry)
  }

  private timeout(kind: RequestKind): number {
    return this.deps.timeouts?.[kind] ?? REQUEST_TIMEOUTS_MS[kind]
  }

  /** Open document with a ready server; `null` in any other case. */
  private target(path: string): Target | null {
    const doc = this.mirror.get(path)
    const entry = doc ? this.serverOf(doc) : undefined
    if (doc && !entry) this.wake(doc)
    this.idle.used()
    const caps = entry?.server.capabilities
    return doc && entry && caps ? { doc, entry, caps } : null
  }

  /**
   * Shuts down the server process keeping the mirror (`doc.serverId` stays): the next request/open/change, or the
   * view becoming active again, starts a new server that receives every document. The diagnostic markers stay until
   * the new server publishes its own.
   */
  private sleepServer(id: string, why: string): void {
    const entry = this.servers.get(id)
    if (!entry || !this.alive) return
    this.servers.delete(id)
    if (this.lastCompletion?.entry === entry) this.lastCompletion = null
    this.dropResults(entry)
    this.pushLog(id, 'info', msg().log.idleStopped(why))
    this.emitStatus()
    void entry.server.stop()
  }

  /** Restarts the server of a document that has it registered but is sleeping. In-flight requests get `null`. */
  private wake(doc: ManagedDoc): void {
    const root = this.root
    if (!this.alive || !root || !doc.serverId || this.servers.has(doc.serverId)) return
    const def = serverForPath(resolveServers(this.deps.getServersSetting()), doc.path)
    if (def && def.id === doc.serverId) this.ensureServer(def, root)
  }

  private wakeAll(): void {
    for (const doc of this.mirror.values()) this.wake(doc)
  }

  /**
   * LSP request from the `requests` table: no ready document/server or no capability → `empty`; an answer from another
   * world (folder switched, server restarted) reaches `normalize` as `null`.
   */
  private async run<A extends unknown[], T>(spec: RequestSpec<A, T>, path: string, ...args: A): Promise<T> {
    const target = this.target(path)
    if (!target || !spec.cap(target.caps)) return spec.empty
    const shortcut = spec.shortcut?.(target, ...args)
    if (shortcut !== undefined) return shortcut
    let raw: unknown
    try {
      raw = await this.ask<unknown>(target, {
        method: spec.method,
        params: spec.params(target, ...args),
        kind: spec.kind,
        label: spec.label(),
        exclusive: spec.exclusive
      })
    } catch (err) {
      if (spec.recover) return spec.recover(err)
      throw err
    }
    return spec.normalize(raw, target, this.host, ...args)
  }

  /** `exclusive`: cancels the previous request of the same kind (completion/hover/signature) before sending it. */
  private ask<R>(target: Pick<Target, 'entry'>, o: AskOptions): Promise<R | null> {
    const { method, params, kind, label, exclusive } = o
    const root = this.root
    const runId = target.entry.server.runId
    const send = async (token?: CancellationToken): Promise<R | null> => {
      const result = await target.entry.server.request<R>(method, params, this.timeout(kind), label, token)
      // Folder switched, server turned off or restarted during the wait: the answer is from another world.
      if (
        this.root !== root ||
        this.servers.get(target.entry.def.id) !== target.entry ||
        target.entry.server.runId !== runId
      ) {
        return null
      }
      return result
    }
    return exclusive ? this.exclusive.withExclusive(exclusive, send) : send()
  }

  /** Server `workspace/applyEdit`: normalizes, delivers to the renderer and waits for the answer (with a deadline). */
  private onServerApplyEdit(params: unknown): Promise<ApplyEditResult> {
    if (!this.alive || !this.root || !this.deps.emitApplyEdit) {
      return Promise.resolve({ applied: false, failureReason: 'The window cannot apply the edit right now.' })
    }
    const p = (params && typeof params === 'object' ? params : {}) as { label?: unknown; edit?: unknown }
    let edit: LspWorkspaceEdit
    try {
      edit = normalizeWorkspaceEdit(p.edit, this.mirror.editContext(this.root))
    } catch (err) {
      return Promise.resolve({ applied: false, failureReason: err instanceof Error ? err.message : String(err) })
    }
    if (edit.files.length === 0) return Promise.resolve({ applied: true })
    return this.edits.request(edit, typeof p.label === 'string' ? p.label : undefined)
  }

  /** Folder/window ended: pending edits become "not applied" and exclusive in-flight requests are cancelled. */
  private dropRequests(reason: string): void {
    this.edits.dropAll(reason)
    this.exclusive.cancelAll()
    this.lastCompletion = null
    this.lenses.clear()
    this.hierarchyItems.clear()
  }

  private serverOf(doc: ManagedDoc): ServerEntry | undefined {
    return doc.serverId ? this.servers.get(doc.serverId) : undefined
  }

  private currentRoot(): string | null {
    const root = this.deps.getRoot()
    if (this.root && (!root || pathKey(root) !== pathKey(this.root))) {
      // The folder switched without anyone telling: the old servers belong to the old folder.
      void this.shutdown()
    }
    this.root = root
    return root
  }

  private ensureServer(def: ResolvedServer, root: string): ServerEntry {
    const existing = this.servers.get(def.id)
    if (existing) return existing
    const id = def.id
    const entry: ServerEntry = {
      def,
      signature: configSignature(def),
      state: 'starting',
      server: new LanguageServer({
        id,
        root,
        launch: () => (this.deps.launchFor ? this.deps.launchFor(def, root) : buildLaunch(def)),
        initializationOptions: () => (this.deps.initOptionsFor ?? initializationOptions)(def, root),
        settings: () => workspaceSettings(def),
        ...this.deps.serverOptions,
        host: {
          getDocuments: () => this.mirror.forServer(id),
          onState: (state, message) => {
            if (this.servers.get(id) !== entry) return
            entry.state = state
            entry.message = message
            this.emitStatus()
          },
          onLog: (level, message) => this.pushLog(id, level, message),
          applyEdit: (params) =>
            this.servers.get(id) === entry
              ? this.onServerApplyEdit(params)
              : Promise.resolve({ applied: false, failureReason: 'The server was restarted or shut down.' }),
          onRefresh: (kind) => {
            if (this.servers.get(id) === entry) this.emit(() => this.deps.emitRefresh?.({ kind, serverId: id }))
          },
          onDiagnostics: (uri, version, raw) => {
            if (this.servers.get(id) === entry) this.onDiagnostics(id, uri, version, raw)
          },
          onGaveUp: () => {
            if (this.servers.get(id) !== entry) return
            for (const doc of this.mirror.forServer(id)) this.clearDiagnostics(doc)
          }
        }
      })
    }
    this.servers.set(id, entry)
    this.pushLog(id, 'info', msg().log.willStart(def.name, root))
    this.emitStatus()
    entry.server.start()
    return entry
  }

  private detach(id: string, entry: ServerEntry): void {
    this.servers.delete(id)
    if (this.lastCompletion?.entry === entry) this.lastCompletion = null
    this.dropResults(entry)
    for (const doc of this.mirror.forServer(id)) this.clearDiagnostics(doc)
    this.pushLog(id, 'info', msg().log.stopped)
    void entry.server.stop()
  }

  private onDiagnostics(serverId: string, uri: string, version: number | null, raw: unknown): void {
    const file = uriToPath(uri)
    const doc = file ? this.mirror.get(file) : undefined
    // Only open documents (and of this server): a `close` or server switch in flight cannot resurrect markers.
    if (!doc || doc.serverId !== serverId) return
    doc.diagnostics = Array.isArray(raw) ? raw : []
    const diagnostics = mapDiagnostics(raw)
    this.emit(() => this.deps.emitDiagnostics({ path: doc.path, version, diagnostics }))
  }

  private clearDiagnostics(doc: ManagedDoc): void {
    doc.diagnostics = []
    this.emit(() => this.deps.emitDiagnostics({ path: doc.path, version: null, diagnostics: [] }))
  }

  private pushLog(server: string, level: LspLogLevel, message: string): void {
    const entry = this.logs.push(server, level, message)
    this.logBatch.push(entry)
  }

  private emitStatus(): void {
    this.emit(() => this.deps.emitStatus(this.status()))
  }

  private emit(fn: () => void): void {
    if (this.alive) fn()
  }
}

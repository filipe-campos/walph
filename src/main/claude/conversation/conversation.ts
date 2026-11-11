// A conversation with Claude Code: an Agent SDK `query()` (one CLI process) with streaming input, owned by the window
// that created it. It is the facade of `run.ts` (process), `messageRouter.ts` (SDK messages → events), `controls.ts`
// (mode, model, effort), `checkpoints.ts` (rewind, fork) and `idlePolicy.ts` (sleep); it does the permission round trip
// (`canUseTool` ↔ `respond`) and the IDE tools. It does not know Electron: `claude/conversationDeps.ts` wires this to
// the window.

import { t } from '@shared/i18n'
import { titleFrom } from '../sessionTitle'
import { randomUUID } from 'node:crypto'
import type { HookCallback, Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type {
  ClaudeAgentStatus,
  ClaudeBackgroundTask,
  ClaudeAccount,
  ClaudeContextUsage,
  ClaudeUsageReport,
  ClaudeConversationStatus,
  ClaudeEffort,
  ClaudeError,
  ClaudeMessage,
  ClaudeModelOption,
  ClaudePermissionMode,
  ClaudePermissionResponse,
  ClaudePromptInput,
  ClaudeSlashCommand,
  ClaudeStartOptions,
  ClaudeStarted,
  Settings
} from '@shared/types'
import { sameBackgroundTasks } from '../backgroundTasks'
import { normalizeAccount } from '../auth'
import type { ClaudeCliRunner, CliContext } from '../cliRunner'
import { normalizeUsage } from '../usage'
import { McpController } from '../mcpController'
import { PermissionBroker } from '../permissionBroker'
import { resolveCliContext } from '../cliContext'
import { createIdeServer } from '../ideServer'
import { buildLaunchOptions } from '../launchOptions'
import { TIMEOUT, withDeadline } from '../../util/deadline'
import { resolveInsideRoot } from '../../fs/paths'
import {
  INITIAL_SESSION_STATE,
  notifyMoment,
  reduceSession,
  viewChanged,
  type SessionInput,
  type SessionState
} from '../sessionStatus'
import { ConversationError } from '../conversationError'
import type { ConversationDeps } from './deps'
import { Checkpoints } from './checkpoints'
import { CommandCatalog } from './commandCatalog'
import { Controls } from './controls'
import type { ConversationData } from './data'
import { IdlePolicy } from './idlePolicy'
import { loadHistory } from './history'
import { Interrupts } from './interrupts'
import { MessageRouter, initCommandsOf, type RouteOp } from './messageRouter'
import { sendPrompt, type SendHost } from './send'
import { RunManager, type LaunchInput, type LaunchRequest, type Run } from './run'
import { UserError } from '../../errors'

const CONTEXT_DEADLINE_MS = 3000
/**
 * Maximum wait, on the first send of each CLI process, for the MCP servers still connecting: without it the turn
 * starts before them and the tools disappear (common when waking a conversation or resuming a hibernated workspace).
 */
const MCP_CONNECT_WAIT_MS = 15_000
const USAGE_METHOD = 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET'
const USAGE_DEADLINE_MS = 15_000

export class ClaudeConversation {
  /** MCP servers of `/mcp`: status, enable, reconnect, login, add and remove. */
  readonly mcp: McpController
  private status: ClaudeConversationStatus = 'starting'
  private closed = false
  private readonly data: ConversationData
  private readonly runs: RunManager
  private readonly controls: Controls
  private readonly checkpoints: Checkpoints
  private readonly sendHost: SendHost
  private readonly interrupts: Interrupts
  private readonly idle: IdlePolicy
  private readonly router: MessageRouter
  private readonly catalog: CommandCatalog
  private readonly permissions: PermissionBroker
  private pendingNotice: string | null
  private models: ClaudeModelOption[] = []
  /** Account reported by the CLI in the last `init` (`null` = not reported). */
  private account: ClaudeAccount | null = null
  private titled = false
  private title = t().claudeHost.conversation.newTitle
  /** Title given by the user: it beats the automatic one, which stops being emitted while it exists. */
  private userTitle: string | null = null
  private session: SessionState = INITIAL_SESSION_STATE
  /** Closed on purpose (`close()`): nothing more is emitted about the status. */
  private discarded = false
  /** Background tasks of the current process (`background_tasks_changed`, the whole set on every change). */
  private backgroundTasks: ClaudeBackgroundTask[] = []
  private lastContext: ClaudeContextUsage | null = null

  constructor(
    readonly id: string,
    private readonly deps: ConversationDeps,
    private readonly options: ClaudeStartOptions
  ) {
    this.data = {
      sessionId: options.resume ?? randomUUID(),
      persisted: !!options.resume,
      transcript: [],
      hadResult: false,
      resumeAtOnWake: undefined
    }
    this.router = new MessageRouter(id)
    this.catalog = new CommandCatalog(deps)
    this.idle = new IdlePolicy({
      idleMs: () => this.deps.idleSleepMs ?? this.deps.getSettings()['claude.idleSleepMinutes'] * 60_000,
      parked: () =>
        !this.closed &&
        !this.runs.isAsleep &&
        !!this.runs.current &&
        this.status === 'idle' &&
        this.backgroundTasks.length === 0 &&
        this.permissions.pendingCount === 0 &&
        !this.mcp.authPending,
      persisted: () => this.data.persisted,
      sleep: () => void this.runs.sleep()
    })
    this.runs = new RunManager({
      isClosed: () => this.closed,
      getRoot: () => this.deps.getRoot(),
      loadSdk: () => this.deps.loadSdk(),
      cliEnvironment: () => this.cliEnvironment(),
      launchOptions: (input) => this.launchOptions(input),
      launched: (request) => this.launched(request),
      handleMessage: (message) => this.handle(message),
      fail: (error) => this.fail(error),
      loadInit: (run) => this.loadInit(run),
      mcpWaitMs: () => this.deps.mcpConnectWaitMs ?? MCP_CONNECT_WAIT_MS,
      mcpPending: (names) => this.notice(t().claudeHost.conversation.mcpConnecting(names.join(', '))),
      mcpReady: (timedOut) => this.deps.emit({ type: 'mcpReady', id: this.id, timedOut }),
      canSleep: () => this.idle.canSleep()
    })
    this.controls = new Controls(
      {
        id,
        emit: (event) => this.deps.emit(event),
        getSettings: () => this.deps.getSettings(),
        isClosed: () => this.closed,
        fail: (error) => this.fail(error)
      },
      this.runs,
      options
    )
    this.pendingNotice = this.controls.startNotice
    this.checkpoints = new Checkpoints(
      {
        getRoot: () => this.deps.getRoot(),
        loadSdk: () => this.deps.loadSdk(),
        title: () => this.sessionTitle,
        isWorking: () => this.status === 'working',
        assertOpen: () => void this.runs.live(),
        beginBusy: () => this.idle.begin(),
        endBusy: () => this.idle.end(),
        ensureRun: () => this.ensureRun(),
        discardRun: async (run) => {
          this.permissions.cancelAllPending()
          this.runs.detach()
          await this.runs.stop(run)
        },
        relaunch: (resumeAt, fresh) => this.launch(resumeAt, fresh),
        fail: (error) => this.fail(error),
        sessionIdChanged: (from, to) => this.deps.onSessionIdChange?.(from, to)
      },
      this.data
    )
    this.interrupts = new Interrupts({
      isWorking: () => this.status === 'working',
      current: () => this.runs.current,
      stuck: (error) => this.fail(error)
    })
    this.sendHost = {
      runs: this.runs,
      getRoot: () => this.deps.getRoot(),
      verifyAttachment: (path) => this.deps.verifyAttachment?.(path) ?? Promise.resolve('unknown'),
      isClosed: () => this.closed,
      isRewinding: () => this.checkpoints.isRewinding,
      status: () => this.status,
      ensureRun: () => this.ensureRun(),
      beginBusy: () => this.idle.begin(),
      endBusy: () => this.idle.end(),
      clearInterruptTimer: () => this.interrupts.clearTimer(),
      emitMessage: (message) => this.emitMessage(message),
      firstPrompt: (text) => {
        if (this.titled) return
        this.titled = true
        this.title = titleFrom(text)
        // With a user title, the automatic one does not show (nor overwrite the tab).
        if (this.userTitle === null) this.deps.emit({ type: 'title', id: this.id, title: this.title })
      },
      setWorking: () => this.setStatus('working')
    }
    this.permissions = new PermissionBroker({
      id,
      emit: (event) => this.deps.emit(event),
      isClosed: () => this.closed,
      getRoot: () => this.deps.getRoot(),
      plansDir: () => this.deps.plansDir?.(),
      openExternal: (url) => this.deps.openExternal?.(url) ?? Promise.resolve(),
      applySession: (input) => this.applySession(input),
      holdIdle: () => this.idle.hold(),
      refreshIdle: () => this.idle.update(),
      adoptPermissionMode: (mode) => this.controls.adoptPermissionMode(mode)
    })
    this.mcp = new McpController({
      ensureRun: () => this.ensureRun(),
      settleWake: () => this.runs.settle(),
      beginBusy: () => this.idle.begin(),
      endBusy: () => this.idle.end(),
      refreshIdle: () => this.idle.update(),
      notice: (message) => this.notice(message),
      prepareCli: () => this.prepareCli(),
      openExternal: (url) => this.deps.openExternal?.(url) ?? Promise.resolve()
    })
  }

  // ---- start ----

  /** Validates the environment, loads the history (resume) and starts the process. Throws if it cannot start. */
  async start(): Promise<ClaudeStarted> {
    const root = this.deps.getRoot()
    if (!root) throw new UserError(t().claudeHost.conversation.openFolder)
    let title: string | undefined
    let favorite = false
    if (this.options.resume) {
      const history = await loadHistory(this.deps, root, this.options.resume)
      favorite = history.favorite
      this.userTitle = history.userTitle
      this.data.transcript = history.transcript
      // `this.title` is always the AUTOMATIC one.
      if (history.autoTitle) this.title = history.autoTitle
      title = history.title
      this.titled = true
    }
    await this.launch(undefined)
    return {
      id: this.id,
      messages: [...this.data.transcript],
      ...(title !== undefined ? { title } : {}),
      favorite,
      ...(this.userTitle ? { userTitle: this.userTitle } : {})
    }
  }

  /** CLI process environment (also `claude mcp …`): login PATH, executable from `claude.executable`, `claude.env`. */
  private async cliEnvironment(): Promise<{
    settings: Settings
    executable: string | undefined
    env: Record<string, string>
  }> {
    const settings = this.deps.getSettings()
    const { executable, env } = await resolveCliContext(
      settings,
      this.deps.getRoot() ?? '',
      async () => (await this.deps.loginPath?.()) ?? null
    )
    if (this.closed) throw new ConversationError('closed')
    return { settings, executable, env }
  }

  private launch(resumeAt: string | undefined, fresh = false, wake = false): Promise<void> {
    return this.runs.launch({ resumeAt, fresh, wake })
  }

  private ensureRun(): Promise<Run> {
    return this.runs.ensureRun(() => this.data.resumeAtOnWake)
  }

  private launchOptions(input: LaunchInput): Options {
    const { sdk, root, settings, executable, env, request, state, spawnClaudeCodeProcess } = input
    const allowBypass = settings['claude.allowBypassPermissions'] === true
    this.controls.prepareLaunch(allowBypass)
    return buildLaunchOptions({
      root,
      env,
      permissionMode: this.controls.permissionMode,
      allowBypass,
      model: this.controls.model,
      effort: this.controls.effort,
      fallbackModel: settings['claude.fallbackModel'],
      executable,
      sessionId: this.data.sessionId,
      resume: !request.fresh && [this.options.resume, request.resumeAt, request.wake].some(Boolean),
      resumeAt: request.resumeAt,
      canUseTool: this.permissions.canUseTool,
      onElicitation: this.permissions.onElicitation,
      mcpServers: { walph: createIdeServer(sdk, this.ideHost()) },
      hooks: { Stop: [{ hooks: [this.stopHook(state)] }] },
      spawnClaudeCodeProcess
    })
  }

  /** The new process took over: what belonged to the previous one (schedules, background tasks) died with it. */
  private launched(request: LaunchRequest): void {
    this.idle.resetSchedule()
    this.setBackgroundTasks([])
    if (!request.wake) this.setStatus('starting')
  }

  private async loadInit(run: Run): Promise<void> {
    try {
      const init = await run.query.initializationResult()
      if (run !== this.runs.current) return
      this.account = normalizeAccount((init as { account?: unknown }).account)
      await this.catalog.load(initCommandsOf(init.commands))
      if (run !== this.runs.current) return
      this.models = init.models.map((m) => ({
        value: m.value,
        displayName: m.displayName,
        description: m.description,
        ...(typeof m.resolvedModel === 'string' ? { resolvedModel: m.resolvedModel } : {}),
        efforts: m.supportedEffortLevels ?? []
      }))
      await this.controls.clampEffort(run, this.models)
      if (run !== this.runs.current) return
      if (this.status === 'starting') this.setStatus('idle')
      this.emitInit()
      if (this.pendingNotice) {
        this.notice(this.pendingNotice)
        this.pendingNotice = null
      }
    } catch {
      // A startup failure shows up in `pump` (iterator exception) with the process stderr.
    }
  }

  /** List of the `/` menu: `init` merged with the files, reread on every call. Before `init`, only the files. */
  slashCommands(): Promise<ClaudeSlashCommand[]> {
    return this.catalog.list()
  }

  private emitInit(): void {
    this.deps.emit({
      type: 'init',
      id: this.id,
      sessionId: this.data.sessionId,
      model: this.controls.model || 'default',
      permissionMode: this.controls.permissionMode,
      commands: this.catalog.commands,
      models: this.models,
      effort: this.controls.effort ?? null,
      account: this.account
    })
  }

  private notice(message: string): void {
    this.deps.emit({ type: 'notice', id: this.id, message })
  }

  // ---- SDK messages ----

  private handle(message: SDKMessage): void {
    this.apply(
      this.router.route(message, {
        status: this.status,
        hasCrons: this.idle.hasCrons,
        interruptPending: this.interrupts.hasPending
      })
    )
  }

  private apply(ops: RouteOp[]): void {
    for (const op of ops) {
      switch (op.op) {
        case 'emit':
          this.deps.emit(op.event)
          break
        case 'status':
          this.setStatus(op.status)
          break
        case 'session':
          this.applySession(op.input)
          break
        case 'message':
          this.emitMessage(op.message)
          break
        case 'init':
          this.data.sessionId = op.sessionId
          this.controls.adoptInit(op.model, op.permissionMode)
          this.emitInit()
          break
        case 'emitInit':
          this.emitInit()
          break
        case 'turnEnded':
          this.interrupts.turnEnded()
          this.data.hadResult = true
          this.data.persisted = true
          this.data.resumeAtOnWake = undefined
          this.controls.clearOverrides()
          break
        case 'interruptSettled':
          this.interrupts.clearTimer()
          break
        case 'backgroundTasks':
          this.setBackgroundTasks(op.tasks)
          break
        case 'initCommands':
          this.catalog.setInit(op.commands)
          break
        case 'adoptModel':
          this.controls.adoptModel(op.model)
          break
        case 'retract': {
          const gone = new Set(op.uuids)
          this.data.transcript = this.data.transcript.filter((m) => !gone.has(m.uuid))
          break
        }
      }
    }
  }

  private emitMessage(message: ClaudeMessage): void {
    this.data.transcript.push(message)
    this.deps.emit({ type: 'message', id: this.id, message })
  }

  private reportError(error: ClaudeError): void {
    this.deps.emit({ type: 'error', id: this.id, error })
    this.applySession({ type: 'error' })
  }

  /** Feeds the session status reducer and notifies only when `status`/`unread` change. */
  private applySession(input: SessionInput): void {
    if (this.discarded) return
    const prev = this.session
    const next = reduceSession(prev, input)
    this.session = next
    if (!viewChanged(prev, next)) return
    this.deps.emit({ type: 'sessionStatus', id: this.id, status: next.status, unread: next.unread })
    this.deps.onSessionChange?.({
      status: next.status,
      previous: prev.status,
      unread: next.unread,
      notify: notifyMoment(next),
      question: next.question
    })
  }

  // ---- title and displayed state ----

  /** Session title for system notifications (user/Claude text: untrusted). */
  get sessionTitle(): string {
    return this.userTitle ?? this.title
  }

  /** Current `sessionId` (changes only when a rewind to the beginning creates a new session). */
  get currentSessionId(): string {
    return this.data.sessionId
  }

  /** Title given by the user (`null` = the automatic one). */
  get customTitle(): string | null {
    return this.userTitle
  }

  /**
   * Applies the user title (`null` = back to the automatic one). Notifies the renderer with a `title` so the tab does
   * not depend on `setSessionMeta` having finished.
   */
  setUserTitle(title: string | null): void {
    this.userTitle = title
    if (this.titled) this.deps.emit({ type: 'title', id: this.id, title: this.sessionTitle })
  }

  /** Automatic title (first message), even with a user title on top. */
  get autoTitle(): string {
    return this.title
  }

  /** In-memory transcript (already without the injected context) and the displayed title, for export. */
  exportData(): { title: string; messages: ClaudeMessage[] } {
    return { title: this.sessionTitle, messages: [...this.data.transcript] }
  }

  /** Displayed session status (for the workspace aggregate). */
  get agentStatus(): ClaudeAgentStatus {
    return this.discarded ? 'idle' : this.session.status
  }

  /** Unread count of this session (for the app badge). */
  get unread(): number {
    return this.discarded ? 0 : this.session.unread
  }

  /** The user is viewing the session: resets `unread` and `done` becomes `idle`. */
  markRead(): void {
    this.applySession({ type: 'markRead' })
  }

  /** Unrecoverable failure: the process died or did not start. The conversation closes; the panel can resume it. */
  private fail(error: ClaudeError): void {
    if (this.closed) return
    const run = this.teardown()
    this.reportError(error)
    this.setStatus('closed')
    this.deps.onClosed?.()
    if (run) void this.runs.stop(run)
  }

  /**
   * Marks the conversation as ended and releases what keeps it alive (timers, requests, `claude mcp`); returns the
   * process to stop.
   */
  private teardown(): Run | null {
    this.closed = true
    this.mcp.dispose()
    this.interrupts.clearTimer()
    this.idle.dispose()
    this.permissions.cancelAllPending()
    return this.runs.current
  }

  private setStatus(status: ClaudeConversationStatus): void {
    if (this.status === status) return
    this.status = status
    this.deps.emit({ type: 'status', id: this.id, status })
    if (status === 'working') this.applySession({ type: 'working' })
    else if (status === 'idle') this.applySession({ type: 'idle' })
    else if (status === 'closed') this.applySession({ type: 'closed' })
    this.idle.update()
  }

  private async readContext(): Promise<ClaudeContextUsage | null> {
    const run = this.runs.current
    // While asleep, the last known value holds (the session context does not change without turns).
    if (!run) return this.runs.isAsleep ? this.lastContext : null
    const usage = (await withDeadline(run.query.getContextUsage(), CONTEXT_DEADLINE_MS).catch(
      (): typeof TIMEOUT => TIMEOUT
    )) as Awaited<ReturnType<typeof run.query.getContextUsage>> | typeof TIMEOUT | undefined
    if (usage === TIMEOUT || !usage) return null
    this.lastContext = { usedTokens: usage.totalTokens, maxTokens: usage.maxTokens, percentage: usage.percentage }
    return this.lastContext
  }

  // ---- idleness ----

  /** SDK `Stop` hook: records whether the session has schedules or background tasks that will wake it. */
  private stopHook(state: Run['state']): HookCallback {
    return (input) => {
      if (!state.stopped && input.hook_event_name === 'Stop') {
        this.idle.noteStop((input.session_crons?.length ?? 0) > 0, (input.background_tasks?.length ?? 0) > 0)
      }
      return Promise.resolve({})
    }
  }

  /** Background subagents/commands keep the session "running" even without a turn (and the CLI awake). */
  private setBackgroundTasks(tasks: ClaudeBackgroundTask[]): void {
    if (sameBackgroundTasks(this.backgroundTasks, tasks)) return
    const was = this.backgroundTasks.length > 0
    this.backgroundTasks = tasks
    this.deps.emit({ type: 'backgroundTasks', id: this.id, tasks })
    if (was !== tasks.length > 0) this.applySession({ type: 'background', active: tasks.length > 0 })
    this.idle.update()
  }

  /** There is a pending `/loop`/cron/background task: the view must not hibernate either. */
  get hasScheduledWork(): boolean {
    return !this.closed && (this.idle.scheduled || this.backgroundTasks.length > 0)
  }

  // ---- send ----

  send(input: ClaudePromptInput): Promise<string> {
    return sendPrompt(this.sendHost, input)
  }

  async interrupt(): Promise<void> {
    const run = this.runs.current
    if (!run || this.closed) return
    this.permissions.cancelAllPending()
    await this.interrupts.request(run)
  }

  /** Stops a background task; only ids from the current list (the renderer does not pick arbitrary tasks). */
  async stopTask(taskId: string): Promise<void> {
    const run = this.runs.current
    if (!this.backgroundTasks.some((t) => t.id === taskId))
      throw new UserError(t().claudeHost.conversation.taskFinished)
    if (!run || this.closed) throw new ConversationError('closed')
    try {
      await run.query.stopTask(taskId)
    } catch {
      throw new UserError(t().claudeHost.conversation.stopTaskFailed)
    }
  }

  // ---- shutdown ----

  /** Ends the conversation (close the tab, switch folders, reload, close the window). Waits for the process to exit. */
  async close(): Promise<void> {
    // Even if it already failed (`fail`): closing the tab discards the status and takes the conversation off the badge.
    this.discarded = true
    if (this.closed) return
    const run = this.teardown()
    this.setStatus('closed')
    this.deps.onClosed?.()
    this.runs.detach()
    if (run) await this.runs.stop(run)
    await this.runs.settled()
  }

  // ---- controls ----

  setPermissionMode(mode: ClaudePermissionMode): Promise<void> {
    return this.controls.setPermissionMode(mode)
  }

  setModel(model: string): Promise<void> {
    return this.controls.setModel(model)
  }

  /** `null` = "auto": back to the model's default effort. */
  setEffort(effort: ClaudeEffort | null): Promise<void> {
    return this.controls.setEffort(effort)
  }

  /** Settings changed: with bypass turned off and the conversation in that mode, it leaves bypass. */
  onSettingsChanged(): Promise<void> {
    return this.controls.onSettingsChanged()
  }

  /** `/usage`; wakes the CLI if it was asleep. `null` = this Claude Code version lacks the API (experimental). */
  async usage(): Promise<ClaudeUsageReport | null> {
    if (!this.runs.open) throw new ConversationError('closed')
    this.idle.begin()
    try {
      const run = await this.ensureRun()
      const fn = (run.query as unknown as Record<string, unknown>)[USAGE_METHOD]
      if (typeof fn !== 'function') return null
      const raw = await withDeadline(
        (fn as (o: object) => Promise<unknown>).call(run.query, { skipBehaviors: true }),
        USAGE_DEADLINE_MS
      ).catch((): typeof TIMEOUT => TIMEOUT)
      if (raw === TIMEOUT || raw === null) throw new ConversationError('usageTimeout')
      return normalizeUsage(raw, this.account)
    } catch (err) {
      if (err instanceof ConversationError) throw err
      throw new UserError(t().claudeHost.conversation.usageFailed, { cause: err })
    } finally {
      this.idle.end()
    }
  }

  /**
   * Rereads the credentials (logout/login): the idle process is ended and relaunched with `resume`, which re-emits
   * `init` (with the account) and `mcpReady`; without a saved session, starts a new CLI. A busy conversation stays as
   * is. Returns whether it restarted.
   */
  async restartForAuth(): Promise<boolean> {
    if (!this.idle.isQuiescent()) return false
    this.idle.hold()
    if (this.data.persisted) {
      await this.runs.sleep()
      if (this.closed || !this.runs.isAsleep) return false
      await this.ensureRun()
      return true
    }
    // Without a saved session there is nothing to resume: start a new CLI (the session does not exist for the CLI yet).
    this.idle.begin()
    try {
      await this.launch(undefined)
    } finally {
      this.idle.end()
    }
    return !this.closed
  }

  async contextUsage(): Promise<ClaudeContextUsage | null> {
    return this.data.hadResult ? this.readContext() : null
  }

  /** Runner and context for `claude mcp …` (same PATH/executable/env as the conversation process). */
  private async prepareCli(): Promise<{ run: ClaudeCliRunner; context: Omit<CliContext, 'signal'> }> {
    const root = this.deps.getRoot()
    if (!root) throw new UserError(t().claudeHost.conversation.openFolder)
    const run = this.deps.runCli ?? (() => Promise.reject(new UserError(t().claudeHost.cli.runUnavailable)))
    const { env, executable } = await this.cliEnvironment()
    return { run, context: { cwd: root, env, ...(executable ? { executable } : {}) } }
  }

  // ---- checkpoints ----

  rewind(
    messageUuid: string,
    what: { code: boolean; conversation: boolean }
  ): Promise<{ filesChanged: string[]; messages?: ClaudeMessage[] }> {
    return this.checkpoints.rewind(messageUuid, what)
  }

  /** Duplicates the session and returns the new `sessionId`; the renderer opens it with `start({ resume })`. */
  fork(): Promise<string> {
    return this.checkpoints.fork()
  }

  // ---- permissions ----

  /** `false` = response rejected (request stays pending); `true` = accepted or the request no longer exists. */
  respond(requestId: string, response: ClaudePermissionResponse): boolean {
    return this.permissions.respond(requestId, response)
  }

  // ---- IDE tools ----

  private ideHost() {
    return {
      getRoot: () => this.deps.getRoot(),
      getEditorContext: () => this.deps.getEditorContext(),
      getDiagnostics: async (path?: string) => {
        const root = this.deps.getRoot()
        if (!root) return []
        const wanted = path ? await resolveInsideRoot(root, path) : undefined
        return this.deps.getDiagnostics(wanted)
      },
      openDiff: (filePath: string, newContents: string) => this.permissions.openDiff(filePath, newContents)
    }
  }
}

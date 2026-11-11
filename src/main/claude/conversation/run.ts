import { t } from '@shared/i18n'
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeError, Settings } from '@shared/types'
import { classifyFailure } from '../errors'
import { PushStream } from '../pushStream'
import type { Sdk } from '../sdk'
import { createClaudeSpawner, killProcess, type ClaudeProcess } from '../spawn'
import { ConversationError } from '../conversationError'
import { waitMcpConnected } from './mcpConnect'
import { UserError } from '../../errors'

/** Deadline for the CLI to exit on its own (EOF on stdin) before we kill the tree. */
const STOP_GRACE_MS = 2500

/** One `query()` run; a rewind/resume creates another. */
export interface Run {
  query: Query
  input: PushStream<SDKUserMessage>
  state: {
    proc: ClaudeProcess | null
    /** Stopped on purpose: nothing it emits holds anymore, and a process that starts late is killed right away. */
    stopped: boolean
  }
  /** MCP servers of this process finished connecting (or the deadline expired); `ready` resolves when that happens. */
  mcp: { settled: boolean; ready: Promise<void> }
}

export interface LaunchRequest {
  /** Session point to resume from (rewind). */
  resumeAt: string | undefined
  /** New session even if there is something to resume (rewind to the beginning). */
  fresh: boolean
  /** Relaunch after sleeping: resumes the whole session and does not touch the displayed status. */
  wake: boolean
}

export interface LaunchInput {
  sdk: Sdk
  root: string
  settings: Settings
  executable: string | undefined
  env: Record<string, string>
  request: LaunchRequest
  state: Run['state']
  spawnClaudeCodeProcess: NonNullable<Options['spawnClaudeCodeProcess']>
}

/** What the manager needs from the conversation that owns it. */
export interface RunHost {
  isClosed(): boolean
  getRoot(): string | null
  loadSdk(): Promise<Sdk>
  /** CLI process environment; throws `closed` if the conversation closed meanwhile. */
  cliEnvironment(): Promise<{ settings: Settings; executable: string | undefined; env: Record<string, string> }>
  /** `query()` options: everything that depends on the conversation state (mode, model, session, callbacks). */
  launchOptions(input: LaunchInput): Options
  /** The new process took over: the conversation resets what belonged to the previous one. */
  launched(request: LaunchRequest): void
  handleMessage(message: SDKMessage): void
  fail(error: ClaudeError): void
  loadInit(run: Run): Promise<void>
  /** Maximum wait for the MCPs on the first send of each process (ms). */
  mcpWaitMs(): number
  mcpPending(names: string[]): void
  mcpReady(timedOut: boolean): void
  /** The conversation can sleep now (see `IdlePolicy.canSleep`). */
  canSleep(): boolean
}

/**
 * The CLI process of a conversation: start, stop, sleep and wake. There are never two CLIs in the same conversation;
 * the conversation (`RunHost`) decides what happens with messages and failures.
 */
export class RunManager {
  private run: Run | null = null
  /** No CLI process on purpose (idle): the conversation stays open and `ensureRun` relaunches with `resume`. */
  private asleep = false
  private waking: Promise<Run> | null = null
  /** The process that went to sleep is still exiting: a relaunch waits, so there are never two CLIs in one session. */
  private stopping: Promise<void> | null = null

  constructor(private readonly host: RunHost) {}

  get current(): Run | null {
    return this.run
  }

  get isAsleep(): boolean {
    return this.asleep
  }

  /** The conversation accepts actions: it was not ended and has a process (or is asleep). */
  get open(): boolean {
    return !this.host.isClosed() && (!!this.run || this.asleep)
  }

  async launch(request: LaunchRequest): Promise<void> {
    const root = this.host.getRoot()
    if (!root) throw new UserError(t().claudeHost.conversation.openFolder)
    const sdk = await this.host.loadSdk()
    const { settings, executable, env } = await this.host.cliEnvironment()

    const state: Run['state'] = { proc: null, stopped: false }
    const input = new PushStream<SDKUserMessage>()
    const options = this.host.launchOptions({
      sdk,
      root,
      settings,
      executable,
      env,
      request,
      state,
      spawnClaudeCodeProcess: createClaudeSpawner((proc) => {
        state.proc = proc
        if (state.stopped) killProcess(proc)
      })
    })
    const run: Run = {
      query: sdk.query({ prompt: input, options }),
      input,
      state,
      mcp: { settled: false, ready: Promise.resolve() }
    }
    if (this.host.isClosed()) {
      // Closed during the relaunch: do not leave an orphan CLI.
      void this.stop(run)
      throw new ConversationError('closed')
    }
    // Never two CLIs in one conversation: if a process is still registered, it exits before the new one takes over.
    const previous = this.run
    if (previous) void this.trackStopping(this.stop(previous))
    this.run = run
    this.asleep = false
    this.host.launched(request)
    void this.pump(run)
    void this.host.loadInit(run)
    run.mcp.ready = waitMcpConnected(run, {
      waitMs: this.host.mcpWaitMs(),
      isCurrent: () => run === this.run,
      pending: (names) => this.host.mcpPending(names),
      ready: (timedOut) => this.host.mcpReady(timedOut)
    })
  }

  private async pump(run: Run): Promise<void> {
    try {
      for await (const message of run.query) {
        if (run !== this.run || run.state.stopped) return
        this.host.handleMessage(message)
      }
      // The iterator only ends on its own if the CLI exited (the input never closes while the conversation lives).
      if (run === this.run && !run.state.stopped)
        this.host.fail(classifyFailure(new Error('process exited'), run.state.proc?.stderr))
    } catch (err) {
      if (run === this.run && !run.state.stopped) this.host.fail(classifyFailure(err, run.state.proc?.stderr))
    }
  }

  /** The current process, or `null` if the conversation is asleep (controls only store the value); throws if ended. */
  live(): Run | null {
    if (!this.open) throw new ConversationError('closed')
    return this.run
  }

  /** A relaunch in progress finishes before a control is applied: that way it goes to the new process. */
  async settle(): Promise<void> {
    await this.waking?.catch(() => undefined)
  }

  /**
   * The process for an action that needs it; relaunches (once, even with simultaneous calls) if it was asleep.
   * `resumeAt`: after a rewind the relaunch resumes AT THIS point.
   */
  ensureRun(resumeAt: () => string | undefined): Promise<Run> {
    if (this.host.isClosed()) return Promise.reject(new ConversationError('closed'))
    if (this.run) return Promise.resolve(this.run)
    if (!this.asleep) return Promise.reject(new ConversationError('closed'))
    this.waking ??= (async () => {
      try {
        await this.stopping
        await this.launch({ resumeAt: resumeAt(), fresh: false, wake: true })
        return this.run!
      } finally {
        this.waking = null
      }
    })()
    return this.waking
  }

  /**
   * Ends the CLI process keeping the conversation open: no event, status and sessionId intact. The state (model,
   * effort, mode) stays in the conversation and goes into the relaunch options.
   */
  async sleep(): Promise<void> {
    if (!this.host.canSleep()) return
    const run = this.run!
    this.run = null
    this.asleep = true
    await this.trackStopping(this.stop(run))
  }

  /** Releases the current process (the conversation will relaunch or close); whoever receives it stops it. */
  detach(): Run | null {
    const run = this.run
    this.run = null
    return run
  }

  /** Waits for a process that went to sleep or was replaced to finish exiting. */
  async settled(): Promise<void> {
    await this.stopping
  }

  async stop(run: Run): Promise<void> {
    run.state.stopped = true
    run.input.end()
    try {
      run.query.close()
    } catch {
      // already closed
    }
    const proc = run.state.proc
    if (!proc || proc.exited) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        killProcess(proc)
        resolve()
      }, STOP_GRACE_MS)
      proc.child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  /** Records a CLI exit in `stopping` (`close()` and the relaunch wait) without erasing another launch's. */
  private trackStopping(stop: Promise<void>): Promise<void> {
    const prior = this.stopping
    const tracked: Promise<void> = (prior ? prior.then(() => stop) : stop).finally(() => {
      if (this.stopping === tracked) this.stopping = null
    })
    this.stopping = tracked
    return tracked
  }
}

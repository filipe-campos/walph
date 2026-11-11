// MCP servers of a conversation's panel (`/mcp`): list, enable, reconnect, OAuth login, add and remove.
// Everything goes through a queue (one action at a time) and counts as conversation activity; the rest of the
// conversation comes through `McpHost`.

import { t } from '@shared/i18n'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeMcpAuthResult, ClaudeMcpScope, ClaudeMcpServer } from '@shared/types'
import { rejectAfter } from '../util/deadline'
import { SerialQueue } from '../util/serialQueue'
import type { ClaudeCliRunner, CliContext } from './cliRunner'
import {
  WALPH_SERVER,
  applyMcpMemory,
  cleanCliError,
  mcpAddArgs,
  mcpKey,
  mcpRemoveArgs,
  normalizeMcpStatus,
  parseAuthResponse,
  type ValidMcpServer
} from './mcp'
import { mcpExtra } from './sdkTypes'
import { UserError } from '../errors'

/** Deadlines of the MCP actions: list/toggle is fast; reconnect and authenticate wait for the server. */
const MCP_DEADLINE_MS = 15_000
const MCP_SLOW_DEADLINE_MS = 45_000
/** Time during which the CLI does not sleep after starting an OAuth login. */
const AUTH_KEEP_AWAKE_MS = 5 * 60_000

/** What the controller needs from the conversation that owns it. */
export interface McpHost {
  /** The live CLI process (relaunches if it was asleep); rejects if the conversation was closed. */
  ensureRun(): Promise<{ query: Query }>
  /** Waits for an ongoing relaunch to finish. */
  settleWake(): Promise<void>
  /** An action in progress: the conversation does not sleep in the middle of it. */
  beginBusy(): void
  endBusy(): void
  /** The idle deadline must be reevaluated. */
  refreshIdle(): void
  /** Notice (toast) for the user. */
  notice(message: string): void
  /** Runner and context of `claude mcp …`; throws if the conversation cannot run it. */
  prepareCli(): Promise<{ run: ClaudeCliRunner; context: Omit<CliContext, 'signal'> }>
  /** Opens the login URL in the browser (only `http(s)`, already validated). */
  openExternal?(url: string): Promise<void>
}

export class McpController {
  /** Last server list shown to the renderer: actions only accept names from it. */
  private servers: ClaudeMcpServer[] = []
  /** Aborts the ongoing `claude mcp …` when the conversation closes. */
  private readonly cliAbort = new AbortController()
  /** Queued actions: one at a time, so the list and the mutations do not cross. */
  private readonly queue = new SerialQueue()
  /** Servers Walph added/removed in this conversation (see `applyMcpMemory`). */
  private readonly added = new Map<string, ClaudeMcpScope>()
  private readonly removed = new Set<string>()
  /** OAuth in progress: the CLI must stay alive (it listens for the redirect on localhost) until this deadline. */
  private authWaiting = false
  private authTimer: NodeJS.Timeout | undefined

  constructor(private readonly host: McpHost) {}

  get authPending(): boolean {
    return this.authWaiting
  }

  /** The conversation closed: aborts the ongoing `claude mcp …` and releases the login deadline. */
  dispose(): void {
    this.cliAbort.abort()
    clearTimeout(this.authTimer)
  }

  // Public: always queued.
  status(): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.fetch())
  }
  toggle(name: string, enabled: boolean): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.doToggle(name, enabled))
  }
  reconnect(name: string): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.doReconnect(name))
  }
  authenticate(name: string): Promise<ClaudeMcpAuthResult> {
    return this.serial(() => this.doAuthenticate(name))
  }
  submitCallback(name: string, callbackUrl: string): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.doSubmitCallback(name, callbackUrl))
  }
  clearAuth(name: string): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.doClearAuth(name))
  }
  add(valid: ValidMcpServer): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.doAdd(valid))
  }
  remove(name: string, scope: ClaudeMcpScope): Promise<ClaudeMcpServer[]> {
    return this.serial(() => this.doRemove(name, scope))
  }

  /** MCP mutations and listings one at a time. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    return this.queue.run(job)
  }

  /** Runs an SDK call on the live CLI (wakes it if asleep) with a deadline; errors become text for the user. */
  private async call<T>(what: string, ms: number, fn: (run: { query: Query }) => Promise<T>): Promise<T> {
    // Counts as activity: without this the conversation would sleep in the middle of a reconnect/authenticate.
    this.host.beginBusy()
    try {
      await this.host.settleWake()
      const run = await this.host.ensureRun()
      return await rejectAfter(fn(run), ms, () => new UserError(t().claudeHost.mcp.timeout))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new UserError(`${what}: ${cleanCliError(reason, [])}`.replace(/\.$/, '') + '.', { cause: err })
    } finally {
      this.host.endBusy()
    }
  }

  /** Keeps the CLI awake for a few minutes while the user completes the login in the browser. */
  private setAuthPending(pending: boolean): void {
    clearTimeout(this.authTimer)
    this.authWaiting = pending
    if (pending) {
      this.authTimer = setTimeout(() => this.setAuthPending(false), AUTH_KEEP_AWAKE_MS)
      this.authTimer.unref()
    } else this.host.refreshIdle()
  }

  private async fetch(): Promise<ClaudeMcpServer[]> {
    const raw = await this.call(t().claudeHost.mcp.listFailed, MCP_DEADLINE_MS, (run) => run.query.mcpServerStatus())
    this.servers = applyMcpMemory(normalizeMcpStatus(raw), this.added, this.removed)
    // Nobody waits for a login anymore: the CLI can go back to sleep.
    if (this.authWaiting && !this.servers.some((s) => s.status === 'needs-auth')) this.setAuthPending(false)
    return this.servers
  }

  /** The name must be in the last list sent (the renderer does not pick arbitrary servers). */
  private known(name: string): ClaudeMcpServer {
    const server = this.servers.find((s) => s.name === name)
    if (!server) throw new UserError(t().claudeHost.mcp.gone)
    return server
  }

  private async doToggle(name: string, enabled: boolean): Promise<ClaudeMcpServer[]> {
    const server = this.known(name)
    if (server.scope === 'sdk' || server.name === WALPH_SERVER)
      throw new UserError(t().claudeHost.mcp.internalCannotDisable)
    // A `pending` server makes the CLI wait for the connection (~30 s) before answering.
    await this.call(t().claudeHost.mcp.changeFailed, MCP_SLOW_DEADLINE_MS, (run) =>
      run.query.toggleMcpServer(server.name, enabled)
    )
    return this.fetch()
  }

  private async doReconnect(name: string): Promise<ClaudeMcpServer[]> {
    const server = this.known(name)
    await this.call(t().claudeHost.mcp.reconnectFailed, MCP_SLOW_DEADLINE_MS, (run) =>
      run.query.reconnectMcpServer(server.name)
    )
    return this.fetch()
  }

  private async doAuthenticate(name: string): Promise<ClaudeMcpAuthResult> {
    const server = this.known(name)
    const raw = await this.call(t().claudeHost.mcp.authStartFailed, MCP_SLOW_DEADLINE_MS, (run) =>
      mcpExtra(run.query, 'mcpAuthenticate')(server.name)
    )
    const { authUrl, callbackExpected } = parseAuthResponse(raw)
    if (authUrl) {
      try {
        await this.host.openExternal?.(authUrl)
      } catch {
        // The user can still copy the URL from the modal.
      }
    }
    // The CLI listens for the redirect on localhost: it cannot sleep while the user completes the login.
    if (callbackExpected) this.setAuthPending(true)
    return { ...(authUrl ? { authUrl } : {}), awaitingCallback: callbackExpected }
  }

  private async doSubmitCallback(name: string, url: string): Promise<ClaudeMcpServer[]> {
    const server = this.known(name)
    await this.call(t().claudeHost.mcp.authFinishFailed, MCP_SLOW_DEADLINE_MS, (run) =>
      mcpExtra(run.query, 'mcpSubmitOAuthCallbackUrl')(server.name, url)
    )
    return this.fetch()
  }

  private async doClearAuth(name: string): Promise<ClaudeMcpServer[]> {
    const server = this.known(name)
    await this.call(t().claudeHost.mcp.authClearFailed, MCP_DEADLINE_MS, (run) =>
      mcpExtra(run.query, 'mcpClearAuth')(server.name)
    )
    return this.fetch()
  }

  private async doAdd(valid: ValidMcpServer): Promise<ClaudeMcpServer[]> {
    await this.fetch()
    await this.runCli(mcpAddArgs(valid), t().claudeHost.mcp.saveFailed, valid.secrets)
    this.added.set(valid.name, valid.scope)
    this.removed.delete(mcpKey(valid.name, valid.scope))
    const list = await this.reload()
    if (!list.some((s) => s.name === valid.name && s.scope === valid.scope)) {
      this.host.notice(t().claudeHost.mcp.saved)
    }
    return list
  }

  private async doRemove(name: string, scope: ClaudeMcpScope): Promise<ClaudeMcpServer[]> {
    const server = this.known(name)
    const target = this.servers.find((s) => s.name === server.name && s.scope === scope && s.editable)
    if (!target) throw new UserError(t().claudeHost.mcp.removeOnlyEditable)
    await this.runCli(mcpRemoveArgs(target.name, scope), t().claudeHost.mcp.removeFailed, [])
    const list = await this.reload()
    if (list.some((s) => s.name === target.name && s.scope === target.scope)) {
      this.host.notice(t().claudeHost.mcp.removed)
    }
    // The live CLI keeps listing the removed one: it disappears from the list until the next session.
    if (this.added.get(target.name) === target.scope) this.added.delete(target.name)
    this.removed.add(mcpKey(target.name, target.scope))
    this.servers = applyMcpMemory(this.servers, this.added, this.removed)
    return this.servers
  }

  /** The CLI rereads the config (`reloadPlugins`); if it fails, the current list comes back and the caller warns. */
  private async reload(): Promise<ClaudeMcpServer[]> {
    try {
      await this.call(t().claudeHost.mcp.reloadFailed, MCP_SLOW_DEADLINE_MS, (run) => run.query.reloadPlugins())
    } catch {
      // The config was already written; only the current session does not pick it up.
    }
    return this.fetch()
  }

  private async runCli(args: string[], what: string, secrets: string[]): Promise<void> {
    const { run, context } = await this.host.prepareCli()
    try {
      await run(args, { ...context, signal: this.cliAbort.signal })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new UserError(`${what}: ${cleanCliError(reason, secrets)}`.replace(/\.$/, '') + '.', { cause: err })
    }
  }
}

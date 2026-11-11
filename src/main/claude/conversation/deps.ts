import type { ClaudeAgentStatus, ClaudeEditorContext, ClaudeEvent, Settings } from '@shared/types'
import type { PathCheck } from '../../fs/pathAllowlist'
import type { ClaudeCliRunner } from '../cliRunner'
import type { CommandFile } from '../commandFiles'
import type { FileDiagnostics } from '../ideFormat'
import type { Sdk } from '../sdk'
import type { SessionSignal } from '../sessionStatus'

/** Everything the conversation asks of the view that owns it (folder, settings, attachments, LSP, events, notices). */
export interface ConversationDeps {
  loadSdk(): Promise<Sdk>
  getRoot(): string | null
  /** Effective window settings (default ← user ← workspace). */
  getSettings(): Settings
  getEditorContext(): ClaudeEditorContext
  /** LSP diagnostics of the open documents; `path` limits them to one file. */
  getDiagnostics(path?: string): FileDiagnostics[]
  emit(event: ClaudeEvent): void
  /** Status/unread changed; `notify` != null when the session just finished, asked for something or failed. */
  onSessionChange?(change: {
    status: ClaudeAgentStatus
    previous: ClaudeAgentStatus
    unread: number
    notify: SessionSignal | null
    /** The `attention` notice is a question from Claude (the notice text changes). */
    question: boolean
  }): void
  /** The conversation ended on its own (failure) or was closed: the owner can forget it. */
  onClosed?(): void
  /** Session favorite and user title (`sessionMeta.ts`); without this the conversation ignores the Walph metadata. */
  loadSessionMeta?(sessionId: string): Promise<{ favorite: boolean; title?: string }>
  /** The conversation moved to another session (rewind to the start): the owner copies Walph metadata to the new id. */
  onSessionIdChange?(from: string, to: string): void
  /** The path (outside the folder) was allowed by main for this view (attachment dialog or confirmation). */
  verifyAttachment?(path: string): Promise<PathCheck>
  /** Commands from the folder's `.claude/commands` and from `~/.claude/commands` (cached by `mtime` in the reader). */
  readCommandFiles?(root: string): Promise<CommandFile[]>
  /** The CLI plans folder (`~/.claude/plans`); the default is computed from the home. Injectable in tests. */
  plansDir?(): string
  /** Idle time before sleeping (ms); 0 turns it off. Default: `claude.idleSleepMinutes`. Injectable in tests. */
  idleSleepMs?: number
  /** Maximum wait for the MCPs on the first send of each process (ms). Default `MCP_CONNECT_WAIT_MS`. For tests. */
  mcpConnectWaitMs?: number
  /** `claude mcp add-json/remove` (see `cliRunner.ts`). */
  runCli?: ClaudeCliRunner
  /** Login shell PATH, so Claude's Bash finds git/node/etc. Without this only the inherited PATH applies. */
  loginPath?(): Promise<string | null>
  /** Opens the OAuth login URL in the browser (only `http(s)`, already validated). */
  openExternal?(url: string): Promise<void>
}

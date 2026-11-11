import type { ClaudeFavoriteCommand } from '../favoriteCommands'
import type { ClaudePermissionMode } from '../settings'

// ---- Claude Code panel ----
// Each conversation is a Claude Agent SDK session (one CLI process) owned by the window that created it, with `cwd` =
// the window folder. Conversation ids (`ClaudeConversationId`) belong to main and are only valid in the window;
// `sessionId` is the CLI UUID (persisted in `~/.claude/projects`, used to list and resume). Everything that comes from
// Claude is untrusted content.

export type ClaudeConversationId = string

/** Effort/reasoning levels accepted by the CLI. */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ClaudeStartOptions {
  /** `sessionId` of a previous conversation of the folder to resume (with its context). Absent = new conversation. */
  resume?: string
  /** Model; absent = `claude.model` (empty = CLI default). */
  model?: string
  /** Initial mode; absent = `claude.initialPermissionMode`. */
  permissionMode?: ClaudePermissionMode
  effort?: ClaudeEffort
}

/** Account the CLI is authenticated with. Absent fields = the CLI did not report them (untrusted, short text). */
export interface ClaudeAccount {
  email?: string
  organization?: string
  /** `pro`, `max`, `team`, `enterprise`… (as the CLI reports it). */
  subscriptionType?: string
  /** Credential source (`claude.ai`, `oauth_token`, `ANTHROPIC_API_KEY`, `none`…), as the CLI reports it. */
  authMethod?: string
  /** `firstParty`, `bedrock`, `vertex`… Only `firstParty` uses the Claude login. */
  apiProvider?: string
}

/** `claude auth status`. `loggedIn: false` is a normal state (not an error). */
export interface ClaudeAuthStatus extends ClaudeAccount {
  loggedIn: boolean
}

/** Usage of one model in the session (accumulated tokens and cost). */
export interface ClaudeUsageModel {
  /** Id as the CLI records it (may be an alias). */
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  /** USD. */
  costUsd: number
}

/** One window of the plan limit (e.g. 5 hours, week). */
export interface ClaudeUsageLimit {
  /** `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps` or `model:<name>`. */
  key: string
  /** Translated label (`t()`) ready to display. */
  label: string
  /** 0 to 100 (percentage used), `null` if the server did not report it. */
  utilization: number | null
  /** When the window resets (epoch ms), `null` if not reported. */
  resetsAt: number | null
}

/** `/usage` report, already validated by main (the CLI output is an experimental, untrusted API). */
export interface ClaudeUsageReport {
  session: {
    /** USD accumulated in the session. */
    costUsd: number
    apiDurationMs: number
    durationMs: number
    linesAdded: number
    linesRemoved: number
    models: ClaudeUsageModel[]
  }
  /** claude.ai subscription (`pro`, `max`…); `null` with an API key or a third-party provider. */
  subscriptionType: string | null
  /** `false` when plan limits do not apply (API key, Bedrock, Vertex…): `limits` comes empty. */
  rateLimitsAvailable: boolean
  limits: ClaudeUsageLimit[]
  /** Extra (overage) usage of the period, in minor currency units (cents for USD); `null` if the plan has none. */
  extraUsage: {
    enabled: boolean
    usedCredits: number | null
    monthlyLimit: number | null
    /** 0 to 100. */
    utilization: number | null
    currency: string | null
  } | null
  /** Account reported in this conversation's `init`, if any. */
  account: ClaudeAccount | null
}

export interface ClaudeStarted {
  id: ClaudeConversationId
  /** Messages that already exist when resuming (from the CLI transcript), in order; empty in a new conversation. */
  messages: ClaudeMessage[]
  /** Title saved when resuming (the user's one wins over the automatic one). */
  title?: string
  /** Favorited session (`setSessionMeta`). `false` in a new conversation. */
  favorite: boolean
  /**
   * Title given by the user (Walph metadata), if any. Absent = `title` is automatic and later `title` events can
   * replace it.
   */
  userTitle?: string
}

/**
 * Walph metadata for a session, by `sessionId`, written by main to
 * `<userData>/claude/<folder-sha256>.json` (atomic). The title also goes to the CLI transcript
 * (`renameSession`, best effort) so `claude --resume` shows the same name.
 */
export interface ClaudeSessionMetaPatch {
  favorite?: boolean
  /** Title given by the user (wins over the automatic one in tabs, history, toasts). `null`/empty = automatic again. */
  title?: string | null
}

/**
 * Excerpt of a file cited with `@file` or `@file#L10-20` (1-based, inclusive lines), or a file attached through the
 * paperclip/drag and drop (no lines).
 */
export interface ClaudeAttachment {
  /**
   * Absolute. Inside the window folder (`resolveInsideRoot`; folder → main attaches the listing) or an outside FILE
   * that main allowed for this view (`pickAttachments` or confirmed in `authorizeAttachments`, the allowance is valid
   * for a few minutes). Any other outside path is refused.
   */
  path: string
  startLine?: number
  endLine?: number
}

export interface ClaudeImage {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  /** Base64 without the `data:` prefix. Main refuses images above 5 MB. */
  data: string
}

/** Editor selection (1-based, inclusive lines; `text` = the selected text). */
export interface ClaudeSelection {
  path: string
  startLine: number
  endLine: number
  text: string
}

/** A user message. Main builds the content blocks (text, attachments read from disk, context, images). */
export interface ClaudePromptInput {
  text: string
  attachments: ClaudeAttachment[]
  images: ClaudeImage[]
  /** Automatic context (`claude.autoContext` and the box button): active file and selection. `null` = no context. */
  activeFile: string | null
  selection: ClaudeSelection | null
}

/** Editor state the renderer reports to main for Claude's IDE tools (in-process MCP server). */
export interface ClaudeEditorContext {
  activeFile: string | null
  selection: ClaudeSelection | null
  /** Paths of the open tabs, in order; `dirty` = unsaved. */
  openFiles: { path: string; dirty: boolean }[]
}

/** Block already normalized by main (render-ready). Texts are untrusted markdown. */
export type ClaudeBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'toolUse'
      toolUseId: string
      /** Tool name (`Bash`, `Edit`, `mcp__server__tool`…). */
      name: string
      /** Raw tool input (JSON); the renderer summarizes it in the collapsible row. */
      input: unknown
    }
  | {
      type: 'toolResult'
      toolUseId: string
      /** Text output, truncated by main (at most ~20 KB). */
      content: string
      isError: boolean
    }
  | { type: 'image'; mediaType: string; data: string }

/** Editor file (and excerpt) that went along with a user message as context. */
export interface ClaudeMessageContext {
  /** As Claude received it: absolute in most cases. */
  path: string
  /** 1-based, inclusive; absent when only the active file was sent (no selection). */
  startLine?: number
  endLine?: number
}

/** CLI notice that a background task finished (not typed by the user). */
export interface ClaudeTaskNotification {
  /** As received (`completed`, `failed`, `killed`…); empty if absent. Untrusted text, up to 300 characters. */
  status: string
  /** One-line summary (up to 300 characters); empty if absent. */
  summary: string
}

export interface ClaudeMessage {
  /** Message UUID in the transcript (basis for checkpoints and for resuming at a point). */
  uuid: string
  role: 'user' | 'assistant'
  blocks: ClaudeBlock[]
  /** Message from a subagent (id of the `Agent`/`Task` call that created it); `null` = main conversation. */
  parentToolUseId: string | null
  /** Only on typed `user` messages: the code/conversation can be rewound to before it (checkpoint). */
  checkpoint?: boolean
  /** When the message was created (epoch ms). Absent in history without a date in the transcript. */
  timestamp?: number
  /** Only on `user` messages: editor file/selection sent along (the injected text does not appear in `blocks`). */
  context?: ClaudeMessageContext
  /**
   * `user` message that is actually a notice of a finished background task: the renderer shows a compact note
   * (status + summary) instead of a user bubble. `blocks` carries the summary as text and `checkpoint` is absent.
   * If `checkpoint` is present (the user typed something in the same message), `blocks` is only what was typed: show
   * the normal bubble and, besides it, the note.
   */
  taskNotification?: ClaudeTaskNotification
}

/**
 * File ready to become a chip in the Claude box, validated by main (`claude/attachments.ts`: exists, is a
 * file, within the size limits of its type). Images come already read (`image`) and become `ClaudeImage` on send; the
 * rest becomes `ClaudeAttachment { path }`.
 */
export interface ClaudeAttachmentFile {
  /** Absolute (in the window folder spelling when inside it). */
  path: string
  name: string
  /** Bytes. */
  size: number
  image?: ClaudeImage
}

/** Result of `pickAttachments`/`authorizeAttachments`: what can be attached and what was refused (with a reason). */
export interface ClaudeAttachmentResult {
  files: ClaudeAttachmentFile[]
  /** Translated `reason` (`t()`) (e.g. "over 2 MB", "folders outside the workspace cannot be attached"). */
  rejected: { name: string; reason: string }[]
}

export interface ClaudeSlashCommand {
  /** Without the slash. Commands in subfolders become `folder:name`. */
  name: string
  /** Plain text (may come from the repository: untrusted, never rendered as markdown). */
  description: string
  argumentHint: string
  /**
   * `project` = `<folder>/.claude/commands/**.md`, `user` = `~/.claude/commands/**.md`, `builtin` = the rest
   * of the CLI `init` (built-in commands, skills, plugins). A name in both files stays with `project`.
   */
  scope: 'project' | 'user' | 'builtin'
}

export type ClaudeMcpStatus = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'

/** Scopes where the user can save a server (`claude mcp add-json -s`). */
export type ClaudeMcpScope = 'local' | 'project' | 'user'

export type ClaudeMcpTransport = 'stdio' | 'http' | 'sse'

export interface ClaudeMcpTool {
  name: string
  /** Plain text from the server (untrusted, never rendered as markdown). */
  description: string
  readOnly: boolean
  destructive: boolean
}

/**
 * An MCP server as the CLI sees it (`mcpServerStatus`), normalized in main. The config is REDACTED: of `env`/`headers`
 * only the keys reach the renderer (the values may be secrets and never leave main).
 */
export interface ClaudeMcpServer {
  name: string
  status: ClaudeMcpStatus
  /**
   * Origin: `local` | `project` | `user` (editable), `claudeai`, `plugin`, `managed`/`enterprise`, `dynamic`, `sdk`
   * (the internal `walph`) or another value unknown to the CLI (treated as read-only).
   */
  scope: string
  /** `true` only for `local`/`project`/`user`: can be removed by Walph. */
  editable: boolean
  /** CLI message when `failed` (plain text). */
  error?: string
  serverInfo?: { name: string; version: string }
  config?: {
    transport: ClaudeMcpTransport | 'sdk' | 'claudeai-proxy' | 'ws' | 'unknown'
    command?: string
    args?: string[]
    url?: string
    envKeys?: string[]
    headerKeys?: string[]
  }
  /** Only when connected. */
  tools: ClaudeMcpTool[]
}

/** "Add server" form (validated in main). `env`/`headers` as key → value pairs. */
export interface ClaudeMcpServerInput {
  name: string
  scope: ClaudeMcpScope
  transport: ClaudeMcpTransport
  /** stdio */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** http/sse (`http(s)://`) */
  url?: string
  headers?: Record<string, string>
}

/** Result of `mcpAuthenticate`: main has already opened the browser when `authUrl` exists. */
export interface ClaudeMcpAuthResult {
  /** URL opened in the browser (for the user to copy if nothing opened). */
  authUrl?: string
  /** `true` = the CLI awaits the callback URL: the modal shows the "Paste callback URL" field. */
  awaitingCallback: boolean
}

export interface ClaudeModelOption {
  /** Value for `setModel` (`default`, `opus`, `sonnet`… or an id). */
  value: string
  displayName: string
  description: string
  /** Model id the alias resolves to (e.g. `default` → `claude-opus-…`), when the CLI reports it. */
  resolvedModel?: string
  /** Accepted efforts (empty = the model has no effort). */
  efforts: ClaudeEffort[]
}

/** CLI task running in the background (subagent, command, monitor…), outside the conversation turn. */
export interface ClaudeBackgroundTask {
  id: string
  kind: 'agent' | 'shell' | 'other'
  /** CLI/model text (untrusted), one line and truncated by main. */
  description: string
  /** Subagent type (e.g. `backend-developer`); `null` outside `agent`. */
  agentType: string | null
}

export interface ClaudeContextUsage {
  usedTokens: number
  maxTokens: number
  /** 0–100. */
  percentage: number
}

/** Claude permission request, answered with `respond`. */
export type ClaudePermissionRequest =
  | {
      kind: 'tool'
      requestId: string
      toolName: string
      /** Ready-made CLI sentence (e.g. "Claude wants to run …") or one built by main. */
      title: string
      description?: string
      input: unknown
      /** `false` when the CLI forbids "Always Allow" for this request. */
      canAlwaysAllow: boolean
      /**
       * The CLI suggestions have `allow` rules that can be written to `<folder>/.claude/settings.local.json`
       * ("Always in This Workspace").
       */
      canAllowInWorkspace: boolean
    }
  | {
      /**
       * File edit (Edit/Write/MultiEdit in "Manual" mode, or the IDE `openDiff` tool):
       * the renderer opens a side-by-side diff. Accept → the CLI (or main, for `openDiff`) writes to disk and the
       * clean tab reloads through the watcher; Reject → nothing changes and the reason goes back to Claude.
       */
      kind: 'edit'
      requestId: string
      toolName: string
      /** Absolute, inside the window folder. */
      path: string
      /** Current content on disk (empty if the file does not exist). */
      original: string
      proposed: string
      isNewFile: boolean
    }
  | {
      /** `ExitPlanMode` in plan mode: the plan (markdown) to review; approving picks the execution mode. */
      kind: 'plan'
      requestId: string
      plan: string
    }
  | {
      /**
       * `AskUserQuestion`: questions with options in a card at the end of the conversation. Does not depend on the
       * permission mode (it is a question). Answer with `answer` or `skip`; `allow`/`deny` are not valid here.
       */
      kind: 'question'
      requestId: string
      /** 1 to 4, already validated and normalized by main (`claude/question.ts`). */
      questions: ClaudeQuestion[]
    }
  | {
      /**
       * Request from an MCP server (elicitation): `form` = fields for the user to fill in; `url` = open a page
       * (login/consent) in the browser. Normalized by main (`claude/elicitation.ts`); a form with a field the panel
       * cannot show never gets here (main refuses and notifies). Answer only with `behavior: 'elicitation'`.
       */
      kind: 'elicitation'
      requestId: string
      /** MCP server name (plain text, untrusted). */
      serverName: string
      /** Server text (plain, untrusted, truncated by main). */
      message: string
      /** Optional short title from the server (display `_meta`), plain text. */
      title?: string
      mode: 'form' | 'url'
      /** Only in `url`: `http(s)://` validated by main. Accept → MAIN opens it in the browser. */
      url?: string
      /** Only in `form` (empty in `url`), in schema order. */
      fields: ClaudeElicitationField[]
    }

/** Field of an elicitation form (flat subset of the MCP JSON Schema). Plain, untrusted texts. */
export type ClaudeElicitationField = {
  /** Property name in the schema (key of `content` in the response). */
  key: string
  /** Label (schema `title` or the key itself). */
  label: string
  description: string
  required: boolean
} & (
  | {
      type: 'string'
      format?: 'email' | 'uri' | 'date' | 'date-time'
      minLength?: number
      maxLength?: number
      default?: string
    }
  | { type: 'number'; integer: boolean; minimum?: number; maximum?: number; default?: number }
  | { type: 'boolean'; default?: boolean }
  | {
      /** `multiple` = several choices (array in the schema), `string[]` response; otherwise a `string`. */
      type: 'enum'
      multiple: boolean
      options: { value: string; label: string }[]
      default?: string | string[]
    }
)

/** Value of an elicitation field in the response. */
export type ClaudeElicitationValue = string | number | boolean | string[]

/** A question from Claude (untrusted content: plain text, no markdown). */
export interface ClaudeQuestion {
  /** Id given by main, unique in the request (key of `answers`). */
  id: string
  /** Short label of the pill tab (e.g. "Library"). */
  header: string
  question: string
  /** Without "Other": the card always adds "Other" with free text. */
  options: ClaudeQuestionOption[]
  multiSelect: boolean
}

export interface ClaudeQuestionOption {
  label: string
  description: string
}

export type ClaudePermissionResponse =
  | {
      behavior: 'allow'
      /**
       * Only in `tool`. `true` = "Always Allow" (applies the CLI suggestions to the session). `'workspace'` = "Always
       * in This Workspace": main writes the suggestions' `allow` rules to `<folder>/.claude/settings.local.json`
       * (atomic, without deleting existing rules) and also applies them to the current session.
       */
      always?: boolean | 'workspace'
      /** Only in `plan`: mode the execution continues in (default `default`). */
      mode?: Exclude<ClaudePermissionMode, 'plan'>
    }
  | {
      behavior: 'deny'
      /** Optional reason/comment that goes back to Claude. */
      message?: string
    }
  | {
      /**
       * Only in `question`: one entry per question (`ClaudeQuestion.id`) with the chosen `label`s or, instead of an
       * option, the text typed in "Other". Single = exactly 1 value; multiple = 1 or more.
       */
      behavior: 'answer'
      answers: Record<string, string[]>
    }
  | {
      /** Only in `question`: the card's "x" (Claude decides on its own and goes on). */
      behavior: 'skip'
    }
  | {
      /**
       * Only in `elicitation`. `accept` in `form` carries `content` (validated by main against the fields: invalid =
       * `respond` returns `false` and the request stays); in `url` main opens the URL and answers `accept`. `decline` =
       * refuse; `cancel` = close without deciding.
       */
      behavior: 'elicitation'
      action: 'accept' | 'decline' | 'cancel'
      content?: Record<string, ClaudeElicitationValue>
    }

/**
 * Usage limit of the claude.ai subscription (CLI `rate_limit_event`), normalized by main (`claude/rateLimit.ts`).
 * `allowed` = all good (the renderer hides the warning); `warning` = close to the limit; `rejected` = limit reached.
 */
export interface ClaudeRateLimit {
  status: 'allowed' | 'warning' | 'rejected'
  /** Limit window; `other` = value unknown to the CLI. */
  window: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage' | 'other'
  /** 0–100, when the CLI reports it. */
  percent: number | null
  /** When it renews (epoch ms), when the CLI reports it. */
  resetsAt: number | null
  /** Using extra credits (overage) now. */
  usingOverage: boolean
}

/** Subagent progress (`task_progress`), already truncated by main. */
export interface ClaudeTaskProgress {
  taskId: string
  /** `Agent`/`Task` call that created the subagent (matches `AgentRow.toolUseId`); `null` = task without a call. */
  toolUseId: string | null
  /** One-line summary of what the agent is doing (`agentProgressSummaries`), plain text; `null` = none yet. */
  summary: string | null
  totalTokens: number
  toolUses: number
  durationMs: number
  lastToolName: string | null
}

/** Summary of a previous conversation of the folder (history). */
export interface ClaudeSessionSummary {
  sessionId: string
  title: string
  /** ms since the epoch. */
  lastModified: number
  gitBranch?: string
  /** Favorited in Walph (the history shows favorites first, with the star). */
  favorite: boolean
}

export type ClaudeConversationStatus = 'starting' | 'idle' | 'working' | 'closed'

/**
 * Session status for the user, derived in main (`claude/sessionStatus.ts`) from the conversation events.
 * Priority when there is more than one signal: `attention` (pending request) > `error` > `running` > `done` > `idle`.
 * `done` goes back to `idle` when the renderer marks the session as read (`markRead`).
 */
export type ClaudeAgentStatus = 'idle' | 'running' | 'done' | 'attention' | 'error'

/** Request to start a Claude session with a prompt as soon as the view is in the `root` folder. */
export interface ClaudeStartRequest {
  root: string
  prompt: string
}

/** Conversation error. `auth` = not logged in (the panel explains and offers to run `claude` in the terminal). */
export interface ClaudeError {
  code: 'auth' | 'executable' | 'process' | 'other'
  /** Translated message (`t()`). */
  message: string
}

/** Events from main to the owning window (`claude:event`), always with the conversation id. */
export type ClaudeEvent =
  | {
      type: 'init'
      id: ClaudeConversationId
      sessionId: string
      model: string
      permissionMode: ClaudePermissionMode
      commands: ClaudeSlashCommand[]
      models: ClaudeModelOption[]
      /** Effective effort of the conversation (already adjusted to the model); `null`/absent = model default. */
      effort?: ClaudeEffort | null
      /** Account authenticated in the CLI (`initializationResult().account`); absent/`null` = not reported. */
      account?: ClaudeAccount | null
    }
  /**
   * The process MCP servers finished connecting, or the deadline (15 s) ran out (`timedOut`, with a separate
   * `notice`). Emitted ONCE per launched process (start, waking from sleep, rewind): the renderer shows "Connecting
   * MCP servers…" from `status: 'starting'` (and after `init`) until this event. Without MCP configured it arrives
   * right after `init`.
   */
  | { type: 'mcpReady'; id: ClaudeConversationId; timedOut: boolean }
  | { type: 'status'; id: ClaudeConversationId; status: ClaudeConversationStatus }
  /** Complete message (from the user, the assistant or tool results). Replaces the ongoing streaming. */
  | { type: 'message'; id: ClaudeConversationId; message: ClaudeMessage }
  /** Chunk of text/thinking being generated (block `index` of the ongoing response). */
  | { type: 'delta'; id: ClaudeConversationId; index: number; kind: 'text' | 'thinking'; text: string }
  | { type: 'permission'; id: ClaudeConversationId; request: ClaudePermissionRequest }
  /** The request is no longer valid (interrupted, conversation closed): the renderer closes its card/diff. */
  | { type: 'permissionCancelled'; id: ClaudeConversationId; requestId: string }
  /** End of a turn: accumulated session cost (USD) and context usage, when available. */
  | {
      type: 'result'
      id: ClaudeConversationId
      costUsd: number
      durationMs: number
      isError: boolean
      context: ClaudeContextUsage | null
    }
  | { type: 'permissionMode'; id: ClaudeConversationId; mode: ClaudePermissionMode }
  | { type: 'title'; id: ClaudeConversationId; title: string }
  | { type: 'error'; id: ClaudeConversationId; error: ClaudeError }
  /**
   * Notice that is not a conversation failure (translated, `t()`, e.g. the "Always in This Workspace" rule could not
   * be written): becomes a toast.
   */
  | { type: 'notice'; id: ClaudeConversationId; message: string }
  /**
   * Session status changed (only when `status` or `unread` changes). `unread` counts how many times the session
   * finished, asked for something or failed since the last `markRead`.
   */
  | { type: 'sessionStatus'; id: ClaudeConversationId; status: ClaudeAgentStatus; unread: number }
  /** The user clicked this session's OS notification: the window is already focused; the renderer shows the session. */
  | { type: 'reveal'; id: ClaudeConversationId }
  /** Text output of a local CLI command (`/cost`, `/context`, `/help`…), stripped of tags and truncated by main. */
  | { type: 'commandOutput'; id: ClaudeConversationId; text: string; timestamp: number }
  /** The CLI compacted the conversation (`/compact` or automatic): the timeline shows a marker. */
  | {
      type: 'compacted'
      id: ClaudeConversationId
      trigger: 'manual' | 'auto'
      preTokens: number | null
      timestamp: number
    }
  /**
   * The CLI started a turn without a user message: `scheduled` = pending `/loop`/cron/ScheduleWakeup; `background` =
   * another reason (e.g. a background task finished). The timeline shows a marker before the turn.
   */
  | { type: 'autoTurn'; id: ClaudeConversationId; reason: 'scheduled' | 'background'; timestamp: number }
  /** Current set of background tasks (replaces the previous one; empty = none). */
  | { type: 'backgroundTasks'; id: ClaudeConversationId; tasks: ClaudeBackgroundTask[] }
  /** Usage limit changed (replaces the previous one; `allowed` = no warning). */
  | { type: 'rateLimit'; id: ClaudeConversationId; limit: ClaudeRateLimit }
  /**
   * The API failed with a temporary error and the CLI will retry in `delayMs`. The "retrying" row disappears on the
   * next `delta`/`message`/`result`/idle `status`. `errorStatus` = HTTP (529, 429…) or `null` (network/timeout).
   */
  | {
      type: 'retry'
      id: ClaudeConversationId
      attempt: number
      maxRetries: number
      delayMs: number
      errorStatus: number | null
      timestamp: number
    }
  /**
   * Tool call denied without asking the user (Auto mode classifier, `deny` rule…): the timeline shows the tool and
   * the reason (plain text, truncated by main).
   */
  | {
      type: 'permissionDenied'
      id: ClaudeConversationId
      toolUseId: string
      toolName: string
      reason: string
      timestamp: number
    }
  /** Subagent progress (replaces the previous one of the same `taskId`). */
  | { type: 'taskProgress'; id: ClaudeConversationId; progress: ClaudeTaskProgress }
  /**
   * Next prompt suggestion (after a turn's `result`), one line of plain text truncated by main. Valid until the user
   * types, sends or another turn starts.
   */
  | { type: 'promptSuggestion'; id: ClaudeConversationId; suggestion: string }
  /** Tool still running: seconds since the start (main limits it to ~1 event/s per tool). */
  | { type: 'toolProgress'; id: ClaudeConversationId; toolUseId: string; elapsedSeconds: number }
  /**
   * The model refused and the turn was redone with another model. `scope: 'session'` = the session now uses `to`
   * (main also emits `init` with the new model); `local` = only a subagent/response. `retracted` = uuids of already
   * emitted messages that the CLI withdrew: the renderer removes them.
   */
  | {
      type: 'modelFallback'
      id: ClaudeConversationId
      from: string
      to: string
      scope: 'session' | 'local'
      retracted: string[]
    }

/**
 * Claude Code panel (Agent SDK in main). Conversations belong to the window: they die (no orphan process) when the
 * folder changes, on reload, on close and when the app quits. Without an open folder, `start` fails.
 */
export interface ClaudeApi {
  /** Opens a conversation (new or resumed) in the window folder. The process starts now; `init` comes via `onEvent`. */
  start(options: ClaudeStartOptions): Promise<ClaudeStarted>
  /**
   * Sends a message. While Claude is working it goes into the CLI queue and runs after the current turn. Returns the
   * user message UUID (the same as the `message` that comes back through the event).
   */
  send(id: ClaudeConversationId, input: ClaudePromptInput): Promise<string>
  /** Interrupts the ongoing turn (Esc / button); pending permission requests become `permissionCancelled`. */
  interrupt(id: ClaudeConversationId): Promise<void>
  /**
   * Stops a background task (`ClaudeBackgroundTask.id` from the last `backgroundTasks`). It leaves the list through
   * the next `backgroundTasks`; an unknown id is refused.
   */
  stopTask(id: ClaudeConversationId, taskId: string): Promise<void>
  /** Ends the conversation and kills the process (closing the tab in the panel). */
  close(id: ClaudeConversationId): Promise<void>
  /**
   * Answers a request. `false` = main refused the response (malformed or of another kind, e.g. `allow` on a
   * question) and the request STAYS pending (the card must stay, or come back). `true` = accepted, or the request no
   * longer exists (answered/cancelled before): nothing to show.
   */
  respond(id: ClaudeConversationId, requestId: string, response: ClaudePermissionResponse): Promise<boolean>
  setPermissionMode(id: ClaudeConversationId, mode: ClaudePermissionMode): Promise<void>
  setModel(id: ClaudeConversationId, model: string): Promise<void>
  /** `null` = "auto": back to the model's default effort. `max` only lasts for the session (the CLI won't save it). */
  setEffort(id: ClaudeConversationId, effort: ClaudeEffort | null): Promise<void>
  /**
   * `/` menu list: `init` commands merged with the files of the folder's `.claude/commands` and of
   * `~/.claude/commands` (reread on each call, cached by `mtime`). Before `init`, only the files.
   */
  commands(id: ClaudeConversationId): Promise<ClaudeSlashCommand[]>
  /**
   * The paperclip: native open dialog (several files, files only) with the window as parent. The chosen ones
   * are allowed for `send` in this view even outside the folder. Cancel = empty lists.
   */
  pickAttachments(): Promise<ClaudeAttachmentResult>
  /**
   * Files dragged into the box (paths from `files.pathForFile`). Inside the folder they go straight through; the
   * outside ones ask for ONE native confirmation ("Attach a file from outside the workspace?"), and refusing puts all
   * of them in `rejected`. Outside folders are always refused.
   */
  authorizeAttachments(paths: string[]): Promise<ClaudeAttachmentResult>
  /** Current context usage; `null` if the conversation has not answered yet. */
  contextUsage(id: ClaudeConversationId): Promise<ClaudeContextUsage | null>
  /**
   * `/usage`: session cost/tokens and plan limits (SDK `usage_EXPERIMENTAL…`, unstable API). Wakes the CLI if it was
   * asleep. `null` when this Claude Code version lacks the API; a network/authentication failure throws (translated
   * message, `t()`).
   */
  usage(id: ClaudeConversationId): Promise<ClaudeUsageReport | null>
  /**
   * `claude auth status` (SDK binary or `claude.executable`, no shell). Does not require an open conversation. A
   * failure to run the CLI throws (translated message, `t()`); "not authenticated" is `{ loggedIn: false }`.
   */
  authStatus(): Promise<ClaudeAuthStatus>
  /**
   * `claude auth logout`, then restarts the view's conversations (`restartAll`). Login happens in the integrated
   * terminal: the renderer writes `claude auth login` into it (browser OAuth flow) and calls `restartAll` when done.
   */
  logout(): Promise<void>
  /**
   * Restarts the CLI process of the view's idle conversations so it rereads the credentials (session and history
   * kept; `init` and `mcpReady` arrive again, with the new account). Busy conversations (turn, pending request,
   * background task) stay as they are: they pick up the credentials when restarted. Returns how many restarted.
   */
  restartAll(): Promise<number>
  /**
   * `/mcp`: the session's MCP servers (wakes the CLI if it is asleep). The actions below only use names from the last
   * list; errors with a translated message (`t()`). `add`/`remove` persist the config (CLI `claude mcp`) and ask the
   * CLI to reread it; when the session does not pick up the change, a `notice` arrives ("applies to new
   * conversations").
   */
  mcpStatus(id: ClaudeConversationId): Promise<ClaudeMcpServer[]>
  mcpToggle(id: ClaudeConversationId, name: string, enabled: boolean): Promise<ClaudeMcpServer[]>
  mcpReconnect(id: ClaudeConversationId, name: string): Promise<ClaudeMcpServer[]>
  /** Starts OAuth: main opens `authUrl` in the browser (only `http(s)`). */
  mcpAuthenticate(id: ClaudeConversationId, name: string): Promise<ClaudeMcpAuthResult>
  /** Hands the CLI the callback URL pasted by the user (when the redirect does not arrive on its own). */
  mcpSubmitCallback(id: ClaudeConversationId, name: string, callbackUrl: string): Promise<ClaudeMcpServer[]>
  /** "Log Out": deletes the server's stored OAuth authentication. */
  mcpClearAuth(id: ClaudeConversationId, name: string): Promise<ClaudeMcpServer[]>
  mcpAdd(id: ClaudeConversationId, input: ClaudeMcpServerInput): Promise<ClaudeMcpServer[]>
  /** Only `editable` servers from the last list. */
  mcpRemove(id: ClaudeConversationId, name: string, scope: ClaudeMcpScope): Promise<ClaudeMcpServer[]>
  /**
   * Checkpoint: rewinds to before the user message `messageUuid` (with `checkpoint`). `code` restores the files
   * Claude edited since then; `conversation` restarts the session from the point before it and returns the
   * remaining messages (the renderer replaces the list). Returns the restored files.
   */
  rewind(
    id: ClaudeConversationId,
    messageUuid: string,
    what: { code: boolean; conversation: boolean }
  ): Promise<{ filesChanged: string[]; messages?: ClaudeMessage[] }>
  /**
   * Previous conversations of the window folder (the CLI ones too), most recent first. `title` already resolved (the
   * user's one wins over the automatic one) and `favorite` from the Walph metadata.
   */
  sessions(): Promise<ClaudeSessionSummary[]>
  /**
   * Favorites/renames a session of the window folder (`claude:setSessionMeta`). Open conversations with that
   * `sessionId` start using the title in toasts/notifications and the automatic `title` stops overwriting it.
   */
  setSessionMeta(sessionId: string, patch: ClaudeSessionMetaPatch): Promise<void>
  /**
   * Favorite panel commands (design system) of the window folder: stored in the app, per folder, never in the
   * repository. `root` is the folder the renderer thinks it has; if the view already changed folders, main refuses
   * (translated message, `t()`).
   */
  favoriteCommands(root: string): Promise<ClaudeFavoriteCommand[]>
  /** Replaces the whole list (validated in main: grid icon, command name, no duplicates) and returns the saved one. */
  setFavoriteCommands(root: string, commands: ClaudeFavoriteCommand[]): Promise<ClaudeFavoriteCommand[]>
  /**
   * "Duplicate": copies the conversation transcript to a new session (SDK `forkSession`) and returns its
   * `sessionId`; the renderer opens it with `start({ resume })`. Fails (translated message, `t()`) if the conversation
   * has no messages yet.
   */
  fork(id: ClaudeConversationId): Promise<string>
  /**
   * "Export Conversation (.md)": native save dialog + markdown generated in main from the transcript
   * (without the injected context blocks). Returns the written path or `null` if the user cancelled.
   */
  exportMarkdown(id: ClaudeConversationId): Promise<string | null>
  /** Editor state for the IDE tools (`send`, no response; the renderer sends it debounced on every change). */
  setEditorContext(context: ClaudeEditorContext): void
  /**
   * The session is being viewed (active tab + visible panel + focused window): resets `unread` and `done` becomes
   * `idle` (`claude:markRead`, no response; an unknown id is ignored). The new status comes back via `sessionStatus`.
   */
  markRead(id: ClaudeConversationId): void
  onEvent(cb: (event: ClaudeEvent) => void): () => void
  /**
   * Main asks this view to start a new session with the prompt (`claude:startRequested`, "Start with
   * Claude"). Sent only after the view is in the `root` folder (the renderer still checks `root` before acting).
   */
  onStartRequested(cb: (request: ClaudeStartRequest) => void): () => void
}

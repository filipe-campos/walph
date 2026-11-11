// State of a Claude panel conversation: types, factories and pure helpers.
// Whoever applies the main events is `claudeReducer.ts`.
import { formatList, t } from '@shared/i18n'
import type {
  ClaudeAccount,
  ClaudeAgentStatus,
  ClaudeBackgroundTask,
  ClaudeBlock,
  ClaudeContextUsage,
  ClaudeConversationStatus,
  ClaudeEffort,
  ClaudeError,
  ClaudeMessage,
  ClaudeModelOption,
  ClaudePermissionMode,
  ClaudePermissionRequest,
  ClaudeRateLimit,
  ClaudeSlashCommand,
  ClaudeStarted,
  ClaudeTaskProgress,
  SessionClaudeTab
} from '@shared/types'

/** Chunk being generated (`delta`) of block `index` of the current response. */
export interface StreamBlock {
  index: number
  kind: 'text' | 'thinking'
  text: string
}

/** Message sent and not yet confirmed by the main echo (in the CLI queue while it works). */
export interface QueuedMessage {
  key: string
  text: string
  imageCount: number
  /** UUID returned by `send`; `null` until the response arrives. */
  uuid: string | null
}

/**
 * CLI notice that is not a message (`/cost` output, compaction): `at` = how many messages there were when it arrived.
 */
export type ConversationNote =
  | { key: string; at: number; kind: 'commandOutput'; text: string; timestamp: number }
  | {
      key: string
      at: number
      kind: 'compacted'
      trigger: 'manual' | 'auto'
      preTokens: number | null
      timestamp: number
    }
  | { key: string; at: number; kind: 'autoTurn'; reason: 'scheduled' | 'background'; timestamp: number }
  | {
      key: string
      at: number
      kind: 'denied'
      toolUseId: string
      toolName: string
      reason: string
      timestamp: number
    }

/** Temporary API failure with a retry on the way ("retrying" line at the end of the list). */
export interface ClaudeRetry {
  attempt: number
  maxRetries: number
  delayMs: number
  errorStatus: number | null
  /** When main notified (epoch ms): the countdown starts from here. */
  timestamp: number
}

export interface ClaudeConversation {
  id: string
  /** CLI UUID (comes in `init`; when resuming it is already known). */
  sessionId: string | null
  /** Displayed title: the user's (`userTitle`) wins over the automatic one (`autoTitle`). */
  title: string
  /** Title given by the user (rename); `null` = uses the automatic one. */
  userTitle: string | null
  /** Last automatic title from the CLI (`title` event); `null` until one arrives. */
  autoTitle: string | null
  /** Favorited session (star in the bar and in the history). */
  favorite: boolean
  status: ClaudeConversationStatus
  /** `init` received: available commands and models. */
  ready: boolean
  /** MCP servers of the current process connected (or the deadline expired): sending only counts after this. */
  mcpReady: boolean
  /** Account reported in the last `init` (`null` = the CLI did not report it). */
  account: ClaudeAccount | null
  model: string
  effort: ClaudeEffort | null
  permissionMode: ClaudePermissionMode
  commands: ClaudeSlashCommand[]
  models: ClaudeModelOption[]
  messages: ClaudeMessage[]
  streaming: StreamBlock[]
  queued: QueuedMessage[]
  /** Local command outputs and compaction markers, interleaved with the messages (not saved in the session). */
  notes: ConversationNote[]
  /** Duration of the last finished turn (ms); `null` while another turn runs or before the first. */
  lastTurnMs: number | null
  /** When the current turn started (`Date.now()`); `null` with Claude stopped. Ephemeral: not saved in the session. */
  turnStartedAt: number | null
  /**
   * Messages sent while Claude was working: they already show in the list (main echoes them right away), but the CLI
   * only runs them after the current turn. They leave here, one per turn, when the turn result arrives.
   */
  waiting: string[]
  permissions: ClaudePermissionRequest[]
  context: ClaudeContextUsage | null
  costUsd: number
  error: ClaudeError | null
  /** Status derived by main (`sessionStatus`): tab dot and counter. */
  agentStatus: ClaudeAgentStatus
  /** Subagents/commands running in the background (outside the turn): indicator in the conversation. */
  background: ClaudeBackgroundTask[]
  /** Times it finished/asked/failed since it was last seen. */
  unread: number
  /** Subscription usage limit in warning/reached (`null` = all good). Ephemeral: not saved in the session. */
  rateLimit: ClaudeRateLimit | null
  /** API retry in progress; cleared on the next delta/message/result/end of turn. */
  retry: ClaudeRetry | null
  /** Next prompt suggestion (ghost in the empty box); cleared on typing, sending or starting another turn. */
  suggestion: string | null
  /** Subagent progress by the call's `toolUseId` (the last event wins). */
  taskProgress: Readonly<Record<string, ClaudeTaskProgress>>
  /** Run seconds of the tools still without a result, by `toolUseId`. */
  toolElapsed: Readonly<Record<string, number>>
  /**
   * Tab restored from the workspace session, still without a process in main: the id is local (`dormant:…`). It becomes
   * a real conversation (`resume`) when the tab is shown in an active view.
   */
  dormant?: boolean
  /** Dormant only: `waking` = resuming the CLI; `failed` = it did not work (banner with output). */
  wakeState?: 'waking' | 'failed' | undefined
  /** Stable key of the tab in the UI: survives swapping the dormant id for the real id. Absent = the `id` itself. */
  tabKey?: string
}

export const NO_ENTRIES: Readonly<Record<string, never>> = Object.freeze({})

/** Ephemeral state of a new conversation (none of this is saved in the session). */
const EPHEMERAL = {
  rateLimit: null,
  retry: null,
  suggestion: null,
  taskProgress: NO_ENTRIES,
  toolElapsed: NO_ENTRIES
} satisfies Partial<ClaudeConversation>

export const newConversationTitle = (): string => t().claude.conversation.newTitle

/** Empty conversation: what `createDormantConversation` and `createConversation` override from here. */
function blankConversation(id: string): ClaudeConversation {
  return {
    id,
    sessionId: null,
    title: newConversationTitle(),
    userTitle: null,
    autoTitle: null,
    favorite: false,
    status: 'idle',
    ready: false,
    mcpReady: false,
    account: null,
    model: '',
    effort: null,
    permissionMode: 'default',
    commands: [],
    models: [],
    messages: [],
    streaming: [],
    queued: [],
    notes: [],
    lastTurnMs: null,
    turnStartedAt: null,
    waiting: [],
    permissions: [],
    context: null,
    costUsd: 0,
    error: null,
    agentStatus: 'idle',
    background: [],
    unread: 0,
    ...EPHEMERAL
  }
}

/** Session tab → dormant conversation (messages only show after it is resumed). */
export function createDormantConversation(
  tab: SessionClaudeTab,
  id: string,
  defaults: { permissionMode: ClaudePermissionMode; model: string }
): ClaudeConversation {
  return {
    ...blankConversation(id),
    sessionId: tab.sessionId ?? null,
    title: tab.title?.trim() || newConversationTitle(),
    autoTitle: tab.title?.trim() || null,
    model: tab.model ?? defaults.model,
    effort: tab.effort ?? null,
    permissionMode: tab.permissionMode ?? defaults.permissionMode,
    dormant: true
  }
}

export function createConversation(
  started: ClaudeStarted,
  defaults: {
    permissionMode: ClaudePermissionMode
    model: string
    sessionId?: string | null
    effort?: ClaudeEffort | null
  }
): ClaudeConversation {
  return {
    ...blankConversation(started.id),
    sessionId: defaults.sessionId ?? null,
    title: started.title?.trim() || newConversationTitle(),
    // `title` comes already resolved; only `userTitle` (if present) locks the title against automatic `title` events.
    userTitle: started.userTitle?.trim() || null,
    autoTitle: started.userTitle?.trim() ? null : started.title?.trim() || null,
    favorite: started.favorite,
    status: 'starting',
    model: defaults.model,
    effort: defaults.effort ?? null,
    permissionMode: defaults.permissionMode,
    messages: started.messages
  }
}

/** Typed text of a user message (the `text` blocks), without the context blocks that main injects. */
const CONTEXT_BLOCK =
  /^\s*<(ide_[a-z_]+|task-notification|system-reminder|attachment|file|folder|local-command-[a-z]+|command-[a-z]+)\b/

export function userText(message: ClaudeMessage): string {
  return message.blocks
    .filter((b): b is Extract<ClaudeBlock, { type: 'text' }> => b.type === 'text' && !CONTEXT_BLOCK.test(b.text))
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export function setUserTitle(conv: ClaudeConversation, userTitle: string | null): ClaudeConversation {
  if (userTitle) return { ...conv, userTitle, title: userTitle }
  return { ...conv, userTitle: null, title: conv.autoTitle ?? newConversationTitle() }
}

/** Records a sent message (still without an echo). */
export function addQueued(conv: ClaudeConversation, item: QueuedMessage): ClaudeConversation {
  return { ...conv, queued: [...conv.queued, item], suggestion: null }
}

/**
 * `send` replied with the uuid: if the echo already arrived, the message does not stay queued; else keeps the uuid to
 * match later.
 */
export function bindQueuedUuid(conv: ClaudeConversation, key: string, uuid: string): ClaudeConversation {
  if (conv.messages.some((m) => m.uuid === uuid)) return { ...conv, queued: conv.queued.filter((q) => q.key !== key) }
  return { ...conv, queued: conv.queued.map((q) => (q.key === key ? { ...q, uuid } : q)) }
}

export function removeQueued(conv: ClaudeConversation, key: string): ClaudeConversation {
  return { ...conv, queued: conv.queued.filter((q) => q.key !== key) }
}

export function removePermission(conv: ClaudeConversation, requestId: string): ClaudeConversation {
  return { ...conv, permissions: conv.permissions.filter((p) => p.requestId !== requestId) }
}

export const BACKGROUND_KIND_LABELS: Readonly<Record<ClaudeBackgroundTask['kind'], string>> = {
  get agent() {
    return t().claude.conversation.backgroundKind.agent
  },
  get shell() {
    return t().claude.conversation.backgroundKind.shell
  },
  get other() {
    return t().claude.conversation.backgroundKind.other
  }
}

/** "2 agentes e 1 comando em segundo plano" (fixed order: agents, commands, tasks). */
export function backgroundLabel(tasks: readonly ClaudeBackgroundTask[]): string {
  const m = t().claude.conversation
  const parts = (['agent', 'shell', 'other'] as const)
    .map((kind) => {
      const n = tasks.filter((task) => task.kind === kind).length
      return n === 0 ? null : m.backgroundCount[kind](n)
    })
    .filter((p): p is string => p !== null)
  return m.inBackground(formatList(parts))
}

/** What the conversation waits for before accepting messages: waking the tab, the CLI `init` or the MCP servers. */
export type LoadStep = 'wake' | 'init' | 'mcp'

/** Loading step in progress, or `null` (ready or with an error/closed: the banner explains, nothing spins forever). */
export function loadStep(conv: ClaudeConversation): LoadStep | null {
  if (conv.dormant) return conv.wakeState === 'failed' ? null : 'wake'
  if (conv.error || conv.status === 'closed') return null
  if (!conv.ready) return 'init'
  return conv.mcpReady ? null : 'mcp'
}

export const LOAD_STEP_TEXT: Readonly<Record<LoadStep, string>> = {
  get wake() {
    return t().claude.conversation.loadStep.wake
  },
  get init() {
    return t().claude.conversation.loadStep.init
  },
  get mcp() {
    return t().claude.conversation.loadStep.mcp
  }
}

/** What a send finds: `pending` (still loading), `ready`, or `failed` (gone, closed, errored or did not wake). */
export type SendReadiness = 'pending' | 'ready' | 'failed'

export function sendReadiness(conv: ClaudeConversation | undefined): SendReadiness {
  if (!conv || conv.status === 'closed' || conv.error || (conv.dormant && conv.wakeState === 'failed')) return 'failed'
  return loadStep(conv) === null ? 'ready' : 'pending'
}

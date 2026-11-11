import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type {
  ClaudeEffort,
  ClaudeEvent,
  ClaudePermissionMode,
  ClaudePermissionRequest,
  ClaudePromptInput,
  Settings
} from '@shared/types'

import { ClaudeConversation } from '../conversation/conversation'
import type { ConversationDeps } from '../conversation/deps'
import type { Sdk } from '../sdk'

// ---- Fake SDK: `query()` is a generator controlled by the test ----

export class FakeQuery {
  private queue: unknown[] = []
  private waiter: ((r: IteratorResult<unknown>) => void) | null = null
  private failure: Error | null = null
  private finished = false
  readonly interrupt = vi.fn(() => Promise.resolve())
  readonly setPermissionMode = vi.fn((_mode: string) => Promise.resolve())
  readonly setModel = vi.fn((_model?: string) => Promise.resolve())
  readonly applyFlagSettings = vi.fn((_s: unknown) => Promise.resolve())
  readonly getContextUsage = vi.fn(() => Promise.resolve({ totalTokens: 1000, maxTokens: 10000, percentage: 10 }))
  mcpList: unknown[] = [
    { name: 'docs', status: 'connected', scope: 'project', config: { type: 'stdio', command: 'npx', env: { K: 'v' } } },
    { name: 'walph', status: 'connected', scope: 'dynamic', source: 'sdk', config: { type: 'sdk', name: 'walph' } }
  ]
  readonly mcpServerStatus = vi.fn(() => Promise.resolve(this.mcpList))
  readonly toggleMcpServer = vi.fn((_n: string, _e: boolean) => Promise.resolve())
  readonly reconnectMcpServer = vi.fn((_n: string) => Promise.resolve())
  readonly reloadPlugins = vi.fn(() => Promise.resolve({ mcpServers: this.mcpList }))
  readonly mcpAuthenticate = vi.fn((_n: string) =>
    Promise.resolve({ authUrl: 'https://auth.example/x', requiresUserAction: true, callbackExpected: true })
  )
  readonly mcpClearAuth = vi.fn((_n: string) => Promise.resolve())
  readonly mcpSubmitOAuthCallbackUrl = vi.fn((_n: string, _u: string) => Promise.resolve())
  readonly rewindFiles = vi.fn((_uuid: string) => Promise.resolve({ canRewind: true, filesChanged: ['a.ts'] }))
  readonly close = vi.fn(() => this.end())
  initResult: unknown = {
    commands: [{ name: 'compact', description: 'Compacts', argumentHint: '' }],
    models: [{ value: 'opus', displayName: 'Opus', description: '', supportedEffortLevels: ['low', 'high'] }]
  }
  initializationResult = vi.fn(() => Promise.resolve(this.initResult))

  constructor(
    readonly params: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> },
    readonly sent: unknown[]
  ) {
    void (async () => {
      for await (const m of params.prompt) sent.push(m)
    })()
  }

  push(message: unknown): void {
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w({ value: message, done: false })
    } else this.queue.push(message)
  }
  end(): void {
    this.finished = true
    this.waiter?.({ value: undefined, done: true })
    this.waiter = null
  }
  fail(err: Error): void {
    this.failure = err
    if (this.waiter) {
      this.waiter({ value: undefined, done: true })
      this.waiter = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<unknown> {
    return {
      next: () => {
        if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift(), done: false })
        if (this.failure) return Promise.reject(this.failure)
        if (this.finished) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => {
          this.waiter = (r) => (this.failure ? resolve(Promise.reject(this.failure) as never) : resolve(r))
        })
      }
    }
  }
}

export interface Harness {
  conv: ClaudeConversation
  events: ClaudeEvent[]
  queries: FakeQuery[]
  sent: unknown[]
  root: string
  sdk: {
    query: ReturnType<typeof vi.fn>
    tool: ReturnType<typeof vi.fn>
    getSessionMessages: ReturnType<typeof vi.fn>
    getSessionInfo: ReturnType<typeof vi.fn>
  }
  deps: ConversationDeps
}

const dirs = { tmp: '', root: '' }

export function useTempRoot(): Readonly<typeof dirs> {
  beforeEach(async () => {
    dirs.tmp = await mkdtemp(join(tmpdir(), 'walph-claude-'))
    dirs.root = await realpath(dirs.tmp)
  })
  afterEach(async () => {
    await rm(dirs.tmp, { recursive: true, force: true })
  })
  return dirs
}

export function setup(
  options: { resume?: string; permissionMode?: ClaudePermissionMode; effort?: ClaudeEffort } = {},
  settings: Partial<Settings> = {}
): Harness {
  const events: ClaudeEvent[] = []
  const queries: FakeQuery[] = []
  const sent: unknown[] = []
  const sdk = {
    query: vi.fn((params: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => {
      const q = new FakeQuery(params, sent)
      queries.push(q)
      return q
    }),
    createSdkMcpServer: vi.fn((cfg: unknown) => ({ type: 'sdk', config: cfg })),
    tool: vi.fn((name: string, _d: string, _s: unknown, handler: unknown) => ({ name, handler })),
    getSessionMessages: vi.fn(() => Promise.resolve([])),
    getSessionInfo: vi.fn(() => Promise.resolve(undefined))
  }
  const deps: ConversationDeps = {
    loadSdk: () => Promise.resolve(sdk as unknown as Sdk),
    getRoot: () => dirs.root,
    getSettings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
    getEditorContext: () => ({ activeFile: null, selection: null, openFiles: [] }),
    getDiagnostics: () => [],
    emit: (e) => events.push(e)
  }
  const conv = new ClaudeConversation('c1', deps, options)
  return { conv, events, queries, sent, root: dirs.root, sdk, deps }
}

export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 60))
export const of = <T extends ClaudeEvent['type']>(h: Harness, type: T): Extract<ClaudeEvent, { type: T }>[] =>
  h.events.filter((e): e is Extract<ClaudeEvent, { type: T }> => e.type === type)

export type CanUse = (
  name: string,
  input: Record<string, unknown>,
  o: Record<string, unknown>
) => Promise<PermissionResult>
export const canUse = (h: Harness): CanUse => h.queries[0].params.options.canUseTool as CanUse
export const toolOpts = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  signal: new AbortController().signal,
  toolUseID: 't1',
  ...extra
})
export const lastRequest = (h: Harness): ClaudePermissionRequest => {
  const all = of(h, 'permission')
  return all[all.length - 1].request
}

export const promptInput = (text: string): ClaudePromptInput => ({
  text,
  attachments: [],
  images: [],
  activeFile: null,
  selection: null
})

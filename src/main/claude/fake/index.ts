import type { Sdk } from '../sdk'
import type { ClaudeCliRunner } from '../cliRunner'
import { createCallLog } from './callLog'
import { runFakeCli, type FakeMcpState } from './cli'
import { createFakeQuery, type QueryParams } from './query'
import type { FakeScript } from './script'
import { FakeSessionStore } from './sessionStore'

export { loadFakeScriptFile, parseFakeScript } from './script'

/** The fake SDK and the fake `claude mcp …` that shares its MCP server state. */
export interface FakeClaude {
  sdk: Sdk
  runCli: ClaudeCliRunner
}

export function createFakeSdk(script: FakeScript, storePath: string | null = null, logPath: string | null = null): Sdk {
  return createFakeClaude(script, storePath, logPath).sdk
}

/** What `conversation.ts`, `ideServer.ts` and `ipc/claude.ts` use from the SDK. */
export function createFakeClaude(
  script: FakeScript,
  storePath: string | null = null,
  logPath: string | null = null
): FakeClaude {
  const cursor = { next: 0 }
  const log = createCallLog(logPath)
  const store = new FakeSessionStore(storePath)
  const mcp: FakeMcpState = {
    servers: structuredClone(script.mcpServers ?? []),
    auth: { loggedIn: true, account: script.account ? structuredClone(script.account) : null }
  }
  const sdk = {
    query: (params: QueryParams) => createFakeQuery(script, cursor, store, log, mcp, params),
    listSessions: (o?: { dir?: string; limit?: number; offset?: number }) =>
      Promise.resolve(store.list(o?.dir, o?.limit, o?.offset)),
    getSessionMessages: (id: string) => Promise.resolve(store.messages(id)),
    getSessionInfo: (id: string) => Promise.resolve(store.info(id)),
    forkSession: (id: string, o?: { title?: string; upToMessageId?: string }) =>
      new Promise((resolve) => resolve(store.fork(id, o))),
    renameSession: (id: string, title: string) => new Promise<void>((resolve) => resolve(store.rename(id, title))),
    createSdkMcpServer: (config: unknown) => ({ type: 'sdk', name: 'walph', instance: config }),
    tool: (name: string, _description: string, _schema: unknown, handler: unknown) => ({ name, handler })
  }
  return { sdk: sdk as unknown as Sdk, runCli: (args, ctx) => runFakeCli(mcp, log, args, ctx.cwd) }
}

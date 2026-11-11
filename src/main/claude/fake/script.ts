// Fake SDK for tests (E2E without network or a real Claude). `claude/sdk.ts` loads it (`./fake`) instead of the
// Agent SDK when `WALPH_FAKE_CLAUDE=<JSON script file>` is set (ignored in the packaged app). It plugs in at the same
// point as the real SDK: `conversation.ts` does not know it is fake. No process is created.
//
// Script format: `{ "turns": [ [step, ...], ... ] }` (or the list of turns directly). Each message sent by the
// user consumes the NEXT turn, in order, counting every conversation in the app (the counter belongs to the script, not
// to `query()`): a test with two sessions controls who gets what by the order of the sends. Messages sent while
// a turn runs are queued and run in sequence. Out of turns: short default text + ok result.
//
// Steps (an object with ONE key):
//   { "assistant": "text" }                        assistant message (with a `stream_event` before it)
//   { "toolUse": { "name": "Edit", "input": {} } } tool_use block + "ok" tool_result from the user
//   { "toolCall": { "id": "t1", "name": "Agent", "input": {}, "parentToolUseId": "t0" } }
//                                                  ONLY the tool_use block (the tool stays "in progress"); `id` is the
//                                                  `tool_use_id` that `toolResult` uses later; `parentToolUseId`
//                                                  (optional) marks the call as coming from a subagent
//   { "toolResult": { "id": "t1", "content": "done", "isError": false, "parentToolUseId": "t0" } }
//                                                  ONLY the tool_result (`user` message) of call `id`; `isError` and
//                                                  `parentToolUseId` are optional. Two `Agent`s in parallel:
//                                                  toolCall a, toolCall b, delay, toolResult a, toolResult b
//   { "subagentMessage": { "parentToolUseId": "t1", "text": "found 3 files" } }
//                                                  assistant text message INSIDE subagent `t1`
//                                                  (`parent_tool_use_id`)
//   { "permission": { "toolName": "Bash", "input": {}, "suggestions": [ ... ] } }
//                                                  calls `canUseTool` and WAITS for the panel's answer; if denied with
//                                                  interrupt (cancelled), the turn ends; if allowed, emits the
//                                                  tool_use and the tool_result. `suggestions` (optional, SDK
//                                                  `PermissionUpdate` format) goes in `options.suggestions`. Like the
//                                                  CLI, the step does NOT ask when every `allow` rule of the
//                                                  suggestions already applies: they are in
//                                                  `<cwd>/.claude/settings.local.json` (`permissions.allow`) or were
//                                                  accepted earlier in this conversation (`updatedPermissions`)
//   { "question": { "questions": [ { "question": "...", "header": "...", "options": [{ "label": "...", "description": "" }],
//                                     "multiSelect": false } ] } }
//                                                  calls `canUseTool('AskUserQuestion', { questions })` and WAITS for
//                                                  the questions card. Answered: tool_use + tool_result and the text
//                                                  `Answers: <JSON of updatedInput.answers>`; skipped (deny without
//                                                  interrupt): tool_result and `Skipped: <message>`; cancelled (deny
//                                                  with interrupt): the turn ends, as in `permission`
//   { "commandOutput": "text" }                   `user` message with `<local-command-stdout>text</local-command-stdout>`
//                                                  (output of `/context`, `/cost`…; becomes the `commandOutput`
//                                                  event)
//   { "compactBoundary": { "trigger": "manual", "preTokens": 5000 } }
//                                                  `system` `compact_boundary` message (becomes the `compacted`
//                                                  event); `trigger` defaults to "manual"; `preTokens` optional
//                                                  (omitted = no `pre_tokens`)
//   { "elicitation": { "serverName": "docs", "message": "...", "mode": "form", "requestedSchema": { ... },
//                      "url": "https://...", "title": "..." } }
//                                                  calls `options.onElicitation` (request from an MCP server) and
//                                                  WAITS for the panel's answer; logs `{ "type": "elicitation",
//                                                  "request", "result" }` and the turn goes on (cancelled/aborted: the
//                                                  turn ends). `mode` defaults to "form"; without `onElicitation` the
//                                                  result is `null`
//   { "rateLimit": { "status": "allowed_warning", "rateLimitType": "five_hour", "utilization": 0.8, "resetsAt": 1900000000 } }
//                                                  `rate_limit_event` (`rate_limit_info` = the object, like the CLI)
//   { "apiRetry": { "attempt": 1, "maxRetries": 5, "delayMs": 2000, "errorStatus": 529 } }
//                                                  `system` `api_retry` (`errorStatus` `null` = network error)
//   { "permissionDenied": { "toolName": "Bash", "toolUseId": "t9", "reason": "classifier" } }
//                                                  `system` `permission_denied` (`reason` becomes `decision_reason`)
//   { "taskProgress": { "taskId": "a1", "toolUseId": "t1", "summary": "Reading files", "totalTokens": 1200,
//                       "toolUses": 3, "durationMs": 4000, "lastToolName": "Read" } }
//                                                  `system` `task_progress`; only `taskId` is required
//   { "promptSuggestion": "run the tests" }        `prompt_suggestion`: comes out AFTER the turn's `result` (and
//                                                  `idle`), at any position in the step list
//   { "toolProgress": { "toolUseId": "t1", "toolName": "Bash", "elapsedSeconds": 3, "heartbeat": false } }
//                                                  `tool_progress`
//   { "commandsChanged": [{ "name": "new", "description": "...", "argumentHint": "" }] }
//                                                  `system` `commands_changed` (the WHOLE list; becomes the `/` `init`)
//   { "modelRefusalFallback": { "from": "opus", "to": "sonnet", "scope": "session", "retracted": ["<uuid>"] } }
//                                                  `system` `model_refusal_fallback`; `scope` defaults to "session"
//   { "delay": 500 }                               waits (ms, max 60000; interruptible)
//   { "assistantError": "authentication_failed" }  assistant message with `error` (becomes the `error` event)
//   { "result": { "isError": false, "text": "ok", "costUsd": 0.01 } }
//                                                  the turn's `result` (ends the turn; without it, an ok `result` is
//                                                  emitted at the end)
//   { "error": "message" }                         the `query()` iterator throws (the conversation fails and closes)
//
// Sessions: `listSessions`, `getSessionInfo`, `getSessionMessages`, `forkSession` and `renameSession` work
// on a store (`sessionStore.ts`) fed by the turns' messages as they happen (the session comes into existence
// on the first user message, like the CLI file). It lives in the JSON at `WALPH_FAKE_CLAUDE_STORE` (default:
// `<script>.sessions.json`) and survives an app restart; delete the file to start from scratch.
//
// Optional fields at the script root:
//   "commands": [{ "name": "compact", "description": "...", "argumentHint": "" }]   `init` commands (default: compact)
//   "models": [{ "value": "opus", "displayName": "Opus", "description": "", "supportedEffortLevels": ["low","high"] }]
//   "account": { "email", "organization", "subscriptionType" }   account of `init` and of the fake
//     `claude auth status` (the fake `auth logout` deletes it and the status becomes `loggedIn: false`; without the
//     field, logged in and no account in `init`)
//   "usage": { ... }   raw response of `usage_EXPERIMENTAL…` (`SDKControlGetUsageResponse`); without the field the
//     method does not exist (`/usage` gets `null`). Log: { "type": "usage" } · { "type": "authCli", "args", "cwd" }
// Log for the tests: each `query()`, user message, `setPermissionMode`, `setModel` and `applyFlagSettings`
// becomes a JSON line in `WALPH_FAKE_CLAUDE_LOG` (default: `<script>.calls.jsonl`) and is pushed to
// `globalThis.__walphFakeClaudeCalls` (read it with `electronApp.evaluate`):
//   { "type": "query", "options": { "permissionMode", "allowDangerouslySkipPermissions", "model", "effort",
//                                   "agentProgressSummaries", "promptSuggestions", "fallbackModel", "onElicitation" } }
//   { "type": "user", "content": [ SDK blocks: text/image, with the <attached_file> and the base64 images ] }
//   { "type": "setPermissionMode", "mode" } · { "type": "setModel", "model" } · { "type": "applyFlagSettings", "settings" }
// `setPermissionMode('bypassPermissions')` rejects like the CLI when `query()` did not get
// `allowDangerouslySkipPermissions: true`.
//
// MCP servers (`/mcp`): optional root field `"mcpServers": [{ "name", "status", "scope", "config", "tools",
// "serverInfo", "error" }]`: the SDK `McpServerStatus` format (`status` defaults to `connected`, `scope` to `project`;
// `source` defaults to `scope`). It is the fake's mutable state (shared by every conversation) and goes into
// `init.mcp_servers`. `toggleMcpServer` switches `disabled`/`connected`; `reconnectMcpServer` takes `failed` to
// `connected`; `mcpSubmitOAuthCallbackUrl` leads to `connected`; `mcpClearAuth` leads to `needs-auth`;
// `mcpAuthenticate` returns `{ authUrl: "https://example.invalid/oauth", requiresUserAction: true, callbackExpected: true }`
// (the browser does not open). The fake's `claude mcp add-json/remove` (`FakeClaude.runCli`) changes the SAME state.
// Log entries: { "type": "mcpServerStatus" } · { "type": "toggleMcpServer", "name", "enabled" } ·
// { "type": "reconnectMcpServer", "name" } · { "type": "mcpAuthenticate", "name", "authUrl" } ·
// { "type": "mcpSubmitOAuthCallbackUrl", "name", "callbackUrl" } · { "type": "mcpClearAuth", "name" } ·
// { "type": "reloadPlugins" } · { "type": "mcpCli", "args": [...], "cwd" }
//
// Example:
//   {
//     "turns": [
//       [{ "assistant": "Ready." }],
//       [{ "assistant": "Running a command." }, { "permission": { "toolName": "Bash", "input": { "command": "ls" } } },
//        { "assistant": "Done." }],
//       [{ "delay": 300 }, { "result": { "isError": true, "text": "failed" } }],
//       [{ "error": "the process died" }]
//     ]
//   }

import { isFiniteNumber, isRecord } from '@shared/guards'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

export type FakeStep =
  | { assistant: string }
  | { toolUse: { name: string; input: Record<string, unknown> } }
  | { toolCall: { id: string; name: string; input: Record<string, unknown>; parentToolUseId: string | null } }
  | { toolResult: { id: string; content: string; isError: boolean; parentToolUseId: string | null } }
  | { subagentMessage: { parentToolUseId: string; text: string } }
  | { permission: { toolName: string; input: Record<string, unknown>; suggestions?: unknown[] } }
  | { question: { questions: unknown[] } }
  | { elicitation: Record<string, unknown> }
  | { rateLimit: Record<string, unknown> }
  | { apiRetry: { attempt: number; maxRetries: number; delayMs: number; errorStatus: number | null } }
  | { permissionDenied: { toolName: string; toolUseId: string; reason: string } }
  | { taskProgress: Record<string, unknown> & { taskId: string } }
  | { promptSuggestion: string }
  | { toolProgress: { toolUseId: string; toolName: string; elapsedSeconds: number; heartbeat: boolean } }
  | { commandsChanged: FakeCommand[] }
  | { modelRefusalFallback: { from: string; to: string; scope: 'session' | 'local'; retracted: string[] } }
  | { commandOutput: string }
  | { compactBoundary: { trigger: 'manual' | 'auto'; preTokens?: number } }
  | { delay: number }
  | { assistantError: string }
  | { result: { isError: boolean; text: string; costUsd: number } }
  | { error: string }

export interface FakeCommand {
  name: string
  description: string
  argumentHint: string
}

export interface FakeModel {
  value: string
  displayName: string
  description: string
  supportedEffortLevels: string[]
}

export interface FakeScript {
  turns: FakeStep[][]
  /** `init` commands (default: `compact`). */
  commands?: FakeCommand[]
  /** `init` models (default: one model without effort levels). */
  models?: FakeModel[]
  /** Initial MCP servers (`McpServerStatus` format); mutable state of the fake. */
  mcpServers?: Array<Record<string, unknown>>
  /** Account of `init` and of the fake `claude auth status` (`AccountInfo` format); gone after an `auth logout`. */
  account?: Record<string, unknown>
  /** Raw response of `usage_EXPERIMENTAL…` (`SDKControlGetUsageResponse` format); absent = no such method. */
  usage?: Record<string, unknown>
}

export const DEFAULT_COMMANDS: FakeCommand[] = [
  { name: 'compact', description: 'Compacts the conversation', argumentHint: '' }
]
export const DEFAULT_MODELS: FakeModel[] = [
  { value: 'default', displayName: 'Default', description: 'Test model', supportedEffortLevels: [] }
]

function parseCommands(v: unknown): FakeCommand[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) throw new Error('Invalid fake Claude script: "commands" must be a list.')
  return v.map((c, i) => {
    if (!isRecord(c) || typeof c.name !== 'string')
      throw new Error(`Invalid fake Claude script: commands[${i}] needs "name".`)
    return {
      name: c.name,
      description: typeof c.description === 'string' ? c.description : '',
      argumentHint: typeof c.argumentHint === 'string' ? c.argumentHint : ''
    }
  })
}

function parseModels(v: unknown): FakeModel[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) throw new Error('Invalid fake Claude script: "models" must be a list.')
  return v.map((m, i) => {
    if (!isRecord(m) || typeof m.value !== 'string')
      throw new Error(`Invalid fake Claude script: models[${i}] needs "value".`)
    return {
      value: m.value,
      displayName: typeof m.displayName === 'string' ? m.displayName : m.value,
      description: typeof m.description === 'string' ? m.description : '',
      supportedEffortLevels: Array.isArray(m.supportedEffortLevels)
        ? m.supportedEffortLevels.filter((l): l is string => typeof l === 'string')
        : []
    }
  })
}

const MAX_DELAY_MS = 60_000
export const DEFAULT_REPLY = 'Test reply.'

function parseStep(raw: unknown, where: string): FakeStep {
  const bad = (what: string): never => {
    throw new Error(`Invalid fake Claude script at ${where}: ${what}.`)
  }
  if (!isRecord(raw)) return bad('the step must be an object')
  const keys = Object.keys(raw)
  if (keys.length !== 1) return bad('the step must have exactly one key')
  const key = keys[0] ?? ''
  const value = raw[key]
  switch (key) {
    case 'assistant':
      return typeof value === 'string' ? { assistant: value } : bad('"assistant" must be text')
    case 'assistantError':
      return typeof value === 'string' ? { assistantError: value } : bad('"assistantError" must be text')
    case 'error':
      return typeof value === 'string' ? { error: value } : bad('"error" must be text')
    case 'commandOutput':
      return typeof value === 'string' ? { commandOutput: value } : bad('"commandOutput" must be text')
    case 'compactBoundary': {
      const c = isRecord(value) ? value : {}
      return {
        compactBoundary: {
          trigger: c.trigger === 'auto' ? 'auto' : 'manual',
          ...(isFiniteNumber(c.preTokens) ? { preTokens: c.preTokens } : {})
        }
      }
    }
    case 'delay':
      return typeof value === 'number' && value >= 0 && Number.isFinite(value)
        ? { delay: Math.min(value, MAX_DELAY_MS) }
        : bad('"delay" must be a number of ms')
    case 'toolUse':
      return isRecord(value) && typeof value.name === 'string'
        ? { toolUse: { name: value.name, input: isRecord(value.input) ? value.input : {} } }
        : bad('"toolUse" needs "name"')
    case 'toolCall':
      return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
        ? {
            toolCall: {
              id: value.id,
              name: value.name,
              input: isRecord(value.input) ? value.input : {},
              parentToolUseId: typeof value.parentToolUseId === 'string' ? value.parentToolUseId : null
            }
          }
        : bad('"toolCall" needs "id" and "name"')
    case 'toolResult':
      return isRecord(value) && typeof value.id === 'string'
        ? {
            toolResult: {
              id: value.id,
              content: typeof value.content === 'string' ? value.content : 'ok',
              isError: value.isError === true,
              parentToolUseId: typeof value.parentToolUseId === 'string' ? value.parentToolUseId : null
            }
          }
        : bad('"toolResult" needs "id"')
    case 'subagentMessage':
      return isRecord(value) && typeof value.parentToolUseId === 'string' && typeof value.text === 'string'
        ? { subagentMessage: { parentToolUseId: value.parentToolUseId, text: value.text } }
        : bad('"subagentMessage" needs "parentToolUseId" and "text"')
    case 'permission':
      if (isRecord(value) && value.suggestions !== undefined && !Array.isArray(value.suggestions)) {
        return bad('"suggestions" must be a list')
      }
      return isRecord(value) && typeof value.toolName === 'string'
        ? {
            permission: {
              toolName: value.toolName,
              input: isRecord(value.input) ? value.input : {},
              ...(Array.isArray(value.suggestions) ? { suggestions: value.suggestions } : {})
            }
          }
        : bad('"permission" needs "toolName"')
    case 'question':
      return isRecord(value) && Array.isArray(value.questions)
        ? { question: { questions: value.questions } }
        : bad('"question" needs "questions" (list)')
    case 'elicitation':
      return isRecord(value) ? { elicitation: value } : bad('"elicitation" must be an object')
    case 'rateLimit':
      return isRecord(value) ? { rateLimit: value } : bad('"rateLimit" must be an object')
    case 'apiRetry': {
      const r = isRecord(value) ? value : {}
      return {
        apiRetry: {
          attempt: typeof r.attempt === 'number' ? r.attempt : 1,
          maxRetries: typeof r.maxRetries === 'number' ? r.maxRetries : 5,
          delayMs: typeof r.delayMs === 'number' ? r.delayMs : 1000,
          errorStatus: typeof r.errorStatus === 'number' ? r.errorStatus : null
        }
      }
    }
    case 'permissionDenied': {
      const r = isRecord(value) ? value : {}
      return {
        permissionDenied: {
          toolName: typeof r.toolName === 'string' ? r.toolName : 'Bash',
          toolUseId: typeof r.toolUseId === 'string' ? r.toolUseId : `toolu_${randomUUID()}`,
          reason: typeof r.reason === 'string' ? r.reason : 'denied'
        }
      }
    }
    case 'taskProgress':
      return isRecord(value) && typeof value.taskId === 'string'
        ? { taskProgress: { ...value, taskId: value.taskId } }
        : bad('"taskProgress" needs "taskId"')
    case 'promptSuggestion':
      return typeof value === 'string' ? { promptSuggestion: value } : bad('"promptSuggestion" must be text')
    case 'toolProgress':
      return isRecord(value) && typeof value.toolUseId === 'string'
        ? {
            toolProgress: {
              toolUseId: value.toolUseId,
              toolName: typeof value.toolName === 'string' ? value.toolName : 'Bash',
              elapsedSeconds: typeof value.elapsedSeconds === 'number' ? value.elapsedSeconds : 1,
              heartbeat: value.heartbeat === true
            }
          }
        : bad('"toolProgress" needs "toolUseId"')
    case 'commandsChanged': {
      const list = parseCommands(value)
      return list ? { commandsChanged: list } : bad('"commandsChanged" must be a list of commands')
    }
    case 'modelRefusalFallback': {
      const r = isRecord(value) ? value : {}
      return typeof r.from === 'string' && typeof r.to === 'string'
        ? {
            modelRefusalFallback: {
              from: r.from,
              to: r.to,
              scope: r.scope === 'local' ? 'local' : 'session',
              retracted: Array.isArray(r.retracted) ? r.retracted.filter((u): u is string => typeof u === 'string') : []
            }
          }
        : bad('"modelRefusalFallback" needs "from" and "to"')
    }
    case 'result': {
      const r = isRecord(value) ? value : {}
      return {
        result: {
          isError: r.isError === true,
          text: typeof r.text === 'string' ? r.text : r.isError === true ? 'Test error.' : 'ok',
          costUsd: typeof r.costUsd === 'number' ? r.costUsd : 0
        }
      }
    }
    default:
      return bad(`unknown step "${key}"`)
  }
}

/**
 * Validates the script JSON (accepts `{ turns }` or the list of turns directly). Throws a translated message (`t()`).
 */
export function parseFakeScript(json: unknown): FakeScript {
  const turns = Array.isArray(json) ? json : isRecord(json) ? json.turns : undefined
  if (!Array.isArray(turns)) throw new Error('Invalid fake Claude script: expected { "turns": [[steps]] }.')
  const root = isRecord(json) ? json : {}
  const commands = parseCommands(root.commands)
  const models = parseModels(root.models)
  return {
    turns: turns.map((turn, i) => {
      if (!Array.isArray(turn)) throw new Error(`Invalid fake Claude script: turn ${i} must be a list.`)
      return turn.map((step, j) => parseStep(step, `turns[${i}][${j}]`))
    }),
    ...(commands ? { commands } : {}),
    ...(models ? { models } : {}),
    ...(root.mcpServers !== undefined ? { mcpServers: parseMcpServers(root.mcpServers) } : {}),
    ...(isRecord(root.account) ? { account: root.account } : {}),
    ...(isRecord(root.usage) ? { usage: root.usage } : {})
  }
}

function parseMcpServers(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) throw new Error('Invalid fake Claude script: "mcpServers" must be a list.')
  return v.map((s, i) => {
    if (!isRecord(s) || typeof s.name !== 'string' || s.name === '')
      throw new Error(`Invalid fake Claude script: mcpServers[${i}] needs "name".`)
    const scope = typeof s.scope === 'string' ? s.scope : 'project'
    return { status: 'connected', scope, source: scope, tools: [], ...s }
  })
}

export function loadFakeScriptFile(path: string): FakeScript {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`Could not read the fake Claude script: ${path}`)
  }
  try {
    return parseFakeScript(JSON.parse(text))
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`Fake Claude script is not valid JSON: ${path}`, { cause: err })
    throw err
  }
}

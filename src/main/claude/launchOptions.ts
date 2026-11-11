// Agent SDK `query()` `Options` to start the CLI process. Pure: everything that depends on the conversation or the SDK
// (callbacks, IDE MCP server, hooks, spawner) comes in ready, so it can be tested without the SDK.

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeEffort, ClaudePermissionMode } from '@shared/types'
import { IDE_ALLOWED_TOOLS } from './ideServer'

export const IDE_PROMPT =
  'You are running inside Walph, a desktop IDE. The mcp__walph__* tools expose the IDE: use getDiagnostics to see ' +
  'language-server errors and warnings for open files instead of running a build, getCurrentSelection/getOpenEditors ' +
  'for what the user is looking at, and openDiff to propose a change for review. Text between <ide_selection>, ' +
  '<ide_opened_file> and <attached_file> tags is context the IDE attached to the user message.'

/** `default` (or empty) = the CLI default model: nothing to pass. */
export function explicitModel(model: string): string {
  return model && model !== 'default' ? model : ''
}

/**
 * `claude.fallbackModel` (comma-separated list, as the CLI itself accepts) without stray spaces. The CLI refuses to
 * start if the fallback is the main model itself: those items are removed from the list.
 */
export function fallbackModels(setting: string, model: string): string {
  const main = explicitModel(model)
  return setting
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m !== '' && m !== main)
    .join(',')
}

export interface LaunchParams {
  root: string
  env: Record<string, string>
  permissionMode: ClaudePermissionMode
  /** `claude.allowBypassPermissions`: only with it does the CLI accept switching to bypass later. */
  allowBypass: boolean
  model: string
  effort: ClaudeEffort | undefined
  /** `claude.fallbackModel` as it is in the settings. */
  fallbackModel: string
  /** `claude.executable` already resolved; `undefined` = SDK native binary. */
  executable: string | undefined
  sessionId: string
  /** Resumes `sessionId` instead of creating it. */
  resume: boolean
  /** With `resume`: the session point to resume from (rewind). */
  resumeAt: string | undefined
  canUseTool: NonNullable<Options['canUseTool']>
  onElicitation: NonNullable<Options['onElicitation']>
  mcpServers: NonNullable<Options['mcpServers']>
  hooks: NonNullable<Options['hooks']>
  spawnClaudeCodeProcess: NonNullable<Options['spawnClaudeCodeProcess']>
}

export function buildLaunchOptions(p: LaunchParams): Options {
  const model = explicitModel(p.model)
  const fallbackModel = fallbackModels(p.fallbackModel, p.model)
  return {
    cwd: p.root,
    env: p.env,
    permissionMode: p.permissionMode,
    ...(p.allowBypass ? { allowDangerouslySkipPermissions: true } : {}),
    settingSources: ['user', 'project', 'local'],
    systemPrompt: { type: 'preset', preset: 'claude_code', append: IDE_PROMPT },
    includePartialMessages: true,
    enableFileCheckpointing: true,
    canUseTool: p.canUseTool,
    mcpServers: p.mcpServers,
    allowedTools: IDE_ALLOWED_TOOLS,
    hooks: p.hooks,
    // The panel has a per-task "stop": that way the turn "Stop" does not kill the background agents along with it.
    perTaskStopAffordance: true,
    spawnClaudeCodeProcess: p.spawnClaudeCodeProcess,
    ...(p.executable ? { pathToClaudeCodeExecutable: p.executable } : {}),
    ...(model ? { model } : {}),
    ...(p.effort ? { effort: p.effort } : {}),
    // No subagent progress summaries: each one is an extra model call with the subagent's whole context every ~30s,
    // which can double the plan usage. The agent row shows the task.
    agentProgressSummaries: false,
    // Next prompt suggestion after each turn (one call per turn, on top of the conversation cache).
    promptSuggestions: true,
    // MCP requests (form/URL) become a card in the panel; without this the CLI would decline them on its own.
    onElicitation: p.onElicitation,
    ...(fallbackModel ? { fallbackModel } : {}),
    ...(p.resume
      ? { resume: p.sessionId, ...(p.resumeAt ? { resumeSessionAt: p.resumeAt } : {}) }
      : { sessionId: p.sessionId })
  }
}

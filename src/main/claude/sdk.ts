// The Agent SDK is ESM-only and stays external to the main bundle (loaded from node_modules by native `import()`);
// the import is lazy so the app and the tests do not pay the cost until the first conversation.

import { t } from '@shared/i18n'
import { app } from 'electron'
import type * as SdkModule from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeCliRunner } from './cliRunner'
import type { FakeClaude } from './fake'
import { UserError } from '../errors'

export type Sdk = typeof SdkModule

let loading: Promise<Sdk> | null = null
let loadingFake: Promise<FakeClaude> | null = null

/**
 * `WALPH_FAKE_CLAUDE=<JSON script>`: replaces the SDK with `fake/` (tests without network). Ignored in the packaged
 * app, like `WALPH_HIDDEN_WINDOWS`.
 */
export function fakeClaudeScriptPath(): string | null {
  if (app.isPackaged) return null

  return process.env.WALPH_FAKE_CLAUDE || null
}

function loadFake(script: string): Promise<FakeClaude> {
  // Fake session store: its own file (survives restarting the app in tests), by default next to the script.

  const store = process.env.WALPH_FAKE_CLAUDE_STORE || `${script}.sessions.json`

  const log = process.env.WALPH_FAKE_CLAUDE_LOG || `${script}.calls.jsonl`
  loadingFake ??= import('./fake').then((m) => m.createFakeClaude(m.loadFakeScriptFile(script), store, log))
  // Invalid script: the (translated) message already says what to fix; the next send reads the file again.
  loadingFake.catch(() => (loadingFake = null))
  return loadingFake
}

/** `claude mcp …` of the fake SDK (only exists with `fakeClaudeScriptPath()`). */
export const fakeCliRunner: ClaudeCliRunner = (args, ctx) => {
  const script = fakeClaudeScriptPath()
  if (!script) return Promise.reject(new UserError(t().claudeHost.cli.runUnavailable))
  return loadFake(script).then((fake) => fake.runCli(args, ctx))
}

export function loadSdk(): Promise<Sdk> {
  const fake = fakeClaudeScriptPath()
  if (fake) return loadFake(fake).then((f) => f.sdk)
  loading ??= import('@anthropic-ai/claude-agent-sdk').catch((err: unknown) => {
    loading = null
    throw new UserError(t().claudeHost.cli.sdkLoadFailed, {
      cause: err
    })
  })
  return loading
}

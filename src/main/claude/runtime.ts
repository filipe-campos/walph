// What the conversation needs from the environment outside the SDK: login shell PATH, `claude mcp …` and opening the
// browser. In test mode (fake SDK) none of this touches the system; otherwise it is the real app.

import { shell } from 'electron'
import { loginShellPath } from '../env/loginShell'
import { runClaudeCli, type ClaudeCliRunner } from './cliRunner'
import { fakeClaudeScriptPath, fakeCliRunner } from './sdk'

export interface ClaudeRuntime {
  /** Login shell PATH (`null` = none). */
  loginPath(): Promise<string | null>
  runCli: ClaudeCliRunner
  /** Opens an already validated `http(s)` URL in the browser. */
  openExternal(url: string): Promise<void>
}

export function claudeRuntime(): ClaudeRuntime {
  if (fakeClaudeScriptPath()) {
    // The fake SDK runs nothing (not even worth waiting for the login shell) and the browser never opens.
    return { loginPath: () => Promise.resolve(null), runCli: fakeCliRunner, openExternal: () => Promise.resolve() }
  }
  return { loginPath: () => loginShellPath(), runCli: runClaudeCli, openExternal: (url) => shell.openExternal(url) }
}

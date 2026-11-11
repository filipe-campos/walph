import { homedir } from 'node:os'
import { t } from '@shared/i18n'
import type { WebContents } from 'electron'
import { assertRunnableBinary } from '../env/executable'
import { getEffectiveSettings } from '../settings/state'
import { registerTerminalSource } from '../terminal/launchSources'
import { getWindowRoot } from '../window/windows'
import { createViewRegistry } from '../window/viewResources'
import { readAuthStatus, runLogout } from './auth'
import { resolveCliContext } from './cliContext'
import { resolveNativeBinary, type CliContext } from './cliRunner'
import { restartAllOf } from './registry'
import { claudeRuntime } from './runtime'
import { fakeClaudeScriptPath } from './sdk'
import { UserError } from '../errors'

/** View context of `claude auth …`: same executable, login PATH and `claude.env` as conversations; folder optional. */
function authContext(wc: WebContents): Promise<CliContext> {
  return resolveCliContext(getEffectiveSettings(wc), getWindowRoot(wc) ?? homedir(), claudeRuntime().loginPath)
}

// `claude auth …` in progress: reloading or closing the view aborts the subcommand (the whole tree dies).
const authRuns = createViewRegistry<AbortController>({ key: 'claude:auth', dispose: (run) => run.abort() })

async function withAuthCli<T>(
  wc: WebContents,
  action: (run: ReturnType<typeof claudeRuntime>['runCli'], context: CliContext) => Promise<T>
): Promise<T> {
  const assertAlive = authRuns.guardEpoch(wc)
  const context = await authContext(wc)
  assertAlive(() => new UserError(t().claudeHost.conversation.closed))
  const run = new AbortController()
  const untrack = authRuns.track(wc, run)
  try {
    return await action(claudeRuntime().runCli, { ...context, signal: run.signal })
  } finally {
    untrack()
  }
}

export function authStatus(wc: WebContents): ReturnType<typeof readAuthStatus> {
  return withAuthCli(wc, readAuthStatus)
}

/** `claude auth logout` and restart of the view's idle conversations (they reread the credentials). */
export async function logout(wc: WebContents): Promise<void> {
  await withAuthCli(wc, runLogout)
  await restartAllOf(wc)
}

/** `claude auth login` command to run in a pty: same executable, PATH and `claude.env` as the conversations. */
async function claudeLoginCommand(
  wc: WebContents
): Promise<{ file: string; args: string[]; env: Record<string, string> }> {
  const context = await authContext(wc)
  // Fake SDK (tests): never the real binary; a command that exits successfully.
  if (fakeClaudeScriptPath()) {
    return process.platform === 'win32'
      ? { file: 'cmd.exe', args: ['/c', 'exit', '0'], env: context.env }
      : { file: '/usr/bin/true', args: [], env: context.env }
  }
  const file = context.executable ?? resolveNativeBinary()
  if (!file) {
    throw new UserError(t().claudeHost.cli.notFound)
  }
  assertRunnableBinary(file, () => t().claudeHost.cli.scriptForLogin)
  return { file, args: ['auth', 'login'], env: context.env }
}

export function registerClaudeLoginSource(): void {
  registerTerminalSource('claudeLogin', claudeLoginCommand)
}

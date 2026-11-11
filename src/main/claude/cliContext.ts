// Execution context of the Claude Code CLI (conversation, `claude mcp …`, `claude auth …`): login PATH, executable from
// `claude.executable` and `claude.env`. A single place, so the three use the same environment.

import { t } from '@shared/i18n'
import type { Settings } from '@shared/types'
import { omitUndefined } from '@shared/omitUndefined'
import { buildChildEnv } from '../env/childEnv'
import { resolveExecutable, type ExecutableMessages } from '../env/executable'
import { effectivePath } from '../env/loginShell'
import type { CliContext } from './cliRunner'

/** Prefix of the test fake SDK variables; the fake docker uses another one and is not affected. */
const FAKE_CLAUDE_PREFIX = 'WALPH_FAKE_CLAUDE'

const messages: ExecutableMessages = {
  notFound: (value) => t().claudeHost.cli.executableNotFound(value),
  notInPath: (value) => t().claudeHost.cli.notInPath(value),
  windowsScript: (path) => t().claudeHost.cli.windowsScript(path)
}

/**
 * `claude.executable` → absolute path, or `undefined` (empty = SDK binary). A plain name is looked up in the PATH
 * (the login one included); an absolute path must exist.
 */
export function resolveClaudeExecutable(
  setting: string,
  pathVar: string,
  platform?: string,
  isFile?: (path: string) => boolean
): string | undefined {
  const value = setting.trim()
  if (value === '') return undefined
  return resolveExecutable(value, pathVar, { messages, ...omitUndefined({ platform, isFile }) })
}

/**
 * CLI context for `cwd`. `loginPath` is the login shell PATH (injected: the test fake SDK does not query the shell);
 * without it only the inherited PATH applies.
 */
export async function resolveCliContext(
  settings: Settings,
  cwd: string,
  loginPath: () => Promise<string | null> = () => Promise.resolve(null)
): Promise<CliContext> {
  const pathVar = await effectivePath(loginPath)
  const executable = resolveClaudeExecutable(settings['claude.executable'], pathVar)
  const env = buildChildEnv(process.env, settings['claude.env'], pathVar, { stripPrefixes: [FAKE_CLAUDE_PREFIX] })
  return { cwd, env, ...(executable ? { executable } : {}) }
}

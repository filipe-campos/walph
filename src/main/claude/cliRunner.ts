// Runs subcommands of the Claude Code binary (`claude mcp add-json/remove`, `claude auth …`): the SDK has no API to
// persist MCP servers and the CLI already handles `~/.claude.json` and `.mcp.json`. Arguments as an array, never a
// shell; the process is a group leader, so deadline, cancellation and app exit take the whole tree.

import { t } from '@shared/i18n'
import { omitUndefined } from '@shared/omitUndefined'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { assertRunnableBinary } from '../env/executable'
import { runCollect } from '../process/runCollect'
import { unpackedPath } from '../util/unpackedPath'
import { UserError } from '../errors'

/** Runs `claude <args>` and resolves with stdout; rejects with the CLI message. */
export type ClaudeCliRunner = (args: string[], ctx: CliContext) => Promise<string>

export interface CliContext {
  cwd: string
  env: Record<string, string>
  /** `claude.executable` already resolved; `undefined` = SDK native binary. */
  executable?: string
  /** Aborts (conversation/view closed): the process tree is killed. */
  signal?: AbortSignal
}

/**
 * Failure of `claude <args>`: the message is the CLI's; `stdout` and `code` go separately (e.g. a logged-out
 * `auth status` exits with 1 and JSON).
 */
export class CliExitError extends UserError {
  constructor(
    message: string,
    readonly stdout: string,
    readonly code: number | null
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 20_000
const MAX_OUTPUT = 1024 * 1024
const SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk'

/**
 * SDK native packages, in the order `sdk.mjs` looks for them: `<pkg>-<os>-<arch>` (on Linux, musl first when the
 * libc is musl) and `/claude[.exe]` inside.
 */
export function nativeBinaryCandidates(platform: string, arch: string, preferMusl: boolean): string[] {
  const exe = platform === 'win32' ? 'claude.exe' : 'claude'
  const names =
    platform === 'android'
      ? [`${SDK_PACKAGE}-linux-${arch}-android`]
      : platform === 'linux'
        ? preferMusl
          ? [`${SDK_PACKAGE}-linux-${arch}-musl`, `${SDK_PACKAGE}-linux-${arch}`]
          : [`${SDK_PACKAGE}-linux-${arch}`, `${SDK_PACKAGE}-linux-${arch}-musl`]
        : [`${SDK_PACKAGE}-${platform}-${arch}`]
  return names.map((n) => `${n}/${exe}`)
}

let muslCache: boolean | undefined
/** `process.report.getReport()` is expensive: the libc does not change during execution. */
function isMusl(): boolean {
  if (muslCache !== undefined) return muslCache
  if (process.platform !== 'linux') return (muslCache = false)
  const report =
    typeof (process as { report?: NodeJS.ProcessReport }).report?.getReport === 'function'
      ? (process.report.getReport() as unknown)
      : null
  const header = (report as { header?: { glibcVersionRuntime?: unknown } } | null)?.header
  return (muslCache = header != null && header.glibcVersionRuntime === undefined)
}

/** SDK native binary (outside the .asar in the packaged app), or `null`. */
export function resolveNativeBinary(
  resolve: (id: string) => string = createRequire(__filename).resolve,
  exists: (path: string) => boolean = existsSync
): string | null {
  for (const id of nativeBinaryCandidates(process.platform, process.arch, isMusl())) {
    try {
      const path = unpackedPath(resolve(id))
      if (exists(path)) return path
    } catch {
      // package for the other platform not installed
    }
  }
  return null
}

export const runClaudeCli: ClaudeCliRunner = async (args, ctx) => {
  const file = ctx.executable ?? resolveNativeBinary()
  if (!file) throw new UserError(t().claudeHost.cli.notFound)
  assertRunnableBinary(file, () => t().claudeHost.cli.scriptForMcp)
  const result = await runCollect(file, args, {
    cwd: ctx.cwd,
    env: ctx.env,
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT,
    maxStderr: MAX_OUTPUT,
    group: true,
    ...omitUndefined({ signal: ctx.signal })
  })
  if (result.cancelled) throw new UserError(t().claudeHost.conversation.closed)
  if (result.timedOut) throw new UserError(t().claudeHost.cli.timeout)
  if (!result.spawnError && !result.overflow && result.code === 0) return result.stdout
  // The command line carries the JSON with secrets: only the CLI output (and the spawn reason) goes on, never the args.
  const detail = result.stderr.trim() || result.stdout.trim() || result.spawnError?.message

  throw new CliExitError(detail || t().claudeHost.cli.exitCode(result.code), result.stdout, result.code)
}

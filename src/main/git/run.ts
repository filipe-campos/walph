import type { WebContents } from 'electron'
import { classifyGitError, GitCommandError, type GitErrorContext } from './gitErrors'
import { t } from '@shared/i18n'
import { runCollect, type RunCollectOptions } from '../process/runCollect'
import type { GroupProcess } from '../process/spawnGroup'
import { createViewRegistry } from '../window/viewResources'

const NETWORK_TIMEOUT_MS = 10 * 60 * 1000
/**
 * Hooks and pinentry may wait for input nobody will give: commit/switch/stash/reset have a much lower cap than the
 * network.
 */
const LOCAL_OWNED_TIMEOUT_MS = 5 * 60 * 1000
/** Only read plumbing (status, log, show…) takes the simple path: it ends in seconds; the cap avoids a stuck git. */
const PLAIN_TIMEOUT_MS = 60 * 1000

/**
 * pull/push output is short: going past this only truncates (does not kill git) and the start of stderr is what
 * explains the error.
 */
const OWNED_OUTPUT: RunCollectOptions = {
  maxBuffer: 16 * 1024 * 1024,
  onOverflow: 'truncate',
  maxStderr: 16 * 1024 * 1024,
  stderrKeep: 'head'
}
/** Read plumbing: a huge file is a failure, never cut content. */
const PLAIN_OUTPUT: RunCollectOptions = { maxBuffer: 64 * 1024 * 1024 }

export interface RunOptions {
  /** Network operation: process assigned to the window (dies with it), with timeout and non-interactive SSH. */
  owner?: WebContents
  /**
   * Local command that changes the repository (commit, switch, stash, add, restore, reset…): same group process as
   * the network, assigned to the view and with a 5 min deadline, but without non-interactive SSH and ended gently
   * (SIGTERM, then SIGKILL).
   */
  localOwner?: WebContents
  /** Deadline in ms (tests only); the default depends on the mode. */
  timeoutMs?: number
  context?: GitErrorContext | undefined
  /** stdout as a Buffer (file content: decoded later by the BOM, as the editor does). */
  binary?: boolean
  /** stdin content (`git apply -`, `git blame --contents -`). */
  input?: string | Buffer
}

export interface RunResult {
  stdout: string | Buffer
  stderr: string | Buffer
}

// Processes assigned to a view (network and local commands with hooks; leaders of their own group). View reset: the
// local one (commit, switch…) gets SIGTERM first, so git deletes the `index.lock`; app exit kills everything at once.
const ownedProcs = createViewRegistry<GroupProcess>({
  key: 'git:network',
  dispose: (proc) => {
    if (proc.graceful) proc.terminate()
    else proc.kill()
  },
  disposeSync: (procs) => {
    for (const proc of procs) proc.kill(true)
  }
})

/** Ends every git assigned to a view still in progress (app exit). */
export function killAllOwnedGit(): void {
  ownedProcs.disposeAllSync()
}

export function hasOwnedGit(owner: WebContents): boolean {
  return ownedProcs.has(owner)
}

function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Never hang waiting for a password in an invisible prompt.
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    // git messages always in English: the error classifier depends on the text.
    LC_MESSAGES: 'C',
    LANGUAGE: 'C'
  }
  if (env.LC_ALL) env.LC_ALL = 'C'
  // Inherited from VS Code/Claude Code, it would break Electron-based child processes.
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

type GitMode = 'plain' | 'network' | 'local'

function modeOf(options: RunOptions): { mode: GitMode; owner?: WebContents } {
  if (options.owner) return { mode: 'network', owner: options.owner }
  if (options.localOwner) return { mode: 'local', owner: options.localOwner }
  return { mode: 'plain' }
}

const TIMEOUT_BY_MODE: Record<GitMode, number> = {
  plain: PLAIN_TIMEOUT_MS,
  network: NETWORK_TIMEOUT_MS,
  local: LOCAL_OWNED_TIMEOUT_MS
}

/**
 * Runs git. The `network` and `local` modes are assigned to the view (they die with it, whole tree); `plain` is a
 * simple process with only a deadline. The `runCollect` result becomes `GitCommandError` with the mode's message.
 */
async function runRaw(cwd: string, args: string[], env: NodeJS.ProcessEnv, options: RunOptions): Promise<RunResult> {
  const { mode, owner } = modeOf(options)
  const owned = owner !== undefined
  const result = await runCollect('git', args, {
    cwd,
    env,
    timeout: options.timeoutMs ?? TIMEOUT_BY_MODE[mode],
    binary: options.binary,
    input: options.input,
    // Alias, hook and filter create children that would hold the pipe after a SIGKILL on `git` alone: always the
    // whole tree.
    group: true,
    graceful: mode === 'local',
    owner: owner ? ownedProcs.scope(owner) : undefined,
    ...(owned ? OWNED_OUTPUT : PLAIN_OUTPUT)
  })
  const m = t().git.errors
  // Cancelled by the view reset: the message reaches nobody, but it cannot look like an exceeded deadline.
  if (result.cancelled) throw new GitCommandError(mode === 'network' ? m.networkCancelled : m.cancelled, '', true)
  if (result.timedOut) throw new GitCommandError(mode === 'network' ? m.networkTimeout : m.timeout, '', true)
  if (!result.spawnError && !(result.overflow && !owned) && result.code === 0) {
    return { stdout: result.stdout, stderr: result.stderr }
  }
  // On conflicts git writes the details to stdout.
  const detail = `${result.stderr}\n${result.stdout.toString()}`.trim()
  const raw =
    detail ||
    (result.spawnError?.message ?? '') ||
    (result.overflow ? 'stdout maxBuffer length exceeded' : m.exitCode(args[0] ?? '', String(result.code)))
  throw new GitCommandError(classifyGitError(raw, options.context), raw)
}

/** Environment of network operations: non-interactive SSH, unless the user configured it. */
export async function networkEnv(cwd: string, globalOnly = false): Promise<NodeJS.ProcessEnv> {
  const env = baseEnv()
  if (!env.GIT_SSH_COMMAND && !env.GIT_SSH) {
    // SSH asking for a password/passphrase/host confirmation would hang without a terminal; fail fast (and it becomes
    // an auth error).
    // `globalOnly` (clone): the `cwd` is the chosen parent folder, which may be inside another repo, and `git clone`
    // does not read its local config. Looking only at global and system avoids deciding based on a `core.sshCommand`
    // that does not apply.
    const scopes = globalOnly ? [['--global'], ['--system']] : [[]]
    let configured = false
    for (const scope of scopes) {
      const r = await runRaw(cwd, ['config', ...scope, '--get', 'core.sshCommand'], env, {}).catch(() => null)
      if (r?.stdout.toString().trim()) {
        configured = true
        break
      }
    }
    if (!configured) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  }
  return env
}

export async function runGit(cwd: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const owner = options.owner ?? options.localOwner
  const assertAlive = owner ? ownedProcs.guardEpoch(owner) : null
  const env = options.owner ? await networkEnv(cwd) : baseEnv()
  // The view reloaded/closed during the `await`: the reset already ran and nothing would kill the process.
  assertAlive?.(
    () => new GitCommandError(options.owner ? t().git.errors.networkCancelled : t().git.errors.cancelled, '', true)
  )
  return runRaw(cwd, args, env, options)
}

export async function git(cwd: string, args: string[], options: RunOptions = {}): Promise<string> {
  return (await runGit(cwd, args, options)).stdout.toString()
}

export interface GitStatusResult {
  /** git exit code; `-1` when it did not run or was killed (git missing, deadline). */
  code: number
  stdout: string
}

/** For whoever decides by the exit code (`check-ignore`: 0/1/128). Never rejects; same environment as `git()`. */
export async function gitStatusCode(
  cwd: string,
  args: string[],
  { timeoutMs = PLAIN_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<GitStatusResult> {
  const result = await runCollect('git', args, { cwd, env: baseEnv(), timeout: timeoutMs, maxBuffer: 1024 * 1024 })
  const failed = result.spawnError !== null || result.timedOut || result.overflow
  return { code: failed ? -1 : (result.code ?? -1), stdout: result.stdout }
}

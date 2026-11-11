import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import * as pty from 'node-pty'
import { t as i18n } from '@shared/i18n'
import { getEffectiveSettings } from '../settings/state'
import { send } from '../window/send'
import { isActiveView } from '../workspace/isActiveView'
import { terminalSource } from './launchSources'
import { TerminalOutput } from './outputBuffer'
import { normalizeProcessTitle } from './processTitle'
import { disposeTerminal, terminals, type Terminal } from './registry'
import { buildTerminalEnv, resolveTerminal } from './resolveProfile'
import { installShellIntegration } from './installShellIntegration'
import { withShellIntegration } from './shellIntegration'
import { parseCreateOptions } from './validate'
import { UserError } from '../errors'

// Minimum interval between reads of `term.process` (cheap, but the pty emits data all the time).
const TITLE_THROTTLE_MS = 300
/** Batching window for pty output: a visible terminal fits in one frame; a hidden one batches more. */
const OUTPUT_ACTIVE_MS = 16
const OUTPUT_INACTIVE_MS = 100

interface LaunchPlan {
  file: string
  args: string[]
  env: Record<string, string>
  cwd?: string
  onSpawned?: (pid: number | null) => void
}

async function planLaunch(sender: WebContents, options: ReturnType<typeof parseCreateOptions>): Promise<LaunchPlan> {
  const { profile: requested, dockerExec, claudeLogin, debugRun } = options
  if (debugRun !== null) return terminalSource('debugRun')(sender, debugRun)
  if (claudeLogin) {
    const assertAlive = terminals.guardEpoch(sender)
    const login = await terminalSource('claudeLogin')(sender)
    assertAlive(() => new UserError(i18n().terminal.errors.reloadedBeforeLogin))
    return { file: login.file, args: login.args, env: buildTerminalEnv(login.env, {}) }
  }
  if (dockerExec !== null) {
    // `docker exec -it` instead of the shell (id validated in main; the executable comes from `docker.path`).
    const assertAlive = terminals.guardEpoch(sender)
    const exec = await terminalSource('dockerExec')(sender, dockerExec)
    assertAlive(() => new UserError(i18n().terminal.errors.reloadedBeforeContainer))
    return { file: exec.file, args: exec.args, env: buildTerminalEnv(exec.env, {}) }
  }
  const settings = getEffectiveSettings(sender)
  const resolved = resolveTerminal(requested, settings, process.platform, process.env.SHELL)
  const launch = { file: resolved.file, args: resolved.args, env: buildTerminalEnv(process.env, resolved.env) }
  const integration = settings['terminal.colorPrompt'] ? await installShellIntegration() : null
  return integration === null ? launch : withShellIntegration(launch, process.platform, integration)
}

export async function createTerminal(sender: WebContents, rawOptions: unknown): Promise<{ id: string; title: string }> {
  const options = parseCreateOptions(rawOptions)
  const { cwd, dockerExec, claudeLogin } = options
  const id = randomUUID()
  const plan = await planLaunch(sender, options)
  const { file, args, env } = plan
  const initialCwd = plan.cwd ?? (cwd && isAbsolute(cwd) ? cwd : homedir())

  let term: pty.IPty
  try {
    term = pty.spawn(file, args, { name: 'xterm-256color', cols: 80, rows: 24, cwd: initialCwd, env })
  } catch (err) {
    plan.onSpawned?.(null)
    const errors = i18n().terminal.errors
    const detail = (err as Error).message
    throw new UserError(
      options.debugRun !== null
        ? i18n().debug.errors.runSpawn(file, detail)
        : claudeLogin
          ? errors.spawnFailedClaude(file, detail)
          : dockerExec !== null
            ? errors.spawnFailedDocker(file, detail)
            : errors.spawnFailedShell(file, detail),
      { cause: err }
    )
  }
  const t: Terminal = { term, initialCwd, listeners: [] }
  terminals.add(sender, id, t)
  plan.onSpawned?.(term.pid)

  const readTitle = (): string => {
    try {
      return normalizeProcessTitle(term.process)
    } catch {
      return ''
    }
  }
  const title = readTitle() || normalizeProcessTitle(file)
  let lastTitle = title
  let lastCheck = 0
  const checkTitle = (): void => {
    t.titleTimer = undefined
    lastCheck = Date.now()
    if (terminals.get(sender, id) !== t || sender.isDestroyed()) return
    const next = readTitle()
    if (next && next !== lastTitle) {
      lastTitle = next
      send(sender, 'terminal:title', id, next)
    }
  }
  // Throttle with a trailing check: an `htop` that exits back to the prompt is caught by the last scheduled read.
  const scheduleTitle = (): void => {
    if (t.titleTimer) return
    t.titleTimer = setTimeout(checkTitle, Math.max(0, TITLE_THROTTLE_MS - (Date.now() - lastCheck)))
  }

  const output = new TerminalOutput({
    send: (data) => send(sender, 'terminal:data', id, data),
    pause: () => term.pause(),
    resume: () => term.resume(),
    canPause: () => isActiveView(sender),
    interval: () => (isActiveView(sender) ? OUTPUT_ACTIVE_MS : OUTPUT_INACTIVE_MS)
  })
  t.output = output
  t.listeners.push(
    term.onData((data) => {
      output.push(data)
      scheduleTitle()
    }),
    term.onExit(({ exitCode }) => {
      // The tail of the output arrives before the exit notice.
      output.flush()
      terminals.delete(sender, id)
      disposeTerminal(t)
      send(sender, 'terminal:exit', id, exitCode)
    })
  )

  return { id, title }
}

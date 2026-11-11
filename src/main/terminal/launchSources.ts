import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import { createLog } from '../log'
import { UserError } from '../errors'

const log = createLog('terminal')

interface LaunchCommand {
  file: string
  args: string[]
  env: Record<string, string>
  /** Its own initial folder (wins over the one requested by the renderer). */
  cwd?: string
  /** Notified with the pid of the pty process (or `null` if it did not start). */
  onSpawned?: (pid: number | null) => void
}

/** Commands a pty runs instead of the shell; each domain registers its own, the terminal imports no domain. */
interface LaunchSources {
  claudeLogin: (wc: WebContents) => Promise<LaunchCommand>
  dockerExec: (wc: WebContents, ref: string) => Promise<LaunchCommand>
  debugRun: (wc: WebContents, ticket: string) => Promise<LaunchCommand>
}

const sources: Partial<LaunchSources> = {}

export function registerTerminalSource<K extends keyof LaunchSources>(kind: K, source: LaunchSources[K]): void {
  sources[kind] = source
}

export function terminalSource<K extends keyof LaunchSources>(kind: K): LaunchSources[K] {
  const source = sources[kind]
  if (!source) {
    log.error(`terminal source not registered: ${kind}`)
    throw new UserError(t().terminal.errors.sourceUnavailable)
  }
  return source
}

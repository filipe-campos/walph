import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import { buildChildEnv } from '../env/childEnv'
import { resolveExecutable } from '../env/executable'
import { effectivePath } from '../env/loginShell'
import { UserError } from '../errors'
import { createFileExclusive } from '../fs/atomicWrite'
import { getEffectiveSettings } from '../settings/state'
import { createViewRegistry } from '../window/viewResources'
import { send } from '../window/send'
import { getWindowRoot } from '../window/windows'
import type { ResolvedAdapter } from './adapters'
import { DebugManager } from './manager'
import { startAdapter, type AdapterLaunch } from './transport'

// One manager per view: sessions, adapters and breakpoints belong to it. Each reload creates a new one on the same wc.
const CURRENT = 'current'
const managers = createViewRegistry<DebugManager>({
  key: 'debug',
  dispose: (manager) => manager.dispose(),
  disposeSync: (all) => {
    for (const manager of all) manager.killAll()
  }
})

const executableMessages = {
  notFound: (value: string) => t().debug.errors.executableNotFound(value),
  windowsScript: (file: string) => t().debug.errors.scriptNotExecutable(file)
}

async function resolveLaunch(adapter: ResolvedAdapter, cwd: string): Promise<AdapterLaunch> {
  const pathVar = await effectivePath()
  const file = resolveExecutable(adapter.command, pathVar, { messages: executableMessages })
  return { adapter, file, env: buildChildEnv(process.env, adapter.env, pathVar), cwd }
}

export function debugManagerOf(wc: WebContents): DebugManager | undefined {
  return managers.get(wc, CURRENT)
}

export function ensureDebugManager(wc: WebContents): DebugManager {
  const existing = debugManagerOf(wc)
  if (existing) return existing
  const manager = new DebugManager({
    getRoot: () => getWindowRoot(wc),
    getAdapters: () => getEffectiveSettings(wc)['debug.adapters'],
    emit: (event) => send(wc, 'debug:event', event),
    resolveLaunch,
    startAdapter,
    createFile: (path, text) => createFileExclusive(path, text)
  })
  managers.add(wc, CURRENT, manager)
  return manager
}

/** The view's pending `runInTerminal` command (single-use ticket), for the terminal to open instead of the shell. */
export async function debugRunCommand(wc: WebContents, ticket: string) {
  const request = debugManagerOf(wc)?.takeRunTicket(ticket)
  if (!request) throw new UserError(t().debug.errors.ticketExpired)
  try {
    // Login shell PATH: in the app opened from Finder the process PATH does not find `python3`/`node`.
    const pathVar = await effectivePath()
    return {
      file: request.file,
      args: request.args,
      env: buildChildEnv(process.env, request.env, pathVar),
      cwd: request.cwd,
      onSpawned: request.settle
    }
  } catch (err) {
    request.settle(null)
    throw err
  }
}

/** `will-quit`: kills the adapters of every view (`killAllSpawnedGroups` also catches them later). */
export function killAllDebug(): void {
  managers.disposeAllSync()
}

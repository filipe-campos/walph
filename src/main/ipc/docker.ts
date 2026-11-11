import { registerTerminalSource } from '../terminal/launchSources'
import type { DockerList } from '@shared/types'
import {
  composeAction,
  composeUpWorkspace,
  containerAction,
  info,
  inspectOf,
  investigationPrompt
} from '../docker/commands'
import { findComposeFile } from '../docker/compose'
import { dockerExecCommand } from '../docker/exec'
import { PS_BACKGROUND_MAX_AGE_MS, PS_MAX_AGE_MS, fetchPs, publicContainer } from '../docker/ps'
import { hasRunningCommand } from '../docker/run'
import { followLogs, startStats } from '../docker/streams'
import { stopLogsOf, stopStatsOf } from '../docker/viewState'
import { parseListOptions } from '../docker/validate'
import { getSenderRoot } from '../window/windows'
import { registerEvictionGuard } from '../window/evictionGuards'
import { handle, on } from './typed'

export function registerDockerHandlers(): void {
  registerTerminalSource('dockerExec', dockerExecCommand)
  // A running command (compose up, action, inspect…) belongs to the view: hibernating would cancel it midway.
  registerEvictionGuard('docker', (wc) => (hasRunningCommand(wc) ? 'dockerCommand' : null))
  handle('docker:info', (e) => info(e.sender))

  handle('docker:list', async (e, options?: unknown): Promise<DockerList> => {
    const { background } = parseListOptions(options)
    const [ps, workspaceComposeFile] = await Promise.all([
      fetchPs(e.sender, background ? PS_BACKGROUND_MAX_AGE_MS : PS_MAX_AGE_MS),
      findComposeFile(getSenderRoot(e.sender))
    ])
    return { containers: ps.map(publicContainer), workspaceComposeFile }
  })

  on('docker:startStats', (e) => startStats(e.sender))
  on('docker:stopStats', (e) => stopStatsOf(e.sender))

  handle('docker:followLogs', (e, ref: unknown) => followLogs(e.sender, ref))
  on('docker:stopLogs', (e) => stopLogsOf(e.sender))

  handle('docker:action', (e, ref: unknown, action: unknown) => containerAction(e.sender, ref, action))
  handle('docker:composeAction', (e, project: unknown, action: unknown) => composeAction(e.sender, project, action))
  handle('docker:composeUpWorkspace', (e) => composeUpWorkspace(e.sender))
  handle('docker:inspect', (e, ref: unknown) => inspectOf(e.sender, ref))
  handle('docker:investigationPrompt', (e, ref: unknown) => investigationPrompt(e.sender, ref))
}

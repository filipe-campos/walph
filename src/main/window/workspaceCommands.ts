import type { WebContents } from 'electron'
import type { CommandId } from '@shared/commands'
import { requestCloseWorkspace, isViewResponsive } from './closeController'
import { activateWorkspace, workspaceOf, type Host } from './windows'

/**
 * `workspace.select1..9/next/previous/close` without going through the renderer. `false` if the command is not one of
 * them.
 */
export function runWorkspaceCommandInMain(host: Host, command: CommandId): boolean {
  const list = host.workspaces
  const index = list.findIndex((w) => w.id === host.activeId)
  const select = /^workspace\.select([1-9])$/.exec(command)
  if (select) {
    const target = list[Number(select[1]) - 1]
    if (target) activateWorkspace(target)
  } else if (command === 'workspace.next' || command === 'workspace.previous') {
    const step = command === 'workspace.next' ? 1 : -1
    const target = list[(index + step + list.length) % list.length]
    if (target) activateWorkspace(target)
  } else if (command === 'workspace.close') {
    const active = list[index]
    if (active && !(list.length === 1 && active.root === null)) void requestCloseWorkspace(active)
  } else return false
  return true
}

/**
 * Shortcut with the active view hung: main handles the workspace commands (the bar would not respond). `true` =
 * handled.
 */
export function runWorkspaceCommandWhenUnresponsive(wc: WebContents, id: CommandId): boolean {
  const ws = workspaceOf(wc)
  return !!ws && ws.host.activeId === ws.id && !isViewResponsive(wc) && runWorkspaceCommandInMain(ws.host, id)
}

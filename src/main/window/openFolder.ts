// Opening a folder as a workspace: reuses the owner (from any window), the active empty view, or creates a tab/window.

import { dialog } from 'electron'
import type { CommandId } from '@shared/commands'
import { classifyFolder, folderErrorMessage } from '../fs/folderState'
import { pickFolder } from './nativeUi'
import { removeRecentFolder } from '../recent/store'
import { send } from './send'
import { claimEmptyView, deliverOpenRequest, isViewReady, queueCommand, queueStartRequest } from './viewDelivery'
import { hibernationInFlight } from './viewClose'
import {
  activeContents,
  activeWorkspace,
  findWorkspaceByRoot,
  liveContents,
  targetHost,
  type Host,
  type Workspace
} from './windowState'
import { activateWorkspace, addWorkspace, createWindow, focusWindow, focusWorkspace, setWindowRoot } from './windows'

/**
 * Opens a folder as a workspace: if some workspace (from any window, dormant or not) already has it, activates it and
 * focuses its window; if the window's active one is an empty view, the folder opens in it; otherwise it becomes a new
 * active workspace. `false` if the folder was already open.
 */
export function openFolderAsWorkspace(root: string, preferred?: Host | null): boolean {
  return openFolder(root, preferred).opened
}

/**
 * Like `openFolderAsWorkspace`, also returning the workspace that now has (or already had) the folder. Opening several
 * folders in a row gives one tab per folder: the empty view is reused only by the first (`claimEmptyView` marks it
 * until
 * the folder is assigned), the following ones become new tabs and the last one stays active.
 */
function openFolder(root: string, preferred?: Host | null): { ws: Workspace; opened: boolean } {
  const owner = findWorkspaceByRoot(root)
  if (owner) {
    focusWorkspace(owner)
    return { ws: owner, opened: false }
  }
  const host = preferred ?? targetHost()
  if (!host) {
    return { ws: activeWorkspace(createWindow({ root })), opened: true }
  }
  const active = activeWorkspace(host)
  const wc = liveContents(active)
  let ws: Workspace
  if (active.root === null && wc && claimEmptyView(wc)) {
    // The empty view is reused. Ready: the renderer opens the folder and `workspace:open` assigns it (or releases it on
    // failure). Still starting: it reads the folder in `workspace:current`, so the assignment must happen right away.
    if (isViewReady(wc)) send(wc, 'workspace:openRequested', root)
    else setWindowRoot(wc, root)
    ws = active
  } else {
    ws = addWorkspace(host, root)
    activateWorkspace(ws)
  }
  focusWindow(host.win)
  return { ws, opened: true }
}

/**
 * "Start with Claude": opens the folder like `openFolderAsWorkspace` (already open = activates the owner) and delivers
 * `claude:startRequested` to its view as soon as it is in the folder, with `workspace:open` done.
 */
export async function openFolderWithPrompt(root: string, prompt: string, preferred?: Host | null): Promise<boolean> {
  const { ws } = openFolder(root, preferred)
  // Owner hibernating: waits for the old view to go and ensures activation (creates the new view) before queueing the
  // request.
  const unloading = hibernationInFlight(ws)
  if (unloading) {
    await unloading
    if (!liveContents(ws)) activateWorkspace(ws)
  }
  const wc = liveContents(ws)
  // Owner with its window closing: no view to receive the request, and the caller must not report success.
  if (!wc) return false
  queueStartRequest(wc, { root, prompt })
  return true
}

/**
 * Folder forwarded by another instance (`walph .`): opens as a workspace in the target window (or creates the window).
 * `false` if the path is not a folder (the caller reports it).
 */
export async function openForwardedFolder(folder: string): Promise<boolean> {
  if ((await classifyFolder(folder)).state !== 'dir') return false
  openFolderAsWorkspace(folder, targetHost())
  return true
}

/**
 * Opening a folder from the native menu (Open Recent): activates the workspace that already has it; otherwise asks the
 * focused window to open it in the active workspace (it asks about unsaved files); without any window (macOS), creates
 * one with the folder.
 */
export async function openFolderFromMenu(root: string): Promise<void> {
  const owner = findWorkspaceByRoot(root)
  if (owner) return focusWorkspace(owner)
  const target = targetHost()
  const wc = target && activeContents(target)
  if (target && wc) {
    deliverOpenRequest(wc, root)
    return focusWindow(target.win)
  }
  const check = await classifyFolder(root)
  if (check.state !== 'dir') {
    if (check.state === 'missing') removeRecentFolder(root)
    dialog.showErrorBox('Walph', folderErrorMessage(root, check))
    return
  }
  // During the `await` another window may have opened the folder or the last one may have closed: decides again.
  const ownerNow = findWorkspaceByRoot(root)
  if (ownerNow) return focusWorkspace(ownerNow)
  createWindow({ root })
}

/**
 * macOS without a focused window (⌘O): the dialog has no parent and the chosen folder opens in a new window (or
 * activates its owner).
 */
export async function openFolderWithoutWindow(): Promise<void> {
  const root = await pickFolder(null)
  if (!root) return
  const check = await classifyFolder(root)
  if (check.state !== 'dir') {
    dialog.showErrorBox('Walph', folderErrorMessage(root, check))
    return
  }
  createWindow({ root })
}

/**
 * Creates an empty window and delivers the command when the renderer is ready. The ready signal is the first call to
 * `workspace:current`: the renderer only makes it after subscribing to `app:command` (`did-finish-load` comes before
 * React).
 */
export function runCommandInNewWindow(command: CommandId): void {
  const host = createWindow({ root: null })
  const wc = activeContents(host)
  if (wc) queueCommand(wc, command)
}

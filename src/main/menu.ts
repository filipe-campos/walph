import { app, dialog, Menu } from 'electron'
import { homedir } from 'node:os'
import type { CommandId } from '@shared/commands'
import { getBindings } from './keybindings/effective'
import { defaultBindings } from './keybindings/userKeybindings'
import { buildTemplate, MENU_RECENT_LIMIT } from './menu/template'
import { clearRecent, getRecent } from './recent/store'
import { isViewResponsive } from './window/closeController'
import { activeContents, createWindow, focusedHost, focusWindow, targetHost } from './window/windows'
import { openFolderFromMenu, openFolderWithoutWindow, runCommandInNewWindow } from './window/openFolder'
import { deliverCommand } from './window/viewDelivery'
import { runWorkspaceCommandInMain } from './window/workspaceCommands'

function sendCommand(command: CommandId): void {
  // The command goes to the ACTIVE view of the focused window (the window's other views are hidden).
  const focused = focusedHost()
  const wc = focused && activeContents(focused)
  if (focused && wc) {
    // Dead or hung active view = no WorkspaceBar to handle the workspace commands: main runs them.
    if (!isViewResponsive(wc) && runWorkspaceCommandInMain(focused, command)) return
    deliverCommand(wc, command)
    return
  }
  // macOS with no focused window: the menu stays active and these commands do not depend on an open renderer.
  if (command === 'workbench.newWindow') createWindow({ root: null })
  else if (command === 'workbench.clearRecent') clearRecent()
  else if (command === 'workbench.openFolder' || command === 'workspace.add') void openFolderWithoutWindow()
  else if (command === 'workbench.openRecent' || command === 'git.clone') {
    // Windows exist but none is focused (macOS): use the target; only create a new one when there is none.
    const target = targetHost()
    const targetWc = target && activeContents(target)
    if (target && targetWc) {
      focusWindow(target.win)
      deliverCommand(targetWc, command)
    } else runCommandInNewWindow(command)
  }
}

const recentPaths = (): string[] => getRecent().map((f) => f.path)

/** Builds the menu with the effective shortcuts (default ← `keybindings.json`). Rebuilt whenever the file changes. */
export function buildMenu(): void {
  recentSignature = currentRecentSignature()
  const { template } = buildTemplate({
    platform: process.platform,
    isPackaged: app.isPackaged,
    appName: app.name,
    home: homedir(),
    bindings: getBindings(),
    defaults: defaultBindings(process.platform),
    recent: recentPaths(),
    actions: {
      sendCommand,
      openRecent: (path) =>
        void openFolderFromMenu(path).catch((err: unknown) =>
          dialog.showErrorBox('Walph', err instanceof Error ? err.message : String(err))
        ),
      quit: () => app.quit(),
      reloadActiveView() {
        const focused = focusedHost()
        const wc = focused && activeContents(focused)
        if (wc && !app.isPackaged) wc.reload()
      }
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Signature of what the menu shows from the recents list (the first paths); `lastOpened`/branch do not appear.
let recentSignature: string | null = null
const currentRecentSignature = (): string => recentPaths().slice(0, MENU_RECENT_LIMIT).join('\0')

/**
 * Rebuilds the menu only if the visible part of the recents changed (opening/updating a branch neither reorders nor
 * changes the menu).
 */
export function rebuildMenuIfRecentChanged(): void {
  if (recentSignature === currentRecentSignature()) return
  buildMenu()
}

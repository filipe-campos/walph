import { app } from 'electron'
import { t } from '@shared/i18n'
import { send } from './send'
import { createCloseCoordinator } from './closeCoordinator'
import { registerEvictionGuard } from './evictionGuards'
import { hiddenWindows } from './hiddenMode'
import { confirmDestructive } from './nativeUi'
import {
  activateWorkspace,
  activeWorkspace,
  allHosts,
  destroyWorkspace,
  flushAllHosts,
  flushHost,
  focusedHost,
  freezeWindowsFile,
  hostContents,
  liveContents,
  onWorkspaceEvent,
  saveWindowsNow,
  workspaceOf
} from './windows'

const coordinator = createCloseCoordinator({
  liveContents,
  workspaceOf,
  activeWorkspace,
  hostContents,
  allHosts,
  focusedHost,
  present(ws) {
    const { host } = ws
    // Silent activation: the user only needs to see the question, they did not "read" the workspace.
    activateWorkspace(ws, undefined, true)
    // Window hidden behind others or minimized: the renderer dialog must show up.
    if (!hiddenWindows && !host.win.isDestroyed()) {
      if (host.win.isMinimized()) host.win.restore()
      host.win.show()
    }
  },
  sendCloseRequested: (wc) => send(wc, 'window:closeRequested'),
  sendCloseAborted: (wc) => send(wc, 'window:closeAborted'),
  confirmForceClose: (wc) =>
    confirmDestructive(wc, {
      message: t().app.dialogs.notResponding,
      detail: t().app.dialogs.notRespondingDetail,
      confirmLabel: t().app.dialogs.forceClose,
      cancelLabel: t().app.dialogs.wait
    }),
  destroyWorkspace: (ws) => destroyWorkspace(ws),
  quit: () => app.quit(),
  flushHost,
  flushAllHosts,
  saveWindowsNow,
  freezeWindowsFile,
  setDocumentEdited(host, edited) {
    if (process.platform === 'darwin' && !host.win.isDestroyed()) host.win.setDocumentEdited(edited)
  }
})

export const { requestCloseWorkspace, onQuitCancelled, isViewResponsive, setDirty, confirmClose, cancelClose } =
  coordinator

export function installCloseCoordinator(): void {
  // Hibernating unloads the view: it cannot have a dirty file, a close in progress, or a dead or hung renderer.
  registerEvictionGuard('window', coordinator.evictionReason)
  onWorkspaceEvent((event) => {
    if (event.type === 'hostCreated') coordinator.attachHost(event.host)
    else if (event.type === 'viewCreated') coordinator.attachView(event.ws)
  })
  app.on('before-quit', (e) => coordinator.beforeQuit(() => e.preventDefault()))
}

import { app, shell } from 'electron'
import type { WindowAction } from '@shared/commands'
import { setContext } from '../keybindings/context'
import { cancelClose, confirmClose, installCloseCoordinator, setDirty } from '../window/closeController'
import { externalUrl } from '../window/externalUrl'
import { hiddenWindows } from '../window/hiddenMode'
import { hostOf } from '../window/windows'
import { on } from './typed'

// Exhaustive Record: a new WindowAction without an entry here does not compile (instead of being silently dropped).
const ACTIONS: Record<WindowAction, true> = {
  newWindow: true,
  closeWindow: true,
  quit: true,
  reload: true,
  toggleDevTools: true,
  resetZoom: true,
  zoomIn: true,
  zoomOut: true,
  toggleFullScreen: true
}

// Same step as Electron's native roles (zoomIn/zoomOut change the level by 0.5).
const ZOOM_STEP = 0.5

function isWindowAction(value: unknown): value is WindowAction {
  return typeof value === 'string' && Object.hasOwn(ACTIONS, value)
}

export function registerWindowHandlers(handlers: { newWindow: () => void }): void {
  installCloseCoordinator()

  on('window:openExternal', (_e, url: unknown) => {
    const safe = externalUrl(url)
    if (safe && !hiddenWindows) void shell.openExternal(safe)
  })

  on('window:setDirty', (event, dirty: unknown) => {
    if (typeof dirty === 'boolean') setDirty(event.sender, dirty)
  })

  on('window:confirmClose', (event) => confirmClose(event.sender))

  on('window:cancelClose', (event) => cancelClose(event.sender))

  // Context for shortcuts with `when` (e.g. `terminalFocus`). Renderer input: invalid keys/values are ignored.
  on('window:setContext', (event, key: unknown, value: unknown) => {
    setContext(event.sender, key, value)
  })

  on('window:action', (event, action: unknown) => {
    // The renderer is untrusted: unknown actions are ignored.
    if (!isWindowAction(action)) return
    if (action === 'newWindow') return handlers.newWindow()
    const host = hostOf(event.sender)
    if (!host) return
    const wc = event.sender
    const win = host.win

    switch (action) {
      case 'closeWindow':
        win.close()
        break
      case 'quit':
        app.quit()
        break
      case 'reload':
        if (!app.isPackaged) wc.reload()
        break
      case 'toggleDevTools':
        if (!app.isPackaged) wc.toggleDevTools()
        break
      case 'resetZoom':
        wc.setZoomLevel(0)
        break
      case 'zoomIn':
        wc.setZoomLevel(wc.getZoomLevel() + ZOOM_STEP)
        break
      case 'zoomOut':
        wc.setZoomLevel(wc.getZoomLevel() - ZOOM_STEP)
        break
      case 'toggleFullScreen':
        win.setFullScreen(!win.isFullScreen())
        break
    }
  })
}

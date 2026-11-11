// Workspace views inside a window: each workspace is a WebContentsView that fills the whole content area of the
// host window (BaseWindow, without its own webContents). Only the active one is visible. This module is a leaf: it
// creates, positions and maps `webContents → window`; `windows.ts` decides which workspaces exist.

import { app, shell, WebContentsView, type BaseWindow, type WebContents } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getLocale } from '@shared/i18n'
import { APP_INDEX_URL, usesAppProtocol } from './appProtocol'
import { externalUrl } from './externalUrl'
import { hiddenWindows } from './hiddenMode'
import { trustSender } from './trustedSenders'
import { onViewDestroyed } from './viewLifecycle'

// View webContents → host window. Survives `destroyed` only until the event (afterwards the window no longer matters).
const hostWindows = new Map<WebContents, BaseWindow>()

/** The host window of a view (replaces `BrowserWindow.fromWebContents`, which does not see views). */
export function windowOf(wc: WebContents): BaseWindow | null {
  const win = hostWindows.get(wc)
  return win && !win.isDestroyed() ? win : null
}

/** All webContents of live workspaces, from all windows (broadcast of global events). */
export function allViewContents(): WebContents[] {
  return [...hostWindows.keys()].filter((wc) => !wc.isDestroyed())
}

/**
 * Creates the view (not loading anything yet), already added to the window, invisible and sized to the content area.
 */
export function createWorkspaceView(win: BaseWindow): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No spellchecker: it would load the dictionary in each view and the editor does not need it.
      spellcheck: false,
      // The sandboxed preload sees neither `app.isPackaged` nor `os`; it gets them through argv.
      additionalArguments: [
        ...(app.isPackaged ? ['--walph-packaged'] : []),
        `--walph-home=${homedir()}`,
        `--walph-locale=${getLocale()}`
      ],
      // Test mode only: a hidden window would pause requestAnimationFrame (CodeMirror measuring, xterm fit).
      // Outside it the hidden view is throttled on purpose (memory/CPU of inactive workspaces).
      backgroundThrottling: !hiddenWindows
    }
  })
  view.setBackgroundColor('#1e1e1e')
  view.setVisible(false)
  win.contentView.addChildView(view)
  fit(win, view)

  const wc = view.webContents
  hostWindows.set(wc, win)
  trustSender(wc)
  onViewDestroyed(wc, 'host-window', () => hostWindows.delete(wc))

  // The UI is an SPA: any navigation (e.g. dropping a file outside the editor would open file://…) would reload the
  // page
  // with the preload exposed to arbitrary HTML and lose unsaved work. Reloading (`reload()`) does not go through here.
  const blockNavigation = (e: Electron.Event, url: string): void => {
    // In dev the Vite client reloads with `location.reload()` (HMR full reload): same URL, let it through.
    if (!app.isPackaged && url === wc.getURL()) return
    e.preventDefault()
  }
  wc.on('will-navigate', (e) => blockNavigation(e, e.url))
  wc.on('will-frame-navigate', (e) => blockNavigation(e, e.url))

  // External links open in the browser, never inside the IDE.
  wc.setWindowOpenHandler(({ url }) => {
    const safe = externalUrl(url)
    if (safe) void shell.openExternal(safe)
    return { action: 'deny' }
  })
  return view
}

export function loadRenderer(wc: WebContents): void {
  if (!usesAppProtocol()) {
    void wc.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    // `app://walph/` (see `appProtocol.ts`): unlike `file://`, it gets the V8 code cache.
    void wc.loadURL(APP_INDEX_URL)
  }
}

function fit(win: BaseWindow, view: WebContentsView): void {
  const { width, height } = win.contentView.getBounds()
  view.setBounds({ x: 0, y: 0, width, height })
}

/**
 * Only `active` stays visible; if the window has focus, keyboard focus goes to it. The hidden ones do not follow the
 * window resize: the view is adjusted here, right before it appears.
 */
export function showOnly(
  win: BaseWindow,
  views: Iterable<WebContentsView>,
  active: WebContentsView | null,
  focus: boolean
): void {
  for (const view of views) {
    if (view !== active && !view.webContents.isDestroyed()) view.setVisible(false)
  }
  if (active && !active.webContents.isDestroyed()) {
    if (!win.isDestroyed()) fit(win, active)
    active.setVisible(true)
    if (focus) active.webContents.focus()
  }
}

/** Keeps the layout and focus of the active view when the window resizes or regains focus. */
export function installWindowBehavior(win: BaseWindow, active: () => WebContentsView | null): void {
  // Only the visible view is resized (N setBounds per resize pixel were heavy); the others adjust when they appear.
  const relayout = (): void => {
    const view = active()
    if (view && !view.webContents.isDestroyed() && !win.isDestroyed()) fit(win, view)
  }
  win.on('resize', relayout)
  win.on('maximize', relayout)
  win.on('unmaximize', relayout)
  win.on('restore', relayout)
  win.on('enter-full-screen', relayout)
  win.on('leave-full-screen', relayout)
  // Clicking the title bar/returning to the window leaves focus nowhere: gives it back to the active view.
  win.on('focus', () => {
    const view = active()
    if (view && !view.webContents.isDestroyed()) view.webContents.focus()
  })
}

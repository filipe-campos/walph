// Windows and workspaces. Each window is a `BaseWindow` (without its own webContents) that holds a list of
// workspaces; each workspace is a `WebContentsView` with the whole renderer, so everything main keeps per
// `webContents` (watcher, ptys, LSP, Claude, session…) holds per workspace.
// Restored workspaces stay dormant (no view) until their first activation.
//
// This file has the lifecycle (create/activate/move/destroy) and is the entry point for the queries and for what lives
// in the modules below (`windowState`, `viewDelivery`, `viewClose`, `windowsPersistence`). Opening a folder and
// restoring live in `openFolder.ts` and `restoreWindows.ts`, which depend on this one.

import { BaseWindow, screen, type WebContents, type WebContentsView } from 'electron'
import type { ClaudeConversationId, WorkspaceId } from '@shared/types'
import { hiddenWindows } from './hiddenMode'
import { windowIcon } from './appIcon'
import { isVisibleOnSomeDisplay, type SavedBounds, type SavedWorkspace } from './windowsFile'
import { createWorkspaceView, installWindowBehavior, loadRenderer, showOnly, windowOf } from './workspaceViews'
import { revealWhenReady } from './revealWhenReady'
import { folderChanged, releaseEmptyView, sendWhenReady, viewNavigated } from './viewDelivery'
import { closeContents, hibernationInFlight } from './viewClose'
import { scheduleSave, saveWindowsNow } from './windowsPersistence'
import {
  activeWorkspace,
  bindContents,
  emit,
  findWorkspaceByRoot,
  liveContents,
  notifyRootChange,
  registerHost,
  rememberRoot,
  targetHost,
  unbindContents,
  unregisterHost,
  workspaceOf,
  type Host,
  type Workspace
} from './windowState'
import { onViewDestroyed } from './viewLifecycle'

export type { Host, Workspace } from './windowState'
export {
  activeContents,
  activeWorkspace,
  allHosts,
  findWorkspaceByRoot,
  focusedHost,
  getSenderRoot,
  getWindowRoot,
  hostContents,
  hostOf,
  isDormant,
  lastFolderList,
  liveContents,
  onWindowRootChange,
  onWorkspaceEvent,
  targetHost,
  workspaceOf
} from './windowState'
export { dropQueuedStart, flushQueuedCommand, markFolderOpened } from './viewDelivery'
export { flushAllHosts, flushHost, hibernateWorkspace } from './viewClose'
export { freezeWindowsFile, isQuitFrozen, saveWindowsNow } from './windowsPersistence'
export { windowOf }

export interface WindowOptions {
  /** Shortcut for a window with a single workspace. Already counts as open for `findWorkspaceByRoot`. */
  root?: string | null
  workspaces?: SavedWorkspace[]
  /** Index of the active one in `workspaces`. */
  active?: number
  bounds?: SavedBounds | null
  maximized?: boolean
}

const CASCADE_OFFSET = 26
// Traffic light position on macOS: the WorkspaceBar is 66px and the buttons ~12px (y = (66 - 12) / 2; the stack is
// ~52px wide).
const TRAFFIC_LIGHT_POSITION = { x: 14, y: 27 }

let nextId = 1

const workAreas = (): SavedBounds[] => screen.getAllDisplays().map((d) => d.workArea)

// ---------------------------------------------------------------- workspace state

/** `false` if the webContents is not a workspace of the app. */
export function setWindowRoot(wc: WebContents, root: string | null): boolean {
  const ws = workspaceOf(wc)
  if (!ws) return false
  const previous = ws.root
  const changed = previous !== root
  ws.root = root
  if (changed) {
    ws.branch = null
    folderChanged(wc, previous, root)
    notifyRootChange(wc, root)
  }
  rememberRoot(wc, root)
  if (root !== null) releaseEmptyView(wc)
  if (changed) {
    scheduleSave()
    emit({ type: 'changed', host: ws.host })
  }
  return true
}

export function setBranch(ws: Workspace, branch: string | null): void {
  if (ws.branch === branch) return
  ws.branch = branch
  scheduleSave()
  emit({ type: 'changed', host: ws.host })
}

/** Mutes/unmutes the workspace notifications; the tab still shows status and unread. */
export function setMuted(ws: Workspace, muted: boolean): void {
  if (ws.muted === muted) return
  ws.muted = muted
  scheduleSave()
  emit({ type: 'changed', host: ws.host })
}

// ---------------------------------------------------------------- views

/** Creates the workspace view (if dormant) and starts loading the renderer. */
function ensureView(ws: Workspace): WebContentsView {
  if (ws.view && !ws.view.webContents.isDestroyed()) return ws.view
  const { host } = ws
  const view = createWorkspaceView(host.win)
  const wc = view.webContents
  ws.view = view
  bindContents(wc, ws)

  wc.on('did-navigate', () => viewNavigated(wc))
  wc.on('page-title-updated', (_e, title) => {
    if (host.activeId === ws.id && !host.win.isDestroyed()) host.win.setTitle(title)
  })
  onViewDestroyed(wc, 'workspace-view', () => {
    // Only detaches the view; the list does not change (the window is closing or the workspace already left it).
    unbindContents(wc, ws)
    if (ws.view === view) ws.view = null
    if (!host.closing && host.workspaces.includes(ws)) emit({ type: 'changed', host })
  })
  emit({ type: 'viewCreated', ws })
  loadRenderer(wc)
  return view
}

// Activation that created the view: the previous one stays visible until the new one loads (otherwise a blank screen
// shows).
const pendingReveal = new WeakMap<Host, { ws: Workspace; from: WebContentsView; cancel: () => void }>()

function visibleView(host: Host): WebContentsView | null {
  const from = pendingReveal.get(host)?.from
  return from && !from.webContents.isDestroyed() ? from : activeWorkspace(host).view
}

function cancelPendingReveal(host: Host): void {
  pendingReveal.get(host)?.cancel()
  pendingReveal.delete(host)
}

function relayoutViews(host: Host): void {
  showOnly(
    host.win,
    host.workspaces.map((w) => w.view).filter((v): v is WebContentsView => v !== null),
    visibleView(host),
    host.win.isFocused()
  )
}

// ---------------------------------------------------------------- operations

// Sequence of activation requests per window: a deferred activation (workspace still hibernating) only holds if no
// newer request arrived (clicking A, which is unloading, and then B must not let A steal the activation).
const activationSeq = new WeakMap<Host, number>()

export function activateWorkspace(ws: Workspace, reveal?: ClaudeConversationId, silent = false): void {
  const { host } = ws
  if (host.closing || !host.workspaces.includes(ws)) return
  const seq = (activationSeq.get(host) ?? 0) + 1
  activationSeq.set(host, seq)
  // Still unloading to hibernate: waits for `destroyed` and only then creates the new view.
  const unloading = hibernationInFlight(ws)
  if (unloading) {
    void unloading.then(() => {
      if (activationSeq.get(host) === seq) activateNow(ws, reveal, silent)
    })
    return
  }
  activateNow(ws, reveal, silent)
}

function activateNow(ws: Workspace, reveal: ClaudeConversationId | undefined, silent: boolean): void {
  const { host } = ws
  if (host.closing || !host.workspaces.includes(ws)) return
  // Before cancelling and without the `activeWorkspace` fallback: the view actually on screen (the active one may have
  // left).
  const pending = pendingReveal.get(host)
  const from = pending ? pending.from : (host.workspaces.find((w) => w.id === host.activeId)?.view ?? null)
  // Reactivating the same workspace that is still loading keeps the wait in progress.
  if (pending?.ws !== ws) cancelPendingReveal(host)
  const created = !(ws.view && !ws.view.webContents.isDestroyed())
  const view = ensureView(ws)
  const now = Date.now()
  if (host.activeId !== ws.id) {
    const previous = host.workspaces.find((w) => w.id === host.activeId)
    if (previous) previous.lastActiveAt = now
  }
  ws.lastActiveAt = now
  host.activeId = ws.id
  // The view about to appear gets the new state (active, no unread) before being shown.
  emit({ type: 'activating', ws, silent })
  if (created && from && from !== view && !from.webContents.isDestroyed()) {
    const cancel = revealWhenReady(view.webContents, () => {
      pendingReveal.delete(host)
      if (!host.closing && !host.win.isDestroyed() && host.activeId === ws.id) {
        relayoutViews(host)
        if (host.win.isFocused()) view.webContents.focus()
      }
    })
    pendingReveal.set(host, { ws, from, cancel })
  }
  relayoutViews(host)
  const title = view.webContents.getTitle()
  if (title && !host.win.isDestroyed()) host.win.setTitle(title)
  scheduleSave()
  emit({ type: 'changed', host })
  emit({ type: 'activated', ws, silent })
  if (reveal) sendWhenReady(view.webContents, reveal)
}

/** Activates the workspace and brings its window to the front. */
export function focusWorkspace(ws: Workspace, reveal?: ClaudeConversationId): void {
  focusWindow(ws.host.win)
  activateWorkspace(ws, reveal)
}

/** Click on the system notification: activates the conversation's workspace and shows the session. */
export function revealSession(wc: WebContents, id: ClaudeConversationId): void {
  const ws = workspaceOf(wc)
  if (ws) focusWorkspace(ws, id)
}

function createWorkspace(host: Host, root: string | null, branch: string | null = null, muted = false): Workspace {
  const id: WorkspaceId = `w${nextId++}`
  const ws: Workspace = { id, root, branch, muted, view: null, host, lastActiveAt: Date.now() }
  host.workspaces.push(ws)
  return ws
}

/** Appends a workspace at the end of the bar (dormant). Whoever wants to see it activates it next. */
export function addWorkspace(host: Host, root: string | null, branch: string | null = null): Workspace {
  const ws = createWorkspace(host, root, branch)
  scheduleSave()
  emit({ type: 'changed', host })
  return ws
}

export function moveWorkspace(ws: Workspace, index: number): void {
  const { host } = ws
  const from = host.workspaces.indexOf(ws)
  if (from === -1) return
  const to = Math.min(Math.max(Math.trunc(index), 0), host.workspaces.length - 1)
  if (to === from) return
  host.workspaces.splice(from, 1)
  host.workspaces.splice(to, 0, ws)
  scheduleSave()
  emit({ type: 'changed', host })
}

/**
 * Removes the workspace from the window and unloads its view (the renderer saves the session on `beforeunload`; the
 * view's processes die on `destroyed`). Closing the last one leaves an empty workspace (Welcome): the window does not
 * close. No dirty file guard: the caller already decided (`ipc/window.ts`).
 */
export async function destroyWorkspace(ws: Workspace, graceful = true): Promise<void> {
  const { host } = ws
  const index = host.workspaces.indexOf(ws)
  if (index === -1 || host.closing) return
  const wc = liveContents(ws)
  const view = ws.view

  host.workspaces.splice(index, 1)
  unbindContents(wc, ws)
  emit({ type: 'removed', ws })

  if (host.workspaces.length === 0) {
    activateWorkspace(createWorkspace(host, null))
  } else if (host.activeId === ws.id) {
    const next = host.workspaces[Math.min(index, host.workspaces.length - 1)]
    if (next) activateWorkspace(next)
  } else {
    scheduleSave()
    emit({ type: 'changed', host })
  }

  if (view && pendingReveal.get(host)?.from === view) {
    // Without a relayout the new view, which was waiting for this one to leave the screen, would stay hidden until the
    // next activation.
    cancelPendingReveal(host)
    if (!host.win.isDestroyed()) relayoutViews(host)
  }
  if (view && !host.win.isDestroyed()) {
    view.setVisible(false)
    host.win.contentView.removeChildView(view)
  }
  if (wc) await closeContents(wc, graceful)
}

export function focusWindow(win: BaseWindow): void {
  if (win.isDestroyed()) return
  // In the background (tests) the window never shows; `focus()` on a hidden window does not show it.
  if (!hiddenWindows) {
    if (win.isMinimized()) win.restore()
    win.show()
  }
  win.focus()
}

// ---------------------------------------------------------------- creation

export function createWindow(options: WindowOptions): Host {
  const wanted: SavedWorkspace[] = options.workspaces ?? [{ root: options.root ?? null, branch: null }]
  // A folder never stays in two windows.
  const single = wanted.length === 1 ? (wanted[0]?.root ?? null) : null
  if (single) {
    const owner = findWorkspaceByRoot(single)
    if (owner) {
      focusWorkspace(owner)
      return owner.host
    }
  }

  let bounds = options.bounds && isVisibleOnSomeDisplay(options.bounds, workAreas()) ? options.bounds : null
  if (!bounds && !options.bounds) {
    // New window without a position: cascaded from the focused one, so it does not open exactly on top of it.
    const focused = targetHost()
    if (focused) {
      const b = focused.win.getNormalBounds()
      const shifted = { ...b, x: b.x + CASCADE_OFFSET, y: b.y + CASCADE_OFFSET }
      if (isVisibleOnSomeDisplay(shifted, workAreas())) bounds = shifted
    }
  }

  const win = new BaseWindow({
    width: bounds?.width ?? 1400,
    height: bounds?.height ?? 900,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 800,
    minHeight: 500,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'Walph',
    ...(windowIcon ? { icon: windowIcon } : {}),
    // macOS: the WorkspaceBar (renderer) acts as title bar; on Windows/Linux the native frame stays.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: TRAFFIC_LIGHT_POSITION }
      : {})
  })
  const host: Host = { win, workspaces: [], activeId: '', closing: false }
  registerHost(host)
  emit({ type: 'hostCreated', host })

  for (const w of wanted) createWorkspace(host, w.root, w.branch, w.muted === true)
  const activeIndex = Math.min(Math.max(options.active ?? 0, 0), host.workspaces.length - 1)
  const initial = host.workspaces[activeIndex]
  if (!initial) throw new Error('window without workspace')
  host.activeId = initial.id

  installWindowBehavior(win, () => visibleView(host))

  // Only the active one gets a view now; the others stay dormant.
  const first = ensureView(activeWorkspace(host))
  relayoutViews(host)
  emit({ type: 'changed', host })

  let shown = false
  const reveal = (): void => {
    if (shown) return
    shown = true
    if (hiddenWindows || win.isDestroyed()) return
    if (options.maximized) win.maximize()
    win.show()
  }
  first.webContents.once('did-finish-load', reveal)
  first.webContents.once('did-fail-load', reveal)

  win.on('move', scheduleSave)
  win.on('resize', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('closed', () => {
    unregisterHost(host)
    // Views do not die with the window: what is left (forced close) is unloaded without waiting.
    for (const ws of host.workspaces) {
      const wc = liveContents(ws)
      if (wc) wc.close()
    }
    // While quitting the closing windows do not leave the list; otherwise, only the last one stays (see
    // `saveWindowsNow`).
    saveWindowsNow()
  })

  scheduleSave()
  return host
}

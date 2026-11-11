// Shared window and workspace state: the window list, webContents → workspace, the event bus and the queries.
// A leaf on purpose: `windows.ts` and the surrounding modules import from here, never the other way around.

import { BaseWindow, type WebContents, type WebContentsView } from 'electron'
import { samePath } from '@shared/pathCompare'
import type { WorkspaceId } from '@shared/types'
import { nextRememberedFolders } from './folderMemory'
import { createEmitter } from '../util/emitter'

export interface Workspace {
  id: WorkspaceId
  root: string | null
  /** Last branch reported by the view (or saved in windows.json). */
  branch: string | null
  /** Notifications muted by the user (persisted in windows.json). */
  muted: boolean
  /** `null` = dormant (restored and never activated, or the view was already destroyed). */
  view: WebContentsView | null
  host: Host
  /** Last time it was the active workspace (ms): hibernation LRU order. */
  lastActiveAt: number
}

export interface Host {
  win: BaseWindow
  /** In tab order. */
  workspaces: Workspace[]
  activeId: WorkspaceId
  /** The window is closing: the views are being unloaded and the list no longer changes. */
  closing: boolean
}

export type WorkspaceEvent =
  | { type: 'hostCreated'; host: Host }
  | { type: 'viewCreated'; ws: Workspace }
  /** List, order, active, folder or branch changed. */
  | { type: 'changed'; host: Host }
  /** `host.activeId` is already `ws`, but the view is not shown yet: its state must be ready before it appears. */
  | { type: 'activating'; ws: Workspace; silent: boolean }
  /** `silent`: activated only to show a close question; does not count as "the user saw the workspace". */
  | { type: 'activated'; ws: Workspace; silent: boolean }
  /** Left the list (the view may still be unloading). */
  | { type: 'removed'; ws: Workspace }

// Insertion order = creation order (it is the order saved in windows.json).
const hosts: Host[] = []
const byWc = new Map<WebContents, Workspace>()
// Folder of each webContents that survives the close: the `session:save` from `beforeunload` arrives during the close.
const lastRoots = new WeakMap<WebContents, string | null>()
// Last folder list of each window that had at least one ("Open all" on the welcome screen).
const lastFolderLists = new WeakMap<Host, string[]>()
const workspaceEvents = createEmitter<[WorkspaceEvent]>('workspace')
const rootChanges = createEmitter<[WebContents, string | null]>('workspace')

// ---------------------------------------------------------------- events

/** Subscribes to window and workspace events. */
export const onWorkspaceEvent = workspaceEvents.on

function rememberFolders(host: Host): void {
  if (host.closing) return
  const roots = host.workspaces.map((w) => w.root).filter((r): r is string => r !== null)
  // Removals do not shrink the memory (see `nextRememberedFolders`).
  const next = nextRememberedFolders(lastFolderLists.get(host), roots)
  if (next.length > 0) lastFolderLists.set(host, next)
}

export function emit(event: WorkspaceEvent): void {
  if (event.type === 'changed') rememberFolders(event.host)
  workspaceEvents.emit(event)
}

/** Calls `cb` when a workspace folder changes (opening another folder or closing the current one). */
export const onWindowRootChange = rootChanges.on

export const notifyRootChange = rootChanges.emit

// ---------------------------------------------------------------- registry

export function registerHost(host: Host): void {
  hosts.push(host)
}

export function unregisterHost(host: Host): void {
  const i = hosts.indexOf(host)
  if (i !== -1) hosts.splice(i, 1)
}

/** Binds the view webContents to the owner workspace. */
export function bindContents(wc: WebContents, ws: Workspace): void {
  byWc.set(wc, ws)
  lastRoots.set(wc, ws.root)
}

/** Unbinds the webContents from the workspace, if it is still its own. */
export function unbindContents(wc: WebContents | null, ws: Workspace): void {
  if (wc && byWc.get(wc) === ws) byWc.delete(wc)
}

export function rememberRoot(wc: WebContents, root: string | null): void {
  lastRoots.set(wc, root)
}

// ---------------------------------------------------------------- queries

export function allHosts(): readonly Host[] {
  return hosts.filter((h) => !h.win.isDestroyed())
}

export function liveContents(ws: Workspace): WebContents | null {
  const wc = ws.view?.webContents
  return wc && !wc.isDestroyed() ? wc : null
}

export function workspaceOf(wc: WebContents): Workspace | null {
  return byWc.get(wc) ?? null
}

export function hostOf(wc: WebContents): Host | null {
  return byWc.get(wc)?.host ?? null
}

function hostOfWindow(win: BaseWindow | null | undefined): Host | null {
  return win ? (hosts.find((h) => h.win === win) ?? null) : null
}

export function activeWorkspace(host: Host): Workspace {
  const ws = host.workspaces.find((w) => w.id === host.activeId) ?? host.workspaces[0]
  if (!ws) throw new Error('window without workspace')
  return ws
}

/** The visible view of the window (always exists for a live window). */
export function activeContents(host: Host): WebContents | null {
  return liveContents(activeWorkspace(host))
}

/** All live webContents of a window (active or not). */
export function hostContents(host: Host): WebContents[] {
  return host.workspaces.map(liveContents).filter((wc): wc is WebContents => wc !== null)
}

export function isDormant(ws: Workspace): boolean {
  return liveContents(ws) === null
}

export function findWorkspaceByRoot(root: string, except?: Workspace | null): Workspace | null {
  for (const host of allHosts()) {
    if (host.closing) continue
    for (const ws of host.workspaces) {
      if (ws !== except && ws.root && samePath(ws.root, root)) return ws
    }
  }
  return null
}

/** The focused window, if it is one of the app's. */
export function focusedHost(): Host | null {
  return hostOfWindow(BaseWindow.getFocusedWindow())
}

/** The focused window (or, without focus, the oldest still alive). */
export function targetHost(): Host | null {
  return focusedHost() ?? allHosts()[0] ?? null
}

/** Folder of the workspace owning this webContents, or `null` (empty view or unknown webContents). */
export function getWindowRoot(wc: WebContents): string | null {
  return byWc.get(wc)?.root ?? null
}

/** Like `getWindowRoot`, but still answers while the view closes (`beforeunload` messages). */
export function getSenderRoot(wc: WebContents): string | null {
  const ws = byWc.get(wc)
  return ws ? ws.root : (lastRoots.get(wc) ?? null)
}

/**
 * Last folder list of the window that had at least one folder (in memory; in a restored window it starts from the
 * `windows.json` entry). Empty if the window never had a folder.
 */
export function lastFolderList(host: Host): string[] {
  return [...(lastFolderLists.get(host) ?? [])]
}

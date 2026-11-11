// The window's workspaces: the `api.workspaces` contract + notices from inactive workspaces (`api.notifications`).
// The list, the order and the view lifecycle live in `window/windows.ts`; here live the validation of what comes from
// the renderer, the state each view receives (`workspaces:changed`) and the Claude toasts.

import { isFiniteNumber } from '@shared/guards'
import type { WebContents } from 'electron'
import { basename } from 'node:path'
import type { WorkspaceInfo, WorkspaceNotice, WorkspaceTabAction, WorkspacesState } from '@shared/types'
import { notificationContent } from '../claude/sessionStatus'
import { aggregateStatus } from '../workspace/aggregateStatus'
import {
  activateWorkspace,
  activeContents,
  hostContents,
  isDormant,
  liveContents,
  moveWorkspace,
  onWorkspaceEvent,
  setBranch,
  setMuted,
  workspaceOf,
  type Host,
  type Workspace
} from '../window/windows'
import { openFolderAsWorkspace, openFolderWithPrompt } from '../window/openFolder'
import { openManyFolders } from '../window/openMany'
import { sanitizeBranch } from '../window/windowsFile'
import { closeNotificationsOf } from '../claude/notify'
import { markAllRead, onClaudeSessionEvent, sessionStatesOf, updateBadge } from '../claude/registry'
import { requestCloseWorkspace } from '../window/closeController'
import { assertFolderOrForget, updateRecentBranch } from '../recent/store'
import { pickFolder, popupChoice, type PickFolderOptions } from '../window/nativeUi'
import { handle, on } from './typed'
import { send } from '../window/send'
import { t } from '@shared/i18n'
import { parseAbsolutePath } from '../fs/validate'
import { UserError } from '../errors'

const MAX_ID_LENGTH = 100
// Limit of the prompt the renderer may request.
const MAX_PROMPT_LENGTH = 100_000

interface Notice {
  key: string
  wc: WebContents
  ws: Workspace
  sessionId: string
}

// Notices shown in each window's active view, until dismissed.
const notices = new Map<string, Notice>()
const pendingEmit = new Set<Host>()

function infoOf(ws: Workspace): WorkspaceInfo {
  const wc = liveContents(ws)
  const { status, unread } = wc ? aggregateStatus(sessionStatesOf(wc)) : { status: 'idle' as const, unread: 0 }
  return {
    id: ws.id,
    name: ws.root ? basename(ws.root) || ws.root : t().app.workspaceBar.emptyName,
    root: ws.root,
    branch: ws.branch,
    status,
    unread,
    active: ws.host.activeId === ws.id,
    dormant: isDormant(ws),
    muted: ws.muted
  }
}

function stateFor(ws: Workspace): WorkspacesState {
  return { selfId: ws.id, workspaces: ws.host.workspaces.map(infoOf) }
}

/** Sends the bar state to ALL live views of the window (active or not), each with its own `selfId`. */
function emitNow(host: Host): void {
  if (host.closing) return
  // The list is the same for every view (only `selfId` changes): computed once, not once per recipient.
  const workspaces = host.workspaces.map(infoOf)
  for (const wc of hostContents(host)) {
    const ws = workspaceOf(wc)
    if (ws) send(wc, 'workspaces:changed', { selfId: ws.id, workspaces })
  }
}

// Several changes in a row (activate = order + active + status) become a single send.
function scheduleEmit(host: Host): void {
  if (pendingEmit.has(host)) return
  pendingEmit.add(host)
  queueMicrotask(() => {
    pendingEmit.delete(host)
    emitNow(host)
  })
}

function dismiss(notice: Notice): void {
  if (!notices.delete(notice.key)) return
  for (const wc of hostContents(notice.ws.host)) send(wc, 'notifications:dismiss', notice.key)
}

function dismissWhere(match: (n: Notice) => boolean): void {
  for (const n of [...notices.values()]) if (match(n)) dismiss(n)
}

function show(
  ws: Workspace,
  wc: WebContents,
  sessionId: string,
  signal: 'done' | 'attention' | 'error',
  title: string,
  question: boolean
): void {
  const target = activeContents(ws.host)
  if (!target) return
  const content = notificationContent(signal, title, question)
  const key = `ws:${ws.id}:${sessionId}`
  const info = infoOf(ws)
  const notice: WorkspaceNotice = {
    key,
    workspace: { id: ws.id, name: info.name, root: ws.root, branch: ws.branch },
    sessionId,
    signal,
    title: content.title,
    sessionTitle: content.body
  }
  notices.set(key, { key, wc, ws, sessionId })
  send(target, 'notifications:show', notice)
}

/** Folder requested by the renderer, or (without one) the one picked in a dialog; `null` = the user cancelled. */
async function resolveRootOrPick(wc: WebContents, raw: unknown, dialog?: PickFolderOptions): Promise<string | null> {
  if (raw === undefined || raw === null) return pickFolder(wc, dialog)
  return parseAbsolutePath(raw, t().app.errors.invalidFolder)
}

function senderWorkspace(wc: WebContents): Workspace {
  const ws = workspaceOf(wc)
  if (!ws) throw new UserError(t().app.errors.unknownWindow)
  return ws
}

/** Workspace with this id in the sender's window; renderer input is untrusted. */
function find(sender: Workspace, id: unknown): Workspace | null {
  if (typeof id !== 'string' || id.length > MAX_ID_LENGTH) return null
  return sender.host.workspaces.find((w) => w.id === id) ?? null
}

export function registerWorkspacesHandlers(): void {
  onWorkspaceEvent((event) => {
    switch (event.type) {
      case 'changed':
        scheduleEmit(event.host)
        break
      case 'activating': {
        // The user now sees the workspace: sessions read, notices (toast and system) dismissed. Synchronous and before
        // the view shows, otherwise it paints a frame with the old tab and the unread badge.
        if (!event.silent) {
          const wc = liveContents(event.ws)
          if (wc) markAllRead(wc)
          dismissWhere((n) => n.ws === event.ws)
        }
        emitNow(event.ws.host)
        break
      }
      case 'removed':
        dismissWhere((n) => n.ws === event.ws)
        scheduleEmit(event.ws.host)
        break
      default:
        break
    }
  })

  onClaudeSessionEvent((event) => {
    if (event.type === 'removed') {
      dismissWhere((n) => n.wc === event.wc && n.sessionId === event.id)
      const gone = workspaceOf(event.wc)
      if (gone) scheduleEmit(gone.host)
      return
    }
    const ws = workspaceOf(event.wc)
    if (!ws) return
    scheduleEmit(ws.host)
    const key = `ws:${ws.id}:${event.id}`
    if (event.notify && ws.host.activeId !== ws.id && !ws.muted) {
      show(ws, event.wc, event.id, event.notify, event.sessionTitle, event.question)
    } else if (
      !event.notify &&
      notices.has(key) &&
      (event.unread === 0 || (event.previous === 'attention' && event.status !== 'attention'))
    ) {
      dismissWhere((n) => n.key === key)
    }
  })

  handle('workspaces:list', (e) => stateFor(senderWorkspace(e.sender)))

  handle('workspaces:add', async (e, rawRoot: unknown): Promise<boolean> => {
    const ws = senderWorkspace(e.sender)
    const root = await resolveRootOrPick(e.sender, rawRoot)
    if (!root) return false
    await assertFolderOrForget(root)
    // The sender may have closed during the dialog: its window is the preferred one only if it still exists.
    return openFolderAsWorkspace(root, ws.host.win.isDestroyed() ? null : ws.host)
  })

  handle('workspaces:openMany', async (e, rawRoots: unknown): Promise<number> => {
    const { host } = senderWorkspace(e.sender)
    return openManyFolders(host, rawRoots)
  })

  handle('workspaces:openWithPrompt', async (e, rawRoot: unknown, rawPrompt: unknown): Promise<boolean> => {
    const ws = senderWorkspace(e.sender)
    if (typeof rawPrompt !== 'string' || !rawPrompt.trim()) throw new UserError(t().app.errors.emptyPrompt)
    if (rawPrompt.length > MAX_PROMPT_LENGTH) throw new UserError(t().app.errors.promptTooLong)
    const root = await resolveRootOrPick(e.sender, rawRoot, {
      title: t().app.dialogs.pickProjectFolder,
      buttonLabel: t().common.open
    })
    if (!root) return false
    await assertFolderOrForget(root)
    return openFolderWithPrompt(root, rawPrompt, ws.host.win.isDestroyed() ? null : ws.host)
  })

  on('workspaces:activate', (e, id: unknown, reveal: unknown) => {
    const sender = workspaceOf(e.sender)
    const target = sender && find(sender, id)
    if (!target) return
    const session = typeof reveal === 'string' && reveal.length <= MAX_ID_LENGTH ? reveal : undefined
    activateWorkspace(target, session)
  })

  handle('workspaces:close', async (e, id: unknown): Promise<void> => {
    const sender = senderWorkspace(e.sender)
    const target = find(sender, id)
    if (!target) throw new UserError(t().app.errors.workspaceNotFound)
    // The only view is already the empty one (Welcome): nothing to close, and the window does not close.
    if (sender.host.workspaces.length === 1 && target.root === null) return
    await requestCloseWorkspace(target)
  })

  on('workspaces:move', (e, id: unknown, index: unknown) => {
    const sender = workspaceOf(e.sender)
    const target = sender && find(sender, id)
    if (!target || !isFiniteNumber(index)) return
    moveWorkspace(target, index)
  })

  on('workspaces:setMuted', (e, id: unknown, muted: unknown) => {
    const sender = workspaceOf(e.sender)
    const target = sender && find(sender, id)
    if (!target || typeof muted !== 'boolean') return
    setMuted(target, muted)
    // Muting removes the pending notices; the Dock badge follows the change.
    if (muted) {
      dismissWhere((n) => n.ws === target)
      if (target.view && !target.view.webContents.isDestroyed()) closeNotificationsOf(target.view.webContents)
    }
    updateBadge()
  })

  handle('workspaces:contextMenu', (e, id: unknown) => {
    const sender = workspaceOf(e.sender)
    const target = sender && find(sender, id)
    if (!target) return Promise.resolve<WorkspaceTabAction | null>(null)
    const { app } = t()
    return popupChoice<WorkspaceTabAction>(e.sender, [
      target.muted
        ? { label: app.workspaceMenu.unmute, value: 'unmute' }
        : { label: app.workspaceMenu.mute, value: 'mute' },
      ...(target.root ? [{ label: app.copyPath, value: 'copyPath' as const }] : []),
      { type: 'separator' },
      { label: app.closeWorkspace, value: 'close' }
    ])
  })

  on('workspaces:reportBranch', (e, branch: unknown) => {
    const ws = workspaceOf(e.sender)
    if (!ws) return
    const clean = branch === null ? null : sanitizeBranch(branch)
    if (branch !== null && !clean) return
    setBranch(ws, clean)
    // The recent folder keeps the last branch; only writes if it changed and the folder is in the list.
    if (ws.root) updateRecentBranch(ws.root, clean)
  })
}

// Delivering requests to views: what the view can only receive once ready (menu command, session `reveal`,
// "Start with Claude") waits in a per-webContents queue until the right signal arrives.

import type { WebContents } from 'electron'
import type { CommandId } from '@shared/commands'
import { samePath } from '@shared/pathCompare'
import type { ClaudeConversationId, ClaudeStartRequest } from '@shared/types'
import { send } from './send'
import { registerEvictionGuard } from './evictionGuards'
import { workspaceOf } from './windowState'

// Views whose renderer already called `workspace:current` (subscribed to `app:command`/`openRequested`).
const ready = new WeakSet<WebContents>()
const queuedCommands = new WeakMap<WebContents, CommandId>()
const queuedReveals = new WeakMap<WebContents, ClaudeConversationId>()
const queuedOpens = new WeakMap<WebContents, string>()
// "Start with Claude": request waiting for the view to be in folder `root` with `workspace:open` done.
const queuedStarts = new WeakMap<WebContents, ClaudeStartRequest>()
// Views whose current folder finished opening (`workspace:open`): the renderer only acts on `root` from then on.
const folderOpened = new WeakSet<WebContents>()
// Empty view just reused to open a folder (when): a second `add` right after creates another tab.
const openPending = new WeakMap<WebContents, number>()
const OPEN_PENDING_MS = 10_000

// Requests still on their way to the view (command, reveal, "Start with Claude") or folder still opening: do not
// unload.
registerEvictionGuard('pending', (wc) => {
  if (queuedCommands.has(wc) || queuedReveals.has(wc) || queuedOpens.has(wc) || queuedStarts.has(wc))
    return 'pendingRequest'
  const ws = workspaceOf(wc)
  if (ws?.root && !folderOpened.has(wc)) return 'openingFolder'
  return null
})

export function isViewReady(wc: WebContents): boolean {
  return ready.has(wc)
}

/** The view reloaded: the renderer must report again that it is ready and reopen the folder. */
export function viewNavigated(wc: WebContents): void {
  ready.delete(wc)
  folderOpened.delete(wc)
}

const crashHooked = new WeakSet<WebContents>()

/**
 * A renderer dead before becoming ready will never consume the queue: discards it, otherwise it reappears after the
 * reload.
 */
function dropQueuedOnCrash(wc: WebContents): void {
  if (crashHooked.has(wc)) return
  crashHooked.add(wc)
  wc.on('render-process-gone', () => {
    queuedCommands.delete(wc)
    queuedOpens.delete(wc)
  })
}

export function queueCommand(wc: WebContents, command: CommandId): void {
  dropQueuedOnCrash(wc)
  queuedCommands.set(wc, command)
}

/**
 * Delivers `app:command` to the view: if ready it gets it now; while loading (no listener yet) keeps the last for
 * `flush`.
 */
export function deliverCommand(wc: WebContents, command: CommandId): void {
  if (wc.isDestroyed()) return
  if (ready.has(wc)) send(wc, 'app:command', command)
  else queueCommand(wc, command)
}

/** Same rule for `workspace:openRequested`: a folder requested from a still-loading view waits for the ready signal. */
export function deliverOpenRequest(wc: WebContents, root: string): void {
  if (wc.isDestroyed()) return
  if (ready.has(wc)) send(wc, 'workspace:openRequested', root)
  else {
    dropQueuedOnCrash(wc)
    queuedOpens.set(wc, root)
  }
}

export function sendWhenReady(wc: WebContents, reveal: ClaudeConversationId): void {
  if (ready.has(wc)) send(wc, 'claude:event', { type: 'reveal', id: reveal })
  else queuedReveals.set(wc, reveal)
}

/** The view's renderer is ready (`workspace:current`): delivers what was queued (command, `reveal`). */
export function flushQueuedCommand(wc: WebContents): void {
  ready.add(wc)
  const command = queuedCommands.get(wc)
  if (command) {
    queuedCommands.delete(wc)
    send(wc, 'app:command', command)
  }
  const open = queuedOpens.get(wc)
  if (open) {
    queuedOpens.delete(wc)
    send(wc, 'workspace:openRequested', open)
  }
  const reveal = queuedReveals.get(wc)
  if (reveal) {
    queuedReveals.delete(wc)
    send(wc, 'claude:event', { type: 'reveal', id: reveal })
  }
}

export function queueStartRequest(wc: WebContents, request: ClaudeStartRequest): void {
  queuedStarts.set(wc, request)
  deliverStartRequest(wc)
}

/** The view's `workspace:open` finished (folder assigned and watcher up): delivers the waiting Claude request. */
export function markFolderOpened(wc: WebContents): void {
  if (!workspaceOf(wc)) return
  folderOpened.add(wc)
  deliverStartRequest(wc)
}

function deliverStartRequest(wc: WebContents): void {
  const request = queuedStarts.get(wc)
  if (!request) return
  const ws = workspaceOf(wc)
  if (wc.isDestroyed() || !ws) {
    queuedStarts.delete(wc)
    return
  }
  if (!ready.has(wc) || !folderOpened.has(wc) || !ws.root || !samePath(ws.root, request.root)) return
  queuedStarts.delete(wc)
  // After the `workspace:open` reply: the renderer already has the folder in its state when the request arrives.
  setImmediate(() => send(wc, 'claude:startRequested', request))
}

/** The view got another folder (or released the one that would receive the request): the request no longer holds. */
export function folderChanged(wc: WebContents, previous: string | null, root: string | null): void {
  folderOpened.delete(wc)
  const request = queuedStarts.get(wc)
  if (!request) return
  const differs = root !== null && !samePath(root, request.root)
  const released = root === null && previous !== null && samePath(previous, request.root)
  if (differs || released) queuedStarts.delete(wc)
}

/** The folder's `workspace:open` failed: the Claude request waiting for it must not fire later. */
export function dropQueuedStart(wc: WebContents, root: string): void {
  const request = queuedStarts.get(wc)
  if (request && samePath(request.root, root)) queuedStarts.delete(wc)
}

/** Claims the empty view to open a folder; `false` if it was just reused (the new folder becomes another tab). */
export function claimEmptyView(wc: WebContents): boolean {
  if (Date.now() - (openPending.get(wc) ?? 0) <= OPEN_PENDING_MS) return false
  openPending.set(wc, Date.now())
  return true
}

/** The empty view got a folder: the claim ends. */
export function releaseEmptyView(wc: WebContents): void {
  openPending.delete(wc)
}

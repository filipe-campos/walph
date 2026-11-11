// Who can talk to main over IPC: only the main frame of a workspace webContents (see `isTrustedSender`).
// Leaf module, without `electron` at runtime, so `ipc/typed.ts` and the tests use it without pulling view creation.
import type { WebContents, WebFrameMain } from 'electron'

// Mark on the webContents itself (not a module WeakSet): `vi.resetModules()` reloads the module and would lose the
// record.
const TRUSTED = Symbol.for('walph.trustedSender')
type Marked = { [TRUSTED]?: true }

/** Registers a workspace webContents. Called on creation, before the preload sends the first message. */
export function trustSender(wc: WebContents): void {
  ;(wc as Marked)[TRUSTED] = true
}

/**
 * Did the message come from the main frame of a workspace webContents? Subframes and outside webContents (DevTools, a
 * page that navigated to another origin) do not talk to main. `senderFrame` is `null` when the frame died or navigated.
 */
export function isTrustedSender(event: { sender: WebContents; senderFrame?: WebFrameMain | null }): boolean {
  const { sender, senderFrame } = event
  return (sender as Marked)[TRUSTED] === true && senderFrame != null && senderFrame === sender.mainFrame
}

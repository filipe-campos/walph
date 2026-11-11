// Typed maps of the IPC channels (channel → arguments → return), derived from `ipcSpec.ts` (channel and kind of each
// method) and from the `<Domain>Api`s in `types/` (signatures): nothing is written twice.
//   - `IpcInvoke`: renderer → main with a reply (`ipcRenderer.invoke` / `ipcMain.handle`).
//   - `IpcSend`: renderer → main without a reply (`ipcRenderer.send` / `ipcMain.on`).
//   - `IpcEvents`: main → renderer (`webContents.send` / `ipcRenderer.on`); the values are the listener arguments.
// Main handlers still receive `unknown`: validation at the boundary is up to each handler; the maps check the channel
// name, arity and return.
import { ipcSpec, listChannels, type BridgedApi, type IpcEntry, type IpcKind } from './ipcSpec'

/** `{ args, result }` of a `WalphApi` method (the promise is unwrapped: the handler returns a value or a promise). */
type Call<F> = F extends (...args: infer A) => infer R ? { args: A; result: Awaited<R> } : never
/** Arguments of a method fired without a reply. */
type Args<F> = F extends (...args: infer A) => unknown ? A : never
/** Arguments of the listener of an `onXxx(cb)`. */
type Payload<F> = F extends (cb: (...args: infer A) => void) => unknown ? A : never

/** Walks spec and contract in parallel and returns `{ kind, channel, method }` for each leaf of the spec. */
type Leaf<S, A> = {
  [K in keyof S & keyof A]: S[K] extends IpcEntry
    ? { kind: S[K]['kind']; channel: S[K]['channel']; method: A[K] }
    : Leaf<S[K], A[K]>
}[keyof S & keyof A]
type OfKind<K extends IpcKind> = Extract<Leaf<typeof ipcSpec, BridgedApi>, { kind: K }>

/** Renderer → main with a reply. */
export type IpcInvoke = { [L in OfKind<'invoke'> as L['channel']]: Call<L['method']> }

/** Renderer → main without a reply (`ipcRenderer.send` / `ipcMain.on`): value = arguments. */
export type IpcSend = { [L in OfKind<'send'> as L['channel']]: Args<L['method']> }

/** Main → renderer (`webContents.send` / `ipcRenderer.on`): value = listener arguments. */
export type IpcEvents = { [L in OfKind<'event'> as L['channel']]: Payload<L['method']> }

const channels = listChannels(ipcSpec)

/** Channels main registers with `ipcMain.handle` (`invoke`) and `ipcMain.on` (`send`); `event` ones main only emits. */
export const IPC_CHANNELS = {
  invoke: channels.invoke as Array<keyof IpcInvoke>,
  send: channels.send as Array<keyof IpcSend>,
  event: channels.event as Array<keyof IpcEvents>
}

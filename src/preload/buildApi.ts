import { isIpcEntry, type BridgedApi, type IpcEntry } from '@shared/ipcSpec'

/** The slice of `ipcRenderer` the bridge uses (a fake in the tests). */
export interface RendererIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

/** Builds `window.api` from the spec: only forwards each call to the channel of its kind, no logic. */
export function buildApi(spec: object, ipc: RendererIpc): BridgedApi {
  const forward = ({ kind, channel }: IpcEntry): unknown => {
    if (kind === 'invoke') return (...args: unknown[]) => ipc.invoke(channel, ...args)
    if (kind === 'send') return (...args: unknown[]) => ipc.send(channel, ...args)
    return (cb: (...args: unknown[]) => void) => {
      const listener = (_event: unknown, ...args: unknown[]): void => cb(...args)
      ipc.on(channel, listener)
      return () => ipc.removeListener(channel, listener)
    }
  }
  const build = (node: object): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(node).map(([name, child]: [string, unknown]) => [
        name,
        isIpcEntry(child) ? forward(child) : build(child as object)
      ])
    )
  return build(spec) as unknown as BridgedApi
}

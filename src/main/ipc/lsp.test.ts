import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const disposed: unknown[] = []

vi.mock('electron', () => harness.electronMock)
vi.mock('../lsp/server', () => ({ markAllLanguageServersQuitting: () => undefined }))
vi.mock('../lsp/manager', () => ({
  LspManager: class {
    setActive(): void {}
    open(): void {}
    async dispose(): Promise<void> {
      disposed.push(this)
    }
    killAll(): void {}
  }
}))
vi.mock('../window/windows', () => ({
  getWindowRoot: () => null,
  onWindowRootChange: () => () => undefined,
  onWorkspaceEvent: () => () => undefined
}))
vi.mock('../workspace/isActiveView', () => ({ isActiveView: () => true }))
vi.mock('../workspace/viewWatchers', () => ({ onWorkspaceFiles: () => () => undefined }))
vi.mock('../settings/state', () => ({ getEffectiveSettings: () => ({}), onSettingsChange: () => () => undefined }))

describe('lsp: webContents listeners', () => {
  beforeEach(() => {
    harness.reset()
    disposed.length = 0
    vi.resetModules()
  })

  it('keeps 1 listener per event after several reloads and releases the current manager', async () => {
    const mod = await import('./lsp')
    const { lspManagerOf } = await import('../lsp/registry')
    mod.registerLspHandlers()
    const wc = fakeWebContents()
    const open = (): void => harness.emit('lsp:open', wc, '/a/b.ts', 'x', 1)

    for (let i = 0; i < 5; i++) {
      open()
      wc.emit('did-navigate')
    }
    open()
    expect(wc.listenerCount('did-navigate')).toBe(1)
    expect(wc.listenerCount('render-process-gone')).toBe(1)
    expect(wc.listenerCount('destroyed')).toBe(1)
    expect(disposed).toHaveLength(5)
    expect(lspManagerOf(wc as never)).toBeDefined()

    wc.emit('destroyed')
    expect(lspManagerOf(wc as never)).toBeUndefined()
    expect(disposed).toHaveLength(6)
  })
})

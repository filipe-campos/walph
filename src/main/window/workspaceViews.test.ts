import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isTrustedSender } from './trustedSenders'

const env = vi.hoisted(() => {
  const state: { packaged: boolean; hidden: boolean; usesAppProtocol: boolean; openExternal: (url: string) => void } = {
    packaged: false,
    hidden: false,
    usesAppProtocol: false,
    openExternal: () => undefined
  }
  return state
})

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  class FakeContents extends Emitter {
    destroyed = false
    url = ''
    mainFrame = { routingId: 1 }
    focus = vi.fn()
    loadURL = vi.fn(() => Promise.resolve())
    setWindowOpenHandler = vi.fn()
    isDestroyed = (): boolean => this.destroyed
    getURL = (): string => this.url
  }
  class WebContentsView {
    webContents = new FakeContents()
    visible = true
    bounds: unknown = null
    background = ''
    constructor(readonly options: { webPreferences: Record<string, unknown> }) {}
    setVisible = vi.fn((v: boolean) => void (this.visible = v))
    setBounds = vi.fn((b: unknown) => void (this.bounds = b))
    setBackgroundColor = vi.fn((c: string) => void (this.background = c))
  }
  return {
    app: {
      get isPackaged() {
        return env.packaged
      }
    },
    shell: { openExternal: (url: string) => env.openExternal(url) },
    WebContentsView
  }
})
vi.mock('./hiddenMode', () => ({
  get hiddenWindows() {
    return env.hidden
  }
}))
vi.mock('./appProtocol', () => ({
  APP_INDEX_URL: 'app://walph/index.html',
  usesAppProtocol: () => env.usesAppProtocol
}))

import type { BaseWindow, WebContents } from 'electron'
import {
  allViewContents,
  createWorkspaceView,
  installWindowBehavior,
  loadRenderer,
  showOnly,
  windowOf
} from './workspaceViews'

interface FakeWindow extends EventEmitter {
  destroyed: boolean
  isDestroyed: () => boolean
  contentView: { addChildView: ReturnType<typeof vi.fn>; getBounds: () => { width: number; height: number } }
}

function fakeWindow(width = 1000, height = 700): FakeWindow {
  const win = new EventEmitter() as FakeWindow
  win.destroyed = false
  win.isDestroyed = () => win.destroyed
  win.contentView = { addChildView: vi.fn(), getBounds: () => ({ width, height }) }
  return win
}

interface FakeContentsApi extends EventEmitter {
  destroyed: boolean
  url: string
  mainFrame: { routingId: number }
  focus: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  setWindowOpenHandler: ReturnType<typeof vi.fn>
}
interface FakeView {
  webContents: FakeContentsApi
  visible: boolean
  bounds: unknown
  options: { webPreferences: Record<string, unknown> }
  setVisible: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
}
const contents = (view: FakeView): WebContents => view.webContents as unknown as WebContents
const make = (win: FakeWindow): FakeView => createWorkspaceView(win as unknown as BaseWindow) as unknown as FakeView

describe('workspaceViews', () => {
  beforeEach(() => {
    env.packaged = false
    env.hidden = false
    env.usesAppProtocol = false
    env.openExternal = vi.fn<(url: string) => void>()
  })

  describe('windowOf / allViewContents', () => {
    it('returns the host window of each created view', () => {
      const a = fakeWindow()
      const b = fakeWindow()
      const va = make(a)
      const vb = make(b)
      expect(windowOf(contents(va))).toBe(a)
      expect(windowOf(contents(vb))).toBe(b)
    })

    it('an unknown webContents has no window', () => {
      expect(windowOf(new EventEmitter() as never)).toBeNull()
    })

    it('a destroyed window becomes null even with the view still in the map', () => {
      const win = fakeWindow()
      const view = make(win)
      win.destroyed = true
      expect(windowOf(contents(view))).toBeNull()
    })

    it('a destroyed view leaves the map on the destroyed event', () => {
      const win = fakeWindow()
      const view = make(win)
      expect(allViewContents()).toContain(view.webContents)
      view.webContents.destroyed = true
      view.webContents.emit('destroyed')
      expect(windowOf(contents(view))).toBeNull()
      expect(allViewContents()).not.toContain(view.webContents)
    })

    it('allViewContents ignores an already destroyed webContents that has not emitted the event yet', () => {
      const view = make(fakeWindow())
      view.webContents.destroyed = true
      expect(allViewContents()).not.toContain(view.webContents)
    })
  })

  describe('createWorkspaceView', () => {
    it('keeps the security isolation and passes the app context to the sandboxed preload', () => {
      const view = make(fakeWindow())
      const prefs = view.options.webPreferences
      expect(prefs).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false })
      const args = prefs.additionalArguments as string[]
      expect(args.some((a) => a.startsWith('--walph-home='))).toBe(true)
      expect(args).toContain('--walph-locale=pt-BR')
      expect(args).not.toContain('--walph-packaged')
    })

    it('the packaged app tells the preload', () => {
      env.packaged = true
      const view = make(fakeWindow())
      const prefs = view.options.webPreferences
      expect(prefs.additionalArguments).toContain('--walph-packaged')
    })

    it('throttles the hidden view, except in test mode', () => {
      const normal = make(fakeWindow())
      env.hidden = true
      const hidden = make(fakeWindow())
      const throttling = (v: FakeView): unknown => v.options.webPreferences.backgroundThrottling
      expect(throttling(normal)).toBe(true)
      expect(throttling(hidden)).toBe(false)
    })

    it('starts invisible, inside the window and sized to the content area', () => {
      const win = fakeWindow(1200, 800)
      const view = make(win)
      expect(view.visible).toBe(false)
      expect(win.contentView.addChildView).toHaveBeenCalledWith(view)
      expect(view.bounds).toEqual({ x: 0, y: 0, width: 1200, height: 800 })
    })

    it('is a trusted IPC sender', () => {
      const view = make(fakeWindow())
      expect(
        isTrustedSender({ sender: view.webContents as never, senderFrame: view.webContents.mainFrame as never })
      ).toBe(true)
    })

    it('blocks any SPA navigation (dropped file, link)', () => {
      const view = make(fakeWindow())
      for (const event of ['will-navigate', 'will-frame-navigate']) {
        const preventDefault = vi.fn()
        view.webContents.emit(event, { url: 'file:///etc/passwd', preventDefault })
        expect(preventDefault).toHaveBeenCalledTimes(1)
      }
    })

    it('in dev lets the HMR reload to the same URL through, but never when packaged', () => {
      const view = make(fakeWindow())
      view.webContents.url = 'http://localhost:5173/'
      const same = vi.fn()
      view.webContents.emit('will-navigate', { url: 'http://localhost:5173/', preventDefault: same })
      expect(same).not.toHaveBeenCalled()
      const other = vi.fn()
      view.webContents.emit('will-navigate', { url: 'http://localhost:5173/other', preventDefault: other })
      expect(other).toHaveBeenCalled()

      env.packaged = true
      const packaged = make(fakeWindow())
      packaged.webContents.url = 'app://walph/index.html'
      const blocked = vi.fn()
      packaged.webContents.emit('will-navigate', { url: 'app://walph/index.html', preventDefault: blocked })
      expect(blocked).toHaveBeenCalled()
    })

    it('window.open never opens a window: only http, https and mailto go to the browser', () => {
      const view = make(fakeWindow())
      const handler = view.webContents.setWindowOpenHandler.mock.calls[0][0] as (d: { url: string }) => unknown
      for (const url of ['https://example.com/a', 'http://example.com', 'mailto:a@b.c']) {
        expect(handler({ url })).toEqual({ action: 'deny' })
      }
      expect(env.openExternal).toHaveBeenCalledTimes(3)
      vi.mocked(env.openExternal).mockClear()
      for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'vscode://x', '']) {
        expect(handler({ url })).toEqual({ action: 'deny' })
      }
      expect(env.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('loadRenderer', () => {
    it('in dev loads the Vite URL', () => {
      vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
      const view = make(fakeWindow())
      loadRenderer(view.webContents as never)
      expect(view.webContents.loadURL).toHaveBeenCalledWith('http://localhost:5173')
    })

    it('packaged loads the app:// scheme', () => {
      env.usesAppProtocol = true
      const view = make(fakeWindow())
      loadRenderer(view.webContents as never)
      expect(view.webContents.loadURL).toHaveBeenCalledWith('app://walph/index.html')
    })
  })

  describe('showOnly', () => {
    it('only the active one stays visible, fitted to the current size, and gets focus if requested', () => {
      const win = fakeWindow(900, 600)
      const a = make(win)
      const b = make(win)
      showOnly(win as never, [a, b] as never, b as never, true)
      expect(a.setVisible).toHaveBeenLastCalledWith(false)
      expect(b.setVisible).toHaveBeenLastCalledWith(true)
      expect(b.bounds).toEqual({ x: 0, y: 0, width: 900, height: 600 })
      expect(b.webContents.focus).toHaveBeenCalled()
    })

    it('without requested focus it does not steal keyboard focus', () => {
      const win = fakeWindow()
      const a = make(win)
      showOnly(win as never, [a] as never, a as never, false)
      expect(a.webContents.focus).not.toHaveBeenCalled()
    })

    it('without an active view hides all; a destroyed view is ignored', () => {
      const win = fakeWindow()
      const a = make(win)
      const b = make(win)
      b.webContents.destroyed = true
      a.setVisible.mockClear()
      b.setVisible.mockClear()
      showOnly(win as never, [a, b] as never, null, true)
      expect(a.setVisible).toHaveBeenCalledWith(false)
      expect(b.setVisible).not.toHaveBeenCalled()
      showOnly(win as never, [a] as never, b as never, true)
      expect(b.setVisible).not.toHaveBeenCalled()
    })

    it('destroyed window: shows the active one without trying to reposition', () => {
      const win = fakeWindow(900, 600)
      const a = make(win)
      a.setBounds.mockClear()
      win.destroyed = true
      showOnly(win as never, [a] as never, a as never, false)
      expect(a.setBounds).not.toHaveBeenCalled()
      expect(a.setVisible).toHaveBeenLastCalledWith(true)
    })
  })

  describe('installWindowBehavior', () => {
    it.each(['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'])(
      'on %s only the active view follows the size',
      (event) => {
        const win = fakeWindow(800, 500)
        const active = make(win)
        const other = make(win)
        active.setBounds.mockClear()
        other.setBounds.mockClear()
        installWindowBehavior(win as never, () => active as never)
        win.emit(event)
        expect(active.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 800, height: 500 })
        expect(other.setBounds).not.toHaveBeenCalled()
      }
    )

    it('focusing the window gives focus back to the active view; without an active one, does nothing', () => {
      const win = fakeWindow()
      const active = make(win)
      let current: FakeView | null = active
      installWindowBehavior(win as never, () => current as never)
      win.emit('focus')
      expect(active.webContents.focus).toHaveBeenCalledTimes(1)
      current = null
      expect(() => win.emit('focus')).not.toThrow()
      expect(() => win.emit('resize')).not.toThrow()
    })
  })
})

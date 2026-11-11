import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { UpdateNotice } from '@shared/types'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())

const env = vi.hoisted(() => {
  const state: {
    packaged: boolean
    settings: Record<string, unknown>
    active: unknown
    quit: () => void
    settingsListeners: (() => void)[]
    quitCancelledListeners: (() => void)[]
  } = {
    packaged: true,
    settings: { 'update.enabled': true, 'update.channel': 'stable' },
    active: null,
    quit: () => undefined,
    settingsListeners: [],
    quitCancelledListeners: []
  }
  return state
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return env.packaged
    },
    quit: () => env.quit()
  },
  ...harness.electronMock
}))
vi.mock('../settings/state', () => ({
  getUserSettings: () => env.settings,
  onSettingsChange: (cb: () => void) => void env.settingsListeners.push(cb)
}))
vi.mock('../window/closeController', () => ({
  onQuitCancelled: (cb: () => void) => void env.quitCancelledListeners.push(cb)
}))
vi.mock('../window/windows', () => ({
  targetHost: () => ({}),
  activeContents: () => env.active
}))

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowDowngrade = true
  allowPrerelease = false
  channel = ''
  checkForUpdates = vi.fn(() => Promise.resolve(null))
  quitAndInstall = vi.fn()
}

describe('ipc/update', () => {
  let wc: FakeWebContents
  let updater: FakeUpdater
  let stopUpdates: () => void

  const notices = (): UpdateNotice[] =>
    wc.send.mock.calls.filter((c) => c[0] === 'update:notice').map((c) => c[1] as UpdateNotice)
  const check = (): Promise<unknown> => harness.invoke('update:check', wc)
  const requestInstall = (): void => harness.emit('update:install', wc)

  async function load(): Promise<void> {
    vi.resetModules()
    harness.reset()
    env.settingsListeners.length = 0
    env.quitCancelledListeners.length = 0
    vi.doMock('electron-updater', () => ({ autoUpdater: updater }))
    const mod = await import('./update')
    stopUpdates = mod.stopUpdates
    mod.registerUpdateHandlers()
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] })
    wc = fakeWebContents()
    env.active = wc
    env.packaged = true
    env.settings = { 'update.enabled': true, 'update.channel': 'stable' }
    env.quit = vi.fn()
    updater = new FakeUpdater()
  })

  afterEach(() => {
    stopUpdates?.()
    vi.useRealTimers()
  })

  it('unpackaged app: both channels exist and do nothing', async () => {
    env.packaged = false
    await load()
    await expect(check()).resolves.toBeUndefined()
    requestInstall()
    expect(notices()).toEqual([])
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(env.quit).not.toHaveBeenCalled()
  })

  it('update turned off: the manual check notifies and does not load the updater', async () => {
    env.settings['update.enabled'] = false
    await load()
    await check()
    expect(notices()).toEqual([{ kind: 'error', message: t().app.update.disabled }])
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('manual check: shows "checking", checks and answers "up to date"', async () => {
    await load()
    updater.checkForUpdates.mockImplementation(() => {
      updater.emit('update-not-available')
      return Promise.resolve(null)
    })
    await check()
    expect(notices().map((n) => n.kind)).toEqual(['checking', 'upToDate'])
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('configures the updater: downloads on its own, installs on quit, never downgrades', async () => {
    await load()
    await check()
    expect(updater).toMatchObject({
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowDowngrade: false,
      channel: 'latest',
      allowPrerelease: false
    })
  })

  it('the beta channel turns on the beta channel and prereleases', async () => {
    env.settings['update.channel'] = 'beta'
    await load()
    await check()
    expect(updater).toMatchObject({ channel: 'beta', allowPrerelease: true, allowDowngrade: false })
  })

  it('manual: a new version shows "downloading" and, when done, "ready" with the version', async () => {
    await load()
    updater.checkForUpdates.mockImplementation(() => {
      updater.emit('update-available', { version: '2.0.0' })
      return Promise.resolve(null)
    })
    await check()
    updater.emit('update-downloaded', { version: '2.0.0' })
    expect(notices().map((n) => [n.kind, 'version' in n ? n.version : undefined])).toEqual([
      ['checking', undefined],
      ['downloading', '2.0.0'],
      ['downloaded', '2.0.0']
    ])
  })

  it('the automatic check is silent, except when something was downloaded', async () => {
    await load()
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.waitFor(() => expect(updater.checkForUpdates).toHaveBeenCalledTimes(1))
    updater.emit('update-available', { version: '2.0.0' })
    updater.emit('update-not-available')
    updater.emit('error', new Error('ECONNREFUSED'))
    expect(notices()).toEqual([])
    updater.emit('update-downloaded', { version: '2.0.0' })
    expect(notices().map((n) => n.kind)).toEqual(['downloaded'])
  })

  it('schedules the first check in 10 s and repeats every 4 h; stopUpdates cancels', async () => {
    await load()
    await vi.waitFor(() => expect(updater.channel).toBe('latest'))
    await vi.advanceTimersByTimeAsync(9_000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(updater.checkForUpdates).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    stopUpdates()
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('turning the setting off with the app open cancels the checks and the install on quit', async () => {
    await load()
    await vi.waitFor(() => expect(updater.autoInstallOnAppQuit).toBe(true))
    env.settings['update.enabled'] = false
    env.settingsListeners.forEach((cb) => cb())
    await vi.waitFor(() => expect(updater.autoInstallOnAppQuit).toBe(false))
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('an updater error in a manual check becomes a translated notice, without the raw message', async () => {
    await load()
    updater.checkForUpdates.mockImplementation(() => {
      updater.emit('error', new Error('getaddrinfo ENOTFOUND github.com secret-header'))
      return Promise.reject(new Error('getaddrinfo ENOTFOUND github.com secret-header'))
    })
    await check()
    const errors = notices().filter((n) => n.kind === 'error')
    expect(errors[0]).toEqual({ kind: 'error', message: t().app.update.offline })
    expect(JSON.stringify(notices())).not.toContain('secret-header')
  })

  it('checkForUpdates rejecting without an event still notifies the user', async () => {
    await load()
    updater.checkForUpdates.mockRejectedValue(new Error('boom'))
    await check()
    expect(notices().at(-1)).toEqual({ kind: 'error', message: t().app.update.checkFailed })
  })

  it('updater module unavailable: the manual check reports the error', async () => {
    vi.resetModules()
    harness.reset()
    vi.doMock('electron-updater', () => {
      throw new Error('module missing')
    })
    const mod = await import('./update')
    stopUpdates = mod.stopUpdates
    mod.registerUpdateHandlers()
    await check()
    expect(notices().at(-1)).toEqual({ kind: 'error', message: t().app.update.checkFailed })
  })

  it('with an update already downloaded, the check only resends the restart notice', async () => {
    await load()
    await check()
    updater.emit('update-downloaded', { version: '3.0.0' })
    updater.checkForUpdates.mockClear()
    const before = notices().length
    await check()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(notices().slice(before)).toEqual([expect.objectContaining({ kind: 'downloaded', version: '3.0.0' })])
  })

  it('with a download in progress, the check shows the progress and does not check again', async () => {
    await load()
    await check()
    updater.emit('update-available', { version: '2.5.0' })
    updater.checkForUpdates.mockClear()
    await check()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(notices().at(-1)).toMatchObject({ kind: 'downloading', version: '2.5.0' })
  })

  describe('install and restart', () => {
    it('with nothing downloaded, asking to install does not quit the app', async () => {
      await load()
      requestInstall()
      expect(env.quit).not.toHaveBeenCalled()
    })

    it('downloaded: asking closes the app the normal way and the install only runs in stopUpdates', async () => {
      await load()
      await check()
      updater.emit('update-downloaded', { version: '2.0.0' })
      requestInstall()
      expect(env.quit).toHaveBeenCalledTimes(1)
      expect(updater.quitAndInstall).not.toHaveBeenCalled()
      stopUpdates()
      expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)
      stopUpdates()
      expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
    })

    it('a cancelled quit disarms the install on the next quit', async () => {
      await load()
      await check()
      updater.emit('update-downloaded', { version: '2.0.0' })
      requestInstall()
      env.quitCancelledListeners.forEach((cb) => cb())
      stopUpdates()
      expect(updater.quitAndInstall).not.toHaveBeenCalled()
    })

    it('a quitAndInstall failure does not break the quit', async () => {
      await load()
      await check()
      updater.emit('update-downloaded', { version: '2.0.0' })
      requestInstall()
      updater.quitAndInstall.mockImplementation(() => {
        throw new Error('permission denied')
      })
      expect(() => stopUpdates()).not.toThrow()
    })
  })
})

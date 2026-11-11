import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import type * as FsPromises from 'node:fs/promises'
import { t } from '@shared/i18n'
import { fakeWebContents } from '../testing/fakeIpc'
import { INSTALL_APPLESCRIPT, UNINSTALL_APPLESCRIPT, posixLauncher } from '../cli/launcherScript'
import { makeRealTempDir } from '../testing/testEnv'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const LAUNCHER = '/usr/local/bin/walph'
const env = vi.hoisted(() => ({ temp: '' }))
const writeFileAtomic = vi.hoisted(() => vi.fn())
const runCollect = vi.hoisted(() => vi.fn())
const head = vi.hoisted(() => ({ text: null as string | null }))
const removed = vi.hoisted(() => vi.fn())
const removeError = vi.hoisted(() => ({ code: null as string | null }))

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => env.temp },
  ...harness.electronMock
}))
vi.mock('../fs/atomicWrite', () => ({ writeFileAtomic }))
vi.mock('../process/runCollect', () => ({ runCollect }))
vi.mock('../window/nativeUi', () => ({ confirmDestructive: vi.fn().mockResolvedValue(true) }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>()
  return {
    ...real,
    open: (path: string, ...rest: unknown[]) => {
      if (path !== LAUNCHER) return (real.open as (...a: unknown[]) => unknown)(path, ...rest)
      if (head.text === null) return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      const buffer = Buffer.from(head.text)
      return Promise.resolve({
        read: (target: Buffer) => Promise.resolve({ bytesRead: buffer.copy(target) }),
        close: () => Promise.resolve()
      })
    },
    rm: (path: string, ...rest: unknown[]) => {
      if (path !== LAUNCHER) return (real.rm as (...a: unknown[]) => unknown)(path, ...rest)
      removed(path)
      return removeError.code
        ? Promise.reject(Object.assign(new Error(removeError.code), { code: removeError.code }))
        : Promise.resolve()
    }
  }
})

import { registerCliHandlers } from './cli'

const permission = (code: string): Error => Object.assign(new Error(code), { code })

describe.skipIf(process.platform === 'win32')('cli on macOS: /usr/local/bin requires administrator', () => {
  const wc = fakeWebContents()
  const install = (): Promise<unknown> => harness.invoke('cli:install', wc)
  const uninstall = (): Promise<unknown> => harness.invoke('cli:uninstall', wc)

  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    env.temp = makeRealTempDir('walph-cli-admin-')
    head.text = null
    removeError.code = null
    writeFileAtomic.mockResolvedValue(undefined)
    runCollect.mockResolvedValue({ code: 0, stderr: '', spawnError: null, timedOut: false })
    harness.reset()
    registerCliHandlers()
  })

  afterEach(() => rmSync(env.temp, { recursive: true, force: true }))

  it('without write permission writes a temp file and copies it with osascript, paths as arguments', async () => {
    writeFileAtomic.mockRejectedValueOnce(permission('EACCES'))
    await expect(install()).resolves.toBe(t().app.cli.installed(LAUNCHER))
    const [script, ...args] = runCollect.mock.calls[0][1].slice(1) as string[]
    expect(runCollect.mock.calls[0][0]).toBe('osascript')
    expect(script).toBe(INSTALL_APPLESCRIPT)
    expect(args[1]).toBe(LAUNCHER)
    expect(args[0]).toMatch(/walph-cli-[^/]+\/walph$/)
    expect(writeFileAtomic).toHaveBeenCalledTimes(2)
  })

  it.each(['EPERM', 'ENOENT'])('%s also falls into the administrator path', async (code) => {
    writeFileAtomic.mockRejectedValueOnce(permission(code))
    await install()
    expect(runCollect).toHaveBeenCalledTimes(1)
  })

  it('a cancelled password returns null without an error', async () => {
    writeFileAtomic.mockRejectedValueOnce(permission('EACCES'))
    runCollect.mockResolvedValue({ code: 1, stderr: 'execution error: User canceled. (-128)', spawnError: null })
    await expect(install()).resolves.toBeNull()
  })

  it('an osascript failure that is not a cancellation becomes an administrator error', async () => {
    writeFileAtomic.mockRejectedValueOnce(permission('EACCES'))
    runCollect.mockResolvedValue({ code: 1, stderr: 'algo deu errado', spawnError: null })
    await expect(install()).rejects.toThrow(t().app.cli.adminFailed)
    writeFileAtomic.mockRejectedValueOnce(permission('EACCES'))
    runCollect.mockResolvedValue({ code: null, stderr: '', spawnError: new Error('ENOENT') })
    await expect(install()).rejects.toThrow(t().app.cli.adminFailed)
  })

  it('an error that is not about permission does not ask for administrator', async () => {
    writeFileAtomic.mockRejectedValueOnce(permission('EISDIR'))
    await expect(install()).rejects.toThrow(t().app.cli.installFailed(LAUNCHER))
    expect(runCollect).not.toHaveBeenCalled()
  })

  it('removing without permission uses osascript with the launcher path', async () => {
    head.text = posixLauncher('/Applications/Walph.app/Contents/MacOS/Walph')
    removeError.code = 'EACCES'
    await expect(uninstall()).resolves.toBe(t().app.cli.removed(LAUNCHER))
    expect(runCollect.mock.calls[0][1]).toEqual(['-e', UNINSTALL_APPLESCRIPT, LAUNCHER])
  })

  it('removing with the password cancelled returns null', async () => {
    head.text = posixLauncher('/Applications/Walph.app/Contents/MacOS/Walph')
    removeError.code = 'EPERM'
    runCollect.mockResolvedValue({ code: 1, stderr: 'User canceled. (-128)', spawnError: null })
    await expect(uninstall()).resolves.toBeNull()
  })

  it('removing with an error that is not about permission does not use osascript', async () => {
    head.text = posixLauncher('/Applications/Walph.app/Contents/MacOS/Walph')
    removeError.code = 'EBUSY'
    await expect(uninstall()).rejects.toThrow(t().app.cli.removeFailed(LAUNCHER))
    expect(runCollect).not.toHaveBeenCalled()
  })
})

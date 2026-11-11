import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type * as OsModule from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'
import { makeRealTempDir } from '../testing/testEnv'
import { hasMarker } from '../cli/launcherScript'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const state = vi.hoisted(() => ({ home: '', packaged: true, temp: '' }))
const confirmDestructive = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return state.packaged
    },
    getPath: () => state.temp
  },
  ...harness.electronMock
}))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof OsModule>()),
  homedir: () => state.home
}))
vi.mock('../window/nativeUi', () => ({ confirmDestructive }))

import { registerCliHandlers } from './cli'

const posix = process.platform !== 'win32'

function setPlatform(platform: NodeJS.Platform): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
}

describe.skipIf(!posix)('walph terminal command (cli:install / cli:uninstall)', () => {
  let wc: FakeWebContents
  const launcher = (): string => join(state.home, '.local', 'bin', 'walph')
  const install = (): Promise<unknown> => harness.invoke('cli:install', wc)
  const uninstall = (): Promise<unknown> => harness.invoke('cli:uninstall', wc)

  beforeEach(() => {
    state.home = makeRealTempDir('walph-cli-home-')
    state.temp = makeRealTempDir('walph-cli-tmp-')
    state.packaged = true
    wc = fakeWebContents()
    harness.reset()
    registerCliHandlers()
    setPlatform('linux')
    vi.stubEnv('PATH', '/usr/bin')
    vi.stubEnv('APPIMAGE', '')
    confirmDestructive.mockResolvedValue(true)
  })

  afterEach(() => {
    rmSync(state.home, { recursive: true, force: true })
    rmSync(state.temp, { recursive: true, force: true })
  })

  it('registers exactly the two channels', () => {
    expect(harness.registered()).toEqual({ invoke: ['cli:install', 'cli:uninstall'], send: [] })
  })

  it('outside the installed app refuses to install and remove', async () => {
    state.packaged = false
    await expect(install()).rejects.toThrow(t().app.cli.notInstalledApp)
    await expect(uninstall()).rejects.toThrow(t().app.cli.notInstalledApp)
    expect(existsSync(launcher())).toBe(false)
  })

  it('installs the executable launcher, with the marker and the quoted executable, creating the folders', async () => {
    const message = (await install()) as string
    const text = readFileSync(launcher(), 'utf8')
    expect(hasMarker(text)).toBe(true)
    expect(text).toContain(process.execPath)
    expect(lstatSync(launcher()).mode & 0o777).toBe(0o755)
    expect(message).toContain(t().app.cli.installed(launcher()))
    expect(confirmDestructive).not.toHaveBeenCalled()
  })

  it('warns to add the folder to PATH only when it is not there', async () => {
    expect(await install()).toContain(t().app.cli.addToPath(dirname(launcher())))
    vi.stubEnv('PATH', `/usr/bin:${dirname(launcher())}/`)
    expect(await install()).toBe(t().app.cli.installed(launcher()))
  })

  it('AppImage: the launcher points to $APPIMAGE, not to the mount point', async () => {
    vi.stubEnv('APPIMAGE', '/home/u/Walph.AppImage')
    await install()
    expect(readFileSync(launcher(), 'utf8')).toContain('/home/u/Walph.AppImage')
  })

  it('a file that is not ours: asks first; declining returns null and leaves it untouched', async () => {
    mkdirSync(dirname(launcher()), { recursive: true })
    writeFileSync(launcher(), '#!/bin/sh\necho meu\n')
    confirmDestructive.mockResolvedValue(false)
    await expect(install()).resolves.toBeNull()
    expect(readFileSync(launcher(), 'utf8')).toBe('#!/bin/sh\necho meu\n')
    expect(confirmDestructive).toHaveBeenCalledWith(
      wc,
      expect.objectContaining({ message: t().app.cli.fileExists(launcher()), confirmLabel: t().app.cli.replace })
    )
  })

  it('a file that is not ours: confirming replaces it', async () => {
    mkdirSync(dirname(launcher()), { recursive: true })
    writeFileSync(launcher(), 'outro')
    await install()
    expect(hasMarker(readFileSync(launcher(), 'utf8'))).toBe(true)
  })

  it('our already installed launcher is rewritten without asking', async () => {
    await install()
    await install()
    expect(confirmDestructive).not.toHaveBeenCalled()
  })

  it('a symbolic link at the destination is replaced by the launcher, without writing to the link target', async () => {
    writeFileSync(join(state.home, 'target'), 'user content')
    mkdirSync(dirname(launcher()), { recursive: true })
    symlinkSync(join(state.home, 'target'), launcher())
    await install()
    expect(readFileSync(join(state.home, 'target'), 'utf8')).toBe('user content')
    expect(lstatSync(launcher()).isSymbolicLink()).toBe(false)
    expect(hasMarker(readFileSync(launcher(), 'utf8'))).toBe(true)
  })

  it('a write failure becomes a translated error with the path', async () => {
    mkdirSync(dirname(launcher()), { recursive: true })
    chmodSync(dirname(launcher()), 0o500)
    try {
      if (process.getuid?.() === 0) return
      await expect(install()).rejects.toThrow(t().app.cli.installFailed(launcher()))
    } finally {
      chmodSync(dirname(launcher()), 0o700)
    }
  })

  it('macOS outside Applications (mounted volume) refuses before touching the disk', async () => {
    setPlatform('darwin')
    vi.spyOn(process, 'execPath', 'get').mockReturnValue('/Volumes/Walph/Walph.app/Contents/MacOS/Walph')
    await expect(install()).rejects.toThrow(t().app.cli.moveToApplications)
    expect(confirmDestructive).not.toHaveBeenCalled()
  })

  it('removes only the launcher created by Walph', async () => {
    await install()
    await expect(uninstall()).resolves.toBe(t().app.cli.removed(launcher()))
    expect(existsSync(launcher())).toBe(false)
  })

  it('removing with nothing installed reports that it is not installed', async () => {
    await expect(uninstall()).rejects.toThrow(t().app.cli.notInstalled)
  })

  it('removing a file that is not ours refuses and keeps it', async () => {
    mkdirSync(dirname(launcher()), { recursive: true })
    writeFileSync(launcher(), 'outro')
    await expect(uninstall()).rejects.toThrow(t().app.cli.notOurs(launcher()))
    expect(readFileSync(launcher(), 'utf8')).toBe('outro')
  })

  it('a launcher path that is a folder is a read error when removing', async () => {
    mkdirSync(launcher(), { recursive: true })
    await expect(uninstall()).rejects.toThrow(t().app.cli.readFailed(launcher()))
  })
})

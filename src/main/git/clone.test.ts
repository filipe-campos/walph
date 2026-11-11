import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as spawnGroupModule from '../process/spawnGroup'
import { killAllSpawnedGroups, type GroupProcess } from '../process/spawnGroup'
import { makeTempRepo, useGitTestEnv } from '../testing/gitRepo'
import { fakeWebContents } from '../testing/fakeIpc'
import { isolatedGitConfigEnv, makeRealTempDir } from '../testing/testEnv'

const mocks = vi.hoisted(() => ({
  pickFolder: vi.fn(),
  networkEnv: vi.fn()
}))

vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: { handle: () => undefined, on: () => undefined } }))
vi.mock('../window/nativeUi', () => ({ pickFolder: mocks.pickFolder }))
vi.mock('./run', () => ({ networkEnv: mocks.networkEnv }))
vi.mock('../window/hiddenMode', () => ({ hiddenWindows: true }))

import { cancelClone, clone, hasClone } from './clone'

const posix = process.platform !== 'win32'

describe('clone', () => {
  let parent: string

  beforeEach(() => {
    parent = makeRealTempDir('walph-clone-')
    mocks.pickFolder.mockResolvedValue(parent)
    mocks.networkEnv.mockImplementation(() => Promise.resolve({ ...process.env, ...isolatedGitConfigEnv() }))
  })

  afterEach(() => {
    killAllSpawnedGroups()
    rmSync(parent, { recursive: true, force: true })
  })

  it('view reset during preparation: a new clone does not get through and the old folder goes away without touching the new one', async () => {
    let releaseEnv!: (env: NodeJS.ProcessEnv) => void
    mocks.networkEnv.mockReturnValueOnce(new Promise((resolve) => (releaseEnv = resolve)))
    const wc = fakeWebContents()
    const url = 'https://example.com/acme/repo.git'

    const first = clone(wc as never, url)
    await vi.waitFor(() => expect(mocks.networkEnv).toHaveBeenCalled())
    const destination = join(parent, 'repo')
    expect(existsSync(destination)).toBe(true)

    wc.emit('did-navigate')
    expect(existsSync(destination)).toBe(false)
    await expect(clone(wc as never, url)).rejects.toThrow()
    expect(mocks.pickFolder).toHaveBeenCalledTimes(1)

    releaseEnv({})
    await expect(first).resolves.toBeNull()
    expect(existsSync(destination)).toBe(false)
  })

  describe('with a local repository', () => {
    let source: string
    let restoreEnv: () => void
    let procs: GroupProcess[]
    let spawnArgs: Parameters<typeof spawnGroupModule.spawnGroup>[]

    beforeEach(() => {
      restoreEnv = useGitTestEnv()
      source = makeTempRepo({ 'README.md': 'hi\n' })
      procs = []
      spawnArgs = []
      const real = spawnGroupModule.spawnGroup
      vi.spyOn(spawnGroupModule, 'spawnGroup').mockImplementation((...args) => {
        spawnArgs.push(args)
        const proc = real(...args)
        procs.push(proc)
        return proc
      })
    })

    afterEach(() => {
      restoreEnv()
      rmSync(source, { recursive: true, force: true })
    })

    const sourceUrl = (): string => pathToFileURL(source).href

    it('clones, returns the created folder and reports progress to the view', async () => {
      const wc = fakeWebContents()
      const destination = await clone(wc as never, sourceUrl())
      expect(destination).toBe(join(parent, readdirSync(parent)[0]))
      expect(readFileSync(join(destination!, 'README.md'), 'utf8')).toBe('hi\n')
      expect(wc.send).toHaveBeenCalledWith(
        'git:cloneProgress',
        expect.objectContaining({ url: sourceUrl(), destination })
      )
      expect(hasClone(wc as never)).toBe(false)
    })

    it('calls git with "--" before the URL, only with the allowed transports and without a shell', async () => {
      await clone(fakeWebContents() as never, sourceUrl())
      const [file, args, options] = spawnArgs[0]
      expect(file).toBe('git')
      expect(args.slice(0, 3)).toEqual(['clone', '--progress', '--'])
      expect(args[3]).toBe(sourceUrl())
      expect(options).toMatchObject({ cwd: parent })
      expect(options?.env?.GIT_ALLOW_PROTOCOL).toBe('https:ssh:file')
      expect(options).not.toHaveProperty('shell')
    })

    it('git failure: rejects and deletes the partial folder it created itself', async () => {
      const missing = pathToFileURL(join(source, 'nao-existe')).href
      await expect(clone(fakeWebContents() as never, missing)).rejects.toThrow()
      expect(readdirSync(parent)).toEqual([])
    })

    it("an existing destination folder: refuses and leaves the user's content intact", async () => {
      const name = source.split(/[\\/]/).at(-1)!
      const existing = join(parent, name)
      mkdirSync(existing)
      writeFileSync(join(existing, 'mine.txt'), 'important')
      await expect(clone(fakeWebContents() as never, sourceUrl())).rejects.toThrow(name)
      expect(readFileSync(join(existing, 'mine.txt'), 'utf8')).toBe('important')
      expect(spawnArgs).toHaveLength(0)
    })

    it('dialog cancelled: nothing is created or run', async () => {
      mocks.pickFolder.mockResolvedValue(null)
      await expect(clone(fakeWebContents() as never, sourceUrl())).resolves.toBeNull()
      expect(readdirSync(parent)).toEqual([])
      expect(spawnArgs).toHaveLength(0)
    })

    describe.skipIf(!posix)('slow clone', () => {
      let slowConfigDir: string

      // The hook only works in protected config (a file): GIT_CONFIG_COUNT is ignored by the upload-pack of a file://
      // clone. A script and not an inline `sleep 30 #`, which git ends right away.
      const slow = (): void => {
        slowConfigDir = makeRealTempDir('walph-slow-')
        const config = join(slowConfigDir, 'config')
        const hook = join(slowConfigDir, 'hook.sh')
        writeFileSync(hook, '#!/bin/sh\nsleep 30\n', { mode: 0o755 })
        writeFileSync(config, `[uploadpack]\n\tpackObjectsHook = ${hook}\n`)
        mocks.networkEnv.mockImplementation(() =>
          Promise.resolve({ ...process.env, ...isolatedGitConfigEnv(), GIT_CONFIG_GLOBAL: config })
        )
      }

      afterEach(() => {
        killAllSpawnedGroups()
        if (slowConfigDir) rmSync(slowConfigDir, { recursive: true, force: true })
      })

      it('cancelClone midway kills git, resolves null and removes the partial folder', async () => {
        slow()
        const wc = fakeWebContents()
        const running = clone(wc as never, sourceUrl())
        await vi.waitFor(() => expect(procs).toHaveLength(1))
        expect(readdirSync(parent)).toHaveLength(1)
        cancelClone(wc as never)
        await expect(running).resolves.toBeNull()
        await procs[0].closed
        expect(readdirSync(parent)).toEqual([])
        expect(hasClone(wc as never)).toBe(false)
      })

      it('reloading the view midway kills git and removes the partial folder', async () => {
        slow()
        const wc = fakeWebContents()
        const running = clone(wc as never, sourceUrl())
        await vi.waitFor(() => expect(procs).toHaveLength(1))
        wc.emit('did-navigate')
        await expect(running).resolves.toBeNull()
        await procs[0].closed
        expect(readdirSync(parent)).toEqual([])
      })
    })
  })
})

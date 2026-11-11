import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'
import { git, makeTempRepo, useGitTestEnv } from '../testing/gitRepo'
import { makeRealTempDir } from '../testing/testEnv'

// pull/push/sync belong to the view: reload/close kills the git TREE (remote helper and children), not just git.

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
let windowRoot = ''

vi.mock('electron', () => ({
  ...harness.electronMock,
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() }
}))
vi.mock('../window/windows', () => ({ getWindowRoot: () => windowRoot, windowOf: () => null }))
vi.mock('../window/hiddenMode', () => ({ hiddenWindows: true }))

const posix = process.platform !== 'win32'

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(cond: () => boolean, ms = 8000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 40))
  }
  return cond()
}

const pidOf = (file: string): number => Number(readFileSync(file, 'utf8').trim())

describe.skipIf(!posix)('network git: view lifecycle', () => {
  let tmp: string
  let repo: string
  let helperPidFile: string
  let sleepPidFile: string
  let restoreEnv: () => void = () => undefined
  const stray: number[] = []

  beforeAll(async () => {
    tmp = makeRealTempDir('walph-gitnet-')
    helperPidFile = join(tmp, 'helper.pid')
    sleepPidFile = join(tmp, 'sleep.pid')
    // Remote helper that ignores SIGTERM and leaves a sleeping child: only a SIGKILL on the group takes both down.
    const bin = join(tmp, 'bin')
    mkdirSync(bin)
    const helper = join(bin, 'git-remote-walph')
    writeFileSync(
      helper,
      `#!/bin/sh\ntrap '' TERM\necho $$ > "${helperPidFile}"\nsleep 300 &\necho $! > "${sleepPidFile}"\nwait\n`
    )
    chmodSync(helper, 0o755)
    restoreEnv = useGitTestEnv()
    process.env.PATH = `${bin}${delimiter}${process.env.PATH}`
    repo = makeTempRepo({ 'a.txt': 'a\n' }, { message: 'init' })
    git(repo, 'remote', 'add', 'origin', 'walph://none')
    git(repo, 'config', 'branch.main.remote', 'origin')
    git(repo, 'config', 'branch.main.merge', 'refs/heads/main')
    windowRoot = repo
    const { registerGitHandlers } = await import('./git')
    registerGitHandlers()
  })

  afterEach(() => {
    for (const pid of stray.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already dead
      }
    }
    rmSync(helperPidFile, { force: true })
    rmSync(sleepPidFile, { force: true })
  })

  afterAll(() => {
    restoreEnv()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  async function startPull(
    wc: FakeWebContents
  ): Promise<{ helper: number; sleeper: number; result: Promise<unknown> }> {
    const result = harness.invoke('git:pull', wc, repo).then(
      () => 'ok',
      (err: Error) => err
    )
    expect(await until(() => existsSync(helperPidFile) && existsSync(sleepPidFile))).toBe(true)
    const helper = pidOf(helperPidFile)
    const sleeper = pidOf(sleepPidFile)
    stray.push(helper, sleeper)
    return { helper, sleeper, result }
  }

  it.each(['did-navigate', 'render-process-gone', 'destroyed'])(
    '%s kills git and the whole tree (helper and children)',
    async (event) => {
      const wc = fakeWebContents()
      const { helper, sleeper, result } = await startPull(wc)
      expect(isAlive(helper) && isAlive(sleeper)).toBe(true)

      wc.emit(event)

      expect(await until(() => !isAlive(helper) && !isAlive(sleeper))).toBe(true)
      expect(await result).toMatchObject({ message: expect.stringMatching(/cancelad/i) })
    },
    20_000
  )

  it('a remote failure is still classified in pt-BR and leaves the registry', async () => {
    git(repo, 'remote', 'set-url', 'origin', join(tmp, 'does-not-exist'))
    const wc = fakeWebContents()
    await expect(harness.invoke('git:pull', wc, repo)).rejects.toThrow('Remoto inválido ou não configurado.')
    git(repo, 'remote', 'set-url', 'origin', 'walph://none')
  })
})

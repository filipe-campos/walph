import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { evictionBlocker } from '../window/evictionGuards'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'

// One-shot docker commands (compose up, action, inspect…) belong to the view: reload/close kills the process and,
// while they run, the view does not hibernate.

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
let dockerFile = ''

vi.mock('electron', () => harness.electronMock)
vi.mock('../window/windows', () => ({ getSenderRoot: () => null }))
vi.mock('../settings/state', () => ({ getEffectiveSettings: () => ({ 'docker.path': '' }) }))
vi.mock('../docker/executable', () => ({
  resolveDockerSpec: () => Promise.resolve({ file: dockerFile, env: { ...process.env } })
}))

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

describe.skipIf(!posix)('docker: one-shot commands tied to the view', () => {
  let tmp: string
  let pidFile: string
  const stray: number[] = []

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'walph-docker-'))
    pidFile = join(tmp, 'pid')
    dockerFile = join(tmp, 'docker')
    // Every command sleeps: `info` hangs until someone kills it.
    writeFileSync(dockerFile, `#!/bin/sh\necho $$ > "${pidFile}"\nsleep 300\n`)
    chmodSync(dockerFile, 0o755)
    const { registerDockerHandlers } = await import('./docker')
    registerDockerHandlers()
  })

  afterEach(() => {
    for (const pid of stray.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already dead
      }
    }
    rmSync(pidFile, { force: true })
  })

  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  async function startInfo(wc: FakeWebContents): Promise<{ pid: number; result: Promise<unknown> }> {
    const result = harness.invoke('docker:info', wc)
    expect(await until(() => existsSync(pidFile))).toBe(true)
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    stray.push(pid)
    return { pid, result }
  }

  it.each(['did-navigate', 'render-process-gone', 'destroyed'])(
    '%s kills the running command and releases the hibernation guard',
    async (event) => {
      const wc = fakeWebContents()
      const { pid, result } = await startInfo(wc)
      expect(isAlive(pid)).toBe(true)
      expect(evictionBlocker(wc as never)).toBe('dockerCommand')

      wc.emit(event)

      expect(await until(() => !isAlive(pid))).toBe(true)
      await result
      expect(evictionBlocker(wc as never)).toBeNull()
    },
    20_000
  )

  it('with no running command the view can hibernate', () => {
    expect(evictionBlocker(fakeWebContents() as never)).toBeNull()
  })
})

describe.skipIf(!posix)('docker: output above the limit', () => {
  it('kills the process and fails with outputTooLarge instead of truncating', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'walph-docker-big-'))
    try {
      dockerFile = join(tmp, 'docker')
      writeFileSync(dockerFile, '#!/bin/sh\nhead -c 20000000 /dev/zero | tr "\\0" "a"\n')
      chmodSync(dockerFile, 0o755)
      if (!harness.registered().invoke.includes('docker:info')) (await import('./docker')).registerDockerHandlers()
      const result = await harness.invoke('docker:info', fakeWebContents())
      expect(result).toMatchObject({ ok: false, reason: 'outputTooLarge' })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 20_000)

  it('verbose stderr is not a failure: keeps only the tail and the command finishes normally', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'walph-docker-noisy-'))
    try {
      dockerFile = join(tmp, 'docker')
      writeFileSync(
        dockerFile,
        '#!/bin/sh\nhead -c 20000000 /dev/zero | tr "\\0" "a" >&2\necho \'{"ServerVersion":"27.0.0"}\'\n'
      )
      chmodSync(dockerFile, 0o755)
      if (!harness.registered().invoke.includes('docker:info')) (await import('./docker')).registerDockerHandlers()
      const result = await harness.invoke('docker:info', fakeWebContents())
      expect(result).not.toMatchObject({ reason: 'outputTooLarge' })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 20_000)
})

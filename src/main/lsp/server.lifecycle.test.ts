import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LspServerState } from '@shared/types'
import { killAllSpawnedGroups, type GroupProcess } from '../process/spawnGroup'
import * as spawnGroupModule from '../process/spawnGroup'
import { MAX_RESTARTS } from './backoff'
import type { Launch } from './launch'
import { LanguageServer, type ServerOptions } from './server'

const FAKE_SERVER = join(import.meta.dirname, 'fixtures', 'fakeServer.cjs')
const CRASH = ['-e', 'process.exit(3)']
const posix = process.platform !== 'win32'

interface Recorded {
  states: { state: LspServerState; message?: string | undefined }[]
  logs: string[]
  gaveUp: number
  launches: number
  procs: GroupProcess[]
}

let servers: LanguageServer[] = []

function build(
  launch: (() => Launch) | string[] | null,
  extra: Partial<ServerOptions> = {}
): { server: LanguageServer; rec: Recorded } {
  const rec: Recorded = { states: [], logs: [], gaveUp: 0, launches: 0, procs: [] }
  const real = spawnGroupModule.spawnGroup
  vi.spyOn(spawnGroupModule, 'spawnGroup').mockImplementation((...args) => {
    const proc = real(...args)
    rec.procs.push(proc)
    return proc
  })
  const server = new LanguageServer({
    id: 'lifecycle',
    root: process.cwd(),
    launch: () => {
      rec.launches++
      if (typeof launch === 'function') return launch()
      return { command: process.execPath, args: launch ?? [FAKE_SERVER], env: { ...process.env } }
    },
    host: {
      getDocuments: () => [],
      onState: (state, message) => void rec.states.push({ state, message }),
      onLog: (_level, message) => void rec.logs.push(message),
      onDiagnostics: () => undefined,
      applyEdit: () => Promise.resolve({ applied: false }),
      onGaveUp: () => void rec.gaveUp++,
      onRefresh: () => undefined
    },
    restartDelay: () => 0,
    shutdownTimeoutMs: 2000,
    ...extra
  })
  servers.push(server)
  return { server, rec }
}

const lastState = (rec: Recorded): LspServerState | undefined => rec.states.at(-1)?.state
const isRestarting = (rec: Recorded): boolean => rec.states.some((s) => s.state === 'starting' && s.message)
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  await Promise.all(servers.map((s) => s.stop()))
  servers = []
  killAllSpawnedGroups()
})

describe('LanguageServer: backoff and giving up', () => {
  it('a server that always crashes restarts MAX_RESTARTS times and then gives up with state error', async () => {
    const { server, rec } = build(CRASH)
    server.start()
    await vi.waitFor(() => expect(rec.gaveUp).toBe(1), { timeout: 15_000 })
    expect(rec.launches).toBe(1 + MAX_RESTARTS)
    expect(lastState(rec)).toBe('error')
    expect(rec.states.at(-1)?.message).toContain(String(MAX_RESTARTS))
    expect(server.ready).toBe(false)
    expect(server.runId).toBe(0)
  })

  it('the planned delay grows 1 s, 2 s, 4 s, 8 s, 16 s and goes through restartDelay', async () => {
    const planned: number[] = []
    const { server, rec } = build(CRASH, {
      restartDelay: (ms) => {
        planned.push(ms)
        return 0
      }
    })
    server.start()
    await vi.waitFor(() => expect(rec.gaveUp).toBe(1), { timeout: 15_000 })
    expect(planned).toEqual([1000, 2000, 4000, 8000, 16000])
  })

  it('after giving up, a new start() tries again with the count reset', async () => {
    const { server, rec } = build(CRASH)
    server.start()
    await vi.waitFor(() => expect(rec.gaveUp).toBe(1), { timeout: 15_000 })
    const before = rec.launches
    server.start()
    await vi.waitFor(() => expect(rec.gaveUp).toBe(2), { timeout: 15_000 })
    expect(rec.launches - before).toBe(1 + MAX_RESTARTS)
  })

  it('a missing executable does not retry: error and a single give-up', async () => {
    const missing = join(process.cwd(), 'missing-lsp-bin')
    const { server, rec } = build(() => ({ command: missing, args: [], env: { ...process.env } }))
    server.start()
    await vi.waitFor(() => expect(rec.gaveUp).toBe(1))
    await pause(150)
    expect(rec.launches).toBe(1)
    expect(rec.gaveUp).toBe(1)
    expect(lastState(rec)).toBe('error')
  })

  it('a launch that throws becomes an error without trying to start a process', () => {
    const { server, rec } = build(() => {
      throw new Error('server not installed')
    })
    server.start()
    expect(rec.gaveUp).toBe(1)
    expect(rec.procs).toHaveLength(0)
    expect(rec.states.at(-1)).toEqual({ state: 'error', message: 'server not installed' })
  })

  it('stop() while waiting for the restart cancels the timer: no new process starts', async () => {
    const { server, rec } = build(CRASH, { restartDelay: () => 200 })
    server.start()
    await vi.waitFor(() => expect(isRestarting(rec)).toBe(true))
    await server.stop()
    const launches = rec.launches
    await pause(500)
    expect(rec.launches).toBe(launches)
    expect(rec.gaveUp).toBe(0)
  })
})

describe('LanguageServer: quitNow', () => {
  it('while waiting for the restart it cancels the timer and start() no longer starts a process', async () => {
    const { server, rec } = build(CRASH, { restartDelay: () => 200 })
    server.start()
    await vi.waitFor(() => expect(isRestarting(rec)).toBe(true))
    server.quitNow()
    const launches = rec.launches
    server.start()
    await pause(500)
    expect(rec.launches).toBe(launches)
  })

  it.skipIf(!posix)('a live server marked by quitNow that dies is neither restarted nor reported', async () => {
    const { server, rec } = build(null)
    server.start()
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    const proc = rec.procs[0]
    server.quitNow()
    const states = rec.states.length
    killAllSpawnedGroups()
    await proc.closed
    await pause(200)
    expect(rec.launches).toBe(1)
    expect(rec.states).toHaveLength(states)
    expect(rec.gaveUp).toBe(0)
  })

  it.skipIf(!posix)('restart() after stop() does not resurrect the server', async () => {
    const { server, rec } = build(null)
    server.start()
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    await server.stop()
    await server.restart()
    expect(rec.launches).toBe(1)
    expect(server.ready).toBe(false)
  })
})

describe.skipIf(!posix)('LanguageServer with the fakeServer', () => {
  it('becomes ready, announces capabilities and changes the runId on every start', async () => {
    const { server, rec } = build(null)
    server.start()
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    expect(lastState(rec)).toBe('ready')
    expect(server.capabilities).not.toBeNull()
    const first = server.runId
    await server.restart()
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    expect(server.runId).toBeGreaterThan(first)
  })

  it('a force-killed process comes back on its own', async () => {
    const { server, rec } = build(null)
    server.start()
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    const first = server.runId
    rec.procs[0].child.kill('SIGKILL')
    await vi.waitFor(() => expect(server.runId).not.toBe(first))
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    expect(rec.logs.some((l) => l.includes('SIGKILL'))).toBe(true)
    expect(rec.launches).toBe(2)
  })

  it('stable uptime (60 s or more) resets the count: the delay goes back to the first restart one', async () => {
    const base = Date.now()
    let offset = 0
    vi.spyOn(Date, 'now').mockImplementation(() => base + offset)
    const planned: number[] = []
    const { server, rec } = build(null, {
      restartDelay: (ms) => {
        planned.push(ms)
        return 0
      }
    })
    server.start()
    for (let crash = 0; crash < 3; crash++) {
      await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
      offset += 61_000
      rec.procs.at(-1)!.child.kill('SIGKILL')
      await vi.waitFor(() => expect(rec.launches).toBe(crash + 2), { timeout: 15_000 })
    }
    expect(planned).toEqual([1000, 1000, 1000])
  })

  it('stop() ends the server process without reporting a give-up', async () => {
    const { server, rec } = build(null)
    server.start()
    await vi.waitFor(() => expect(server.ready).toBe(true), { timeout: 15_000 })
    const pid = rec.procs[0].child.pid!
    await server.stop()
    expect(server.ready).toBe(false)
    await vi.waitFor(() => expect(alive(pid)).toBe(false))
    expect(rec.gaveUp).toBe(0)
  })

  it('request without a ready server rejects without waiting', async () => {
    const { server } = build(null)
    await expect(server.request('textDocument/hover', {}, 1000, 'hover')).rejects.toThrow()
  })
})

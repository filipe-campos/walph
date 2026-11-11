import { afterEach, describe, expect, it, vi } from 'vitest'
import { killAllSpawnedGroups, type GroupProcess } from '../process/spawnGroup'
import * as spawnGroupModule from '../process/spawnGroup'
import { LanguageServer } from './server'
import { markAllLanguageServersQuitting } from './server'

const SCRIPT = 'process.stdin.resume(); setInterval(() => undefined, 1000)'

function newServer(): LanguageServer {
  return new LanguageServer({
    id: 'quit',
    root: process.cwd(),
    launch: () => ({ command: process.execPath, args: ['-e', SCRIPT], env: process.env }),
    host: {
      getDocuments: () => [],
      onState: () => undefined,
      onLog: () => undefined,
      onDiagnostics: () => undefined,
      applyEdit: () => Promise.resolve({ applied: false }),
      onGaveUp: () => undefined,
      onRefresh: () => undefined
    }
  })
}

describe('app exit with language servers', () => {
  afterEach(() => {
    killAllSpawnedGroups()
    vi.restoreAllMocks()
  })

  it('quitNow only marks: killAllSpawnedGroups does the killing, with no prior synchronous kill', async () => {
    let spawned: GroupProcess | undefined
    const real = spawnGroupModule.spawnGroup
    vi.spyOn(spawnGroupModule, 'spawnGroup').mockImplementation((...args) => (spawned = real(...args)))
    const server = newServer()
    server.start()
    const proc = spawned!
    const kill = vi.spyOn(proc, 'kill')

    server.quitNow()
    markAllLanguageServersQuitting()
    expect(kill).not.toHaveBeenCalled()
    expect(proc.exited).toBe(false)

    killAllSpawnedGroups()
    await proc.closed
    expect(proc.exited).toBe(true)
  })
})

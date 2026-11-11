import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { killAllSpawnedGroups, spawnGroup } from './spawnGroup'

const posix = process.platform !== 'win32'

// Parent that creates a long-lived grandchild and prints its pid.
const PARENT = `
const { spawn } = require('node:child_process')
const grand = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
console.log(grand.pid)
setInterval(() => {}, 1000)
`

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitDead(pid: number): Promise<void> {
  for (let i = 0; i < 100 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 50))
}

async function startTree(): Promise<{ proc: ReturnType<typeof spawnGroup>; grandPid: number }> {
  const proc = spawnGroup(process.execPath, ['-e', PARENT], { stdio: ['ignore', 'pipe', 'ignore'] })
  const [chunk] = (await once(proc.child.stdout!, 'data')) as [Buffer]
  return { proc, grandPid: Number(chunk.toString().trim()) }
}

describe.skipIf(!posix)('spawnGroup', () => {
  it('kill takes the grandchild along and sets exited', async () => {
    const { proc, grandPid } = await startTree()
    expect(proc.exited).toBe(false)
    expect(isAlive(grandPid)).toBe(true)
    proc.kill()
    await once(proc.child, 'exit')
    await waitDead(grandPid)
    expect(proc.exited).toBe(true)
    expect(isAlive(grandPid)).toBe(false)
    await expect(proc.closed).resolves.toBeUndefined()
  })

  it('killAllSpawnedGroups kills everything in the registry', async () => {
    const { proc, grandPid } = await startTree()
    killAllSpawnedGroups()
    await once(proc.child, 'exit')
    await waitDead(grandPid)
    expect(isAlive(grandPid)).toBe(false)
  })

  it('kill after exit does nothing', async () => {
    const proc = spawnGroup(process.execPath, ['-e', ''], { stdio: 'ignore' })
    await once(proc.child, 'exit')
    expect(proc.exited).toBe(true)
    expect(() => proc.kill()).not.toThrow()
  })
})

describe('spawnGroup (spawn error)', () => {
  it('missing executable: sets exited and delivers the error to the listener', async () => {
    const proc = spawnGroup('walph-command-that-does-not-exist', [], { stdio: 'ignore' })
    const [err] = (await once(proc.child, 'error')) as [NodeJS.ErrnoException]
    expect(err.code).toBe('ENOENT')
    expect(proc.exited).toBe(true)
    expect(() => proc.kill()).not.toThrow()
  })
})

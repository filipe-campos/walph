import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
const tree = vi.hoisted(() => ({
  killLiveTree: vi.fn(),
  killLiveTreeGracefully: vi.fn(),
  killLiveTreesSync: vi.fn(),
  sweepGroup: vi.fn(),
  terminateLiveTree: vi.fn()
}))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))
vi.mock('./tree', () => tree)

import { killAllSpawnedGroups, spawnGroup } from './spawnGroup'

function fakeChild(
  pid: number | undefined
): EventEmitter & { pid?: number | undefined; exitCode: null; signalCode: null } {
  return Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null })
}

describe('spawnGroup registry (will-quit)', () => {
  beforeEach(() => {
    killAllSpawnedGroups()
    Object.values(tree).forEach((fn) => fn.mockClear())
  })

  it('an error after the spawn (failed kill) keeps the process registered', () => {
    const child = fakeChild(4242)
    spawnMock.mockReturnValue(child)
    spawnGroup('x', [])
    child.emit('error', new Error('kill EPERM'))
    killAllSpawnedGroups()
    expect(tree.killLiveTreesSync).toHaveBeenCalledWith([child])
  })

  it('failure of the spawn itself (no pid) removes the process from the registry and resolves closed', async () => {
    const child = fakeChild(undefined)
    spawnMock.mockReturnValue(child)
    const proc = spawnGroup('x', [])
    child.emit('error', new Error('spawn x ENOENT'))
    await proc.closed
    killAllSpawnedGroups()
    expect(tree.killLiveTreesSync).toHaveBeenCalledWith([])
  })

  it('the forced ones go together in one batch and the graceful ones get an individual SIGTERM', () => {
    const a = fakeChild(1)
    const b = fakeChild(2)
    const c = fakeChild(3)
    spawnMock.mockReturnValueOnce(a).mockReturnValueOnce(b).mockReturnValueOnce(c)
    spawnGroup('a', [])
    spawnGroup('b', [], { graceful: true })
    spawnGroup('c', [])
    killAllSpawnedGroups()
    expect(tree.killLiveTreesSync).toHaveBeenCalledWith([a, c])
    expect(tree.terminateLiveTree).toHaveBeenCalledWith(b, true)
  })

  it('process already killed synchronously is not killed again', () => {
    const child = fakeChild(5)
    spawnMock.mockReturnValue(child)
    const proc = spawnGroup('x', [])
    proc.kill(true)
    killAllSpawnedGroups()
    expect(tree.killLiveTree).toHaveBeenCalledTimes(1)
    expect(tree.killLiveTreesSync).toHaveBeenCalledWith([])
  })

  it('closed resolves on exit', async () => {
    const child = fakeChild(6)
    spawnMock.mockReturnValue(child)
    const proc = spawnGroup('x', [])
    child.emit('exit', 0, null)
    await proc.closed
    expect(proc.exited).toBe(true)
    expect(tree.sweepGroup).toHaveBeenCalledWith(6)
  })
})

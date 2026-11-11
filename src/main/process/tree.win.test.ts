import type { ChildProcess } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSync = vi.hoisted(() => vi.fn())
const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawnSync, execFile }))

import { killLiveTree, killLiveTreesSync, terminateLiveTree } from './tree'

const child = (pid: number | undefined): ChildProcess => ({ pid, kill: vi.fn() }) as unknown as ChildProcess
const realPlatform = process.platform

describe('process tree on Windows (taskkill)', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    spawnSync.mockClear()
    execFile.mockClear()
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
  })

  it('killLiveTreesSync issues a single taskkill with all the pids', () => {
    killLiveTreesSync([child(10), child(undefined), child(20), child(30)])
    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(spawnSync.mock.calls[0]?.slice(0, 2)).toEqual([
      'taskkill',
      ['/pid', '10', '/pid', '20', '/pid', '30', '/T', '/F']
    ])
  })

  it('killLiveTreesSync without any pid does not call taskkill', () => {
    killLiveTreesSync([child(undefined)])
    killLiveTreesSync([])
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('killLiveTree forces (/F) and terminateLiveTree does not', () => {
    killLiveTree(child(7), true)
    terminateLiveTree(child(8), true)
    expect(spawnSync.mock.calls.map((c) => c[1])).toEqual([
      ['/pid', '7', '/T', '/F'],
      ['/pid', '8', '/T']
    ])
  })

  it('outside will-quit taskkill is asynchronous', () => {
    killLiveTree(child(9))
    expect(spawnSync).not.toHaveBeenCalled()
    expect(execFile.mock.calls[0]?.slice(0, 2)).toEqual(['taskkill', ['/pid', '9', '/T', '/F']])
  })
})

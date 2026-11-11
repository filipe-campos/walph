import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { SpawnOptions } from '@anthropic-ai/claude-agent-sdk'

const spawnGroup = vi.hoisted(() => vi.fn())
vi.mock('../process/spawnGroup', () => ({ spawnGroup }))

import { createClaudeSpawner, killProcess, type ClaudeProcess } from './spawn'

function fakeGroup() {
  const child = Object.assign(new EventEmitter(), { stderr: new PassThrough() })
  const group = { child, exited: false, kill: vi.fn() }
  spawnGroup.mockReturnValue(group)
  return group
}

const options = (signal = new AbortController().signal): SpawnOptions => ({
  command: 'claude',
  args: ['--x'],
  cwd: '/x',
  env: {},
  signal
})

describe('createClaudeSpawner', () => {
  it('starts through spawnGroup with the three pipes and hands the record to the caller', () => {
    const group = fakeGroup()
    let got: ClaudeProcess | undefined
    const child = createClaudeSpawner((proc) => (got = proc))(options())
    expect(spawnGroup).toHaveBeenCalledWith('claude', ['--x'], { cwd: '/x', env: {}, stdio: ['pipe', 'pipe', 'pipe'] })
    expect(child).toBe(group.child)
    expect(got?.child).toBe(group.child)
    group.exited = true
    expect(got?.exited).toBe(true)
  })

  it('keeps only the stderr tail', () => {
    const group = fakeGroup()
    let got!: ClaudeProcess
    createClaudeSpawner((proc) => (got = proc))(options())
    group.child.stderr.emit('data', 'a'.repeat(9000))
    group.child.stderr.emit('data', 'end')
    expect(got.stderr.length).toBe(8 * 1024)
    expect(got.stderr.endsWith('end')).toBe(true)
  })

  it('the SDK abort kills the tree', () => {
    const group = fakeGroup()
    const controller = new AbortController()
    createClaudeSpawner(() => undefined)(options(controller.signal))
    controller.abort()
    expect(group.kill).toHaveBeenCalledTimes(1)
  })

  it('killProcess delegates to the group', () => {
    const group = fakeGroup()
    let got!: ClaudeProcess
    createClaudeSpawner((proc) => (got = proc))(options())
    killProcess(got)
    expect(group.kill).toHaveBeenCalledTimes(1)
  })
})

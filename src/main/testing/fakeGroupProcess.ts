import { EventEmitter } from 'node:events'
import { vi, type Mock } from 'vitest'
import type { GroupProcess } from '../process/spawnGroup'

class FakeStream extends EventEmitter {
  paused = false
  destroyed = false
  private held: unknown[][] = []
  setEncoding = vi.fn<(encoding: string) => void>()
  pause = (): this => {
    this.paused = true
    return this
  }
  resume = (): this => {
    this.paused = false
    for (const args of this.held.splice(0)) super.emit('data', ...args)
    return this
  }
  destroy = vi.fn((): this => {
    this.destroyed = true
    this.held = []
    return this
  })

  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (this.destroyed) return false
    if (event === 'data' && this.paused) {
      this.held.push(args)
      return true
    }
    return super.emit(event, ...args)
  }
}

export interface FakeGroupProcess {
  proc: GroupProcess
  child: EventEmitter
  stdout: FakeStream
  stderr: FakeStream
  kill: Mock
}

export function fakeGroupProcess(): FakeGroupProcess {
  const child = new EventEmitter()
  const stdout = new FakeStream()
  const stderr = new FakeStream()
  Object.assign(child, { stdout, stderr })
  const kill = vi.fn()
  const proc = { child, exited: false, graceful: false, closed: Promise.resolve(), kill, terminate: vi.fn() }
  return { proc: proc as unknown as GroupProcess, child, stdout, stderr, kill }
}

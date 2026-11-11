import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdleController, LSP_INACTIVE_MS, LSP_NO_DOCS_MS } from './idlePolicy'

describe('IdleController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const docs = new Map<string, number>()
    const stopServer = vi.fn()
    const hibernate = vi.fn()
    const idle = new IdleController({ docCount: (id) => docs.get(id) ?? 0, stopServer, hibernate })
    return { docs, stopServer, hibernate, idle }
  }

  it('a server without documents shuts down after the deadline', () => {
    const { idle, stopServer } = setup()
    idle.serverTouched('ts')
    vi.advanceTimersByTime(LSP_NO_DOCS_MS - 1)
    expect(stopServer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(stopServer).toHaveBeenCalledWith('ts')
  })

  it('opening a document cancels the deadline; closing the last one rearms it', () => {
    const { idle, stopServer, docs } = setup()
    idle.serverTouched('ts')
    vi.advanceTimersByTime(LSP_NO_DOCS_MS - 10)
    docs.set('ts', 1)
    idle.serverTouched('ts')
    vi.advanceTimersByTime(LSP_NO_DOCS_MS * 2)
    expect(stopServer).not.toHaveBeenCalled()
    docs.set('ts', 0)
    idle.serverTouched('ts')
    vi.advanceTimersByTime(LSP_NO_DOCS_MS)
    expect(stopServer).toHaveBeenCalledTimes(1)
  })

  it('rechecks the documents when the deadline expires', () => {
    const { idle, stopServer, docs } = setup()
    idle.serverTouched('ts')
    docs.set('ts', 2)
    vi.advanceTimersByTime(LSP_NO_DOCS_MS)
    expect(stopServer).not.toHaveBeenCalled()
  })

  it('an inactive view hibernates after the deadline; reactivating before cancels it', () => {
    const { idle, hibernate } = setup()
    idle.setActive(false)
    vi.advanceTimersByTime(LSP_INACTIVE_MS - 1000)
    idle.setActive(true)
    vi.advanceTimersByTime(LSP_INACTIVE_MS * 2)
    expect(hibernate).not.toHaveBeenCalled()
    idle.setActive(false)
    vi.advanceTimersByTime(LSP_INACTIVE_MS)
    expect(hibernate).toHaveBeenCalledTimes(1)
  })

  it('use while inactive restarts the deadline; active ignores it', () => {
    const { idle, hibernate } = setup()
    idle.used()
    idle.setActive(false)
    vi.advanceTimersByTime(LSP_INACTIVE_MS - 1)
    idle.used()
    vi.advanceTimersByTime(LSP_INACTIVE_MS - 1)
    expect(hibernate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(hibernate).toHaveBeenCalledTimes(1)
  })

  it('dispose clears every timer', () => {
    const { idle, hibernate, stopServer } = setup()
    idle.serverTouched('ts')
    idle.setActive(false)
    idle.dispose()
    vi.advanceTimersByTime(LSP_INACTIVE_MS * 2)
    expect(hibernate).not.toHaveBeenCalled()
    expect(stopServer).not.toHaveBeenCalled()
  })
})

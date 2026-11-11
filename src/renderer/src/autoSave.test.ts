import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileTab } from './types/tabs'

// Fake store with the same shape as the real one (only what auto save reads), on top of a real zustand.
const saveTab = vi.fn<(id: string, options?: { onError?: (m: string) => void }) => Promise<boolean>>()
const notify = vi.fn()
let editListener: ((id: string) => void) | null = null

vi.mock('./store', async () => {
  const { create } = await import('zustand')
  const { subscribeWithSelector } = await import('zustand/middleware')
  type Shape = {
    tabs: unknown[]
    activeTabId: string | null
    confirmingSave: boolean
    settings: Record<string, unknown>
  }
  const useStore = create<Shape>()(
    subscribeWithSelector((): Shape => ({
      tabs: [],
      activeTabId: null,
      confirmingSave: false,
      settings: { 'files.autoSave': 'afterDelay', 'files.autoSaveDelay': 1000 }
    }))
  )
  const { createSubscribeDiff } = await import('./lib/reactions')
  return { useStore, get: useStore.getState, set: useStore.setState, subscribeDiff: createSubscribeDiff(useStore) }
})
vi.mock('./saveActions', () => ({ saveTab: (...a: Parameters<typeof saveTab>) => saveTab(...a) }))
vi.mock('./toasts', () => ({ notify: (m: string) => notify(m) }))
vi.mock('./components/editor/documentState', () => ({
  subscribeEdits: (l: (id: string) => void) => {
    editListener = l
    return () => void (editListener = null)
  }
}))

type StoreMock = {
  setState: (p: Record<string, unknown>) => void
  getState: () => { tabs: unknown[] }
}
let store: StoreMock
let stop: () => void

const fileTab = (id: string, extra: Partial<FileTab> = {}): FileTab =>
  ({ id, kind: 'file', path: `/p/${id}`, dirty: true, ...extra }) as FileTab

function setSettings(patch: Record<string, unknown>): void {
  const s = store as unknown as { getState: () => { settings: Record<string, unknown> } } & StoreMock
  store.setState({ settings: { ...s.getState().settings, ...patch } })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  saveTab.mockReset()
  saveTab.mockResolvedValue(true)
  notify.mockReset()
  const mod = await import('./store')
  store = mod.useStore
  store.setState({
    tabs: [],
    activeTabId: null,
    confirmingSave: false,
    settings: { 'files.autoSave': 'afterDelay', 'files.autoSaveDelay': 1000 }
  })
  const { startAutoSave } = await import('./autoSave')
  stop = startAutoSave()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('auto save after delay', () => {
  it('saves after the delay and restarts the countdown on every edit (debounce)', async () => {
    store.setState({ tabs: [fileTab('a')] })
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(800)
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(800)
    expect(saveTab).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(saveTab).toHaveBeenCalledTimes(1)
    expect(saveTab.mock.calls[0][0]).toBe('a')
  })

  it('never saves a conflicted, deleted, clean or diff tab', async () => {
    store.setState({
      tabs: [
        fileTab('conflicted', { conflict: true }),
        fileTab('deleted', { deleted: true }),
        fileTab('clean', { dirty: false }),
        { id: 'diff', kind: 'diff', path: '/p/diff' }
      ]
    })
    for (const id of ['conflicted', 'deleted', 'clean', 'diff']) editListener?.(id)
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveTab).not.toHaveBeenCalled()
  })

  it('cancels the timer of a tab that became clean before it fired', async () => {
    store.setState({ tabs: [fileTab('a')] })
    editListener?.('a')
    store.setState({ tabs: [fileTab('a', { dirty: false })] })
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveTab).not.toHaveBeenCalled()
  })

  it('does not write while the save dialog is open and resumes when it closes', async () => {
    store.setState({ tabs: [fileTab('a')], confirmingSave: true })
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveTab).not.toHaveBeenCalled()
    // "Cancel": the tab stays dirty and goes back to the queue.
    store.setState({ confirmingSave: false })
    await vi.advanceTimersByTimeAsync(1100)
    expect(saveTab).toHaveBeenCalledTimes(1)
  })

  it('warns only once when the write fails and warns again after a success', async () => {
    saveTab.mockImplementation(async (_id, options) => {
      options?.onError?.('failed')
      return false
    })
    store.setState({ tabs: [fileTab('a')] })
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(1100)
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(1100)
    expect(saveTab).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledTimes(1)

    saveTab.mockResolvedValue(true)
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(1100)
    saveTab.mockImplementation(async (_id, options) => {
      options?.onError?.('failed again')
      return false
    })
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(1100)
    expect(notify).toHaveBeenCalledTimes(2)
  })
})

describe('auto save on focus change', () => {
  beforeEach(() => setSettings({ 'files.autoSave': 'onFocusChange' }))

  it('switching tabs saves the previous one, without an edit timer', async () => {
    store.setState({ tabs: [fileTab('a'), fileTab('b')], activeTabId: 'a' })
    editListener?.('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveTab).not.toHaveBeenCalled()
    store.setState({ activeTabId: 'b' })
    await vi.advanceTimersByTimeAsync(0)
    expect(saveTab.mock.calls.map((c) => c[0])).toEqual(['a'])
  })

  it('losing window focus saves every dirty tab', async () => {
    store.setState({ tabs: [fileTab('a'), fileTab('b', { dirty: false }), fileTab('c', { conflict: true })] })
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saveTab.mock.calls.map((c) => c[0])).toEqual(['a'])
  })

  it('does not save on tab switch or blur while the dialog is open', async () => {
    store.setState({ tabs: [fileTab('a'), fileTab('b')], activeTabId: 'a', confirmingSave: true })
    store.setState({ activeTabId: 'b' })
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saveTab).not.toHaveBeenCalled()
  })
})

describe('off mode', () => {
  it('"off" schedules nothing', async () => {
    setSettings({ 'files.autoSave': 'off' })
    store.setState({ tabs: [fileTab('a')] })
    editListener?.('a')
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveTab).not.toHaveBeenCalled()
  })
})

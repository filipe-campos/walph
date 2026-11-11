import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type * as Controller from './hibernationController'

vi.mock('electron', () => ({}))

interface FakeWs {
  id: string
  lastActiveAt: number
  view: { webContents: FakeWc } | null
}
interface FakeWc {
  crashed: boolean
  loading: boolean
  isCrashed(): boolean
  isLoading(): boolean
}

const state = vi.hoisted(() => ({
  hosts: [] as { win: { id: number }; workspaces: unknown[]; activeId: string; closing: boolean }[],
  frozen: false,
  settings: { 'workspaces.maxLiveViews': 1, 'workspaces.hibernateAfterMinutes': 0 },
  blocker: vi.fn<(wc: WebContents) => 'unsaved' | null>(() => null),
  hibernate: vi.fn<(ws: unknown) => Promise<void>>(async () => {}),
  listener: null as null | ((e: { type: string; silent?: boolean }) => void),
  unsubscribe: vi.fn()
}))

vi.mock('../settings/state', () => ({
  getUserSettings: () => state.settings
}))
vi.mock('./evictionGuards', () => ({ evictionBlocker: state.blocker }))
vi.mock('./windows', () => ({
  allHosts: () => state.hosts,
  hibernateWorkspace: state.hibernate,
  isQuitFrozen: () => state.frozen,
  liveContents: (ws: FakeWs) => ws.view?.webContents ?? null,
  onWorkspaceEvent: (cb: (e: { type: string; silent?: boolean }) => void) => {
    state.listener = cb
    return state.unsubscribe
  }
}))

const wc = (over: Partial<FakeWc> = {}): FakeWc => ({
  crashed: false,
  loading: false,
  isCrashed() {
    return this.crashed
  },
  isLoading() {
    return this.loading
  },
  ...over
})
const ws = (id: string, lastActiveAt: number, view: FakeWc | null = wc()): FakeWs => ({
  id,
  lastActiveAt,
  view: view ? { webContents: view } : null
})
const setHost = (activeId: string, workspaces: FakeWs[], closing = false): void => {
  state.hosts = [{ win: { id: 1 }, workspaces, activeId, closing }]
}

let controller: typeof Controller

const activate = async (silent = false): Promise<void> => {
  state.listener?.({ type: 'activated', silent })
  await vi.advanceTimersByTimeAsync(1)
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  state.hosts = []
  state.frozen = false
  state.settings = { 'workspaces.maxLiveViews': 1, 'workspaces.hibernateAfterMinutes': 0 }
  state.blocker.mockReset().mockReturnValue(null)
  state.hibernate.mockReset().mockResolvedValue(undefined)
  state.listener = null
  state.unsubscribe.mockReset()
  controller = await import('./hibernationController')
  controller.startHibernation()
})

afterEach(() => {
  controller.stopHibernation()
  vi.useRealTimers()
})

describe('hibernationController', () => {
  it('hibernates the least recent view when the limit is exceeded after an activation', async () => {
    const a = ws('a', 100)
    const b = ws('b', 200)
    const c = ws('c', 300)
    setHost('c', [a, b, c])
    await activate()
    expect(state.hibernate).toHaveBeenCalledTimes(2)
    expect(state.hibernate.mock.calls.map(([w]) => (w as FakeWs).id)).toEqual(['a', 'b'])
  })

  it('does not hibernate the active view or the dormant ones', async () => {
    setHost('a', [ws('a', 1), ws('b', 2, null), ws('c', 3, null)])
    await activate()
    expect(state.hibernate).not.toHaveBeenCalled()
  })

  it('silent activation does not trigger the check', async () => {
    setHost('c', [ws('a', 1), ws('b', 2), ws('c', 3)])
    await activate(true)
    expect(state.hibernate).not.toHaveBeenCalled()
  })

  it('events that are not activations are ignored', async () => {
    setHost('c', [ws('a', 1), ws('b', 2), ws('c', 3)])
    state.listener?.({ type: 'changed' })
    await vi.advanceTimersByTimeAsync(1)
    expect(state.hibernate).not.toHaveBeenCalled()
  })

  it('groups several consecutive activations into a single round', async () => {
    setHost('b', [ws('a', 1), ws('b', 2)])
    state.listener?.({ type: 'activated', silent: false })
    state.listener?.({ type: 'activated', silent: false })
    await vi.advanceTimersByTimeAsync(1)
    expect(state.hibernate).toHaveBeenCalledTimes(1)
  })

  it('protects a view with a guard, a crashed renderer or still loading', async () => {
    state.blocker.mockImplementation((w) => ((w as unknown as FakeWc & { busy?: boolean }).busy ? 'unsaved' : null))
    const busy = Object.assign(wc(), { busy: true })
    setHost('d', [ws('a', 1, busy), ws('b', 2, wc({ crashed: true })), ws('c', 3, wc({ loading: true })), ws('d', 4)])
    await activate()
    expect(state.hibernate).not.toHaveBeenCalled()
  })

  it('hibernates due to inactivity even without exceeding the limit, on the 60 s timer', async () => {
    state.settings = { 'workspaces.maxLiveViews': 0, 'workspaces.hibernateAfterMinutes': 10 }
    const now = Date.now()
    setHost('b', [ws('a', now - 11 * 60_000), ws('b', now)])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(state.hibernate.mock.calls.map(([w]) => (w as FakeWs).id)).toEqual(['a'])
  })

  it('does nothing while the app is shutting down', async () => {
    state.frozen = true
    setHost('c', [ws('a', 1), ws('b', 2), ws('c', 3)])
    await activate()
    expect(state.hibernate).not.toHaveBeenCalled()
  })

  it('stops hibernating when the app freezes mid-round', async () => {
    setHost('c', [ws('a', 1), ws('b', 2), ws('c', 3)])
    state.hibernate.mockImplementationOnce(async () => {
      state.frozen = true
    })
    await activate()
    expect(state.hibernate).toHaveBeenCalledTimes(1)
  })

  it('ignores closing windows and does nothing without any loaded view', async () => {
    setHost('b', [ws('a', 1), ws('b', 2)], true)
    await activate()
    setHost('a', [ws('a', 1, null), ws('b', 2, null)])
    await activate()
    expect(state.hibernate).not.toHaveBeenCalled()
  })

  it('a failure hibernating one workspace does not stop the next ones', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setHost('c', [ws('a', 1), ws('b', 2), ws('c', 3)])
    state.hibernate.mockRejectedValueOnce(new Error('falhou'))
    await activate()
    expect(state.hibernate).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })

  it('activation during a round in progress runs again when it ends', async () => {
    const a = ws('a', 1)
    const b = ws('b', 2)
    const c = ws('c', 3)
    setHost('c', [a, b, c])
    let release: () => void = () => {}
    state.hibernate.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    await activate()
    expect(state.hibernate).toHaveBeenCalledTimes(1)
    setHost('c', [b, c, ws('d', 4)])
    await activate()
    expect(state.hibernate).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(1)
    expect(state.hibernate.mock.calls.map(([w]) => (w as FakeWs).id)).toContain('d')
  })

  it('startHibernation is idempotent and stopHibernation cancels the subscription and timer', async () => {
    controller.startHibernation()
    controller.stopHibernation()
    expect(state.unsubscribe).toHaveBeenCalledTimes(1)
    state.settings = { 'workspaces.maxLiveViews': 1, 'workspaces.hibernateAfterMinutes': 0 }
    setHost('b', [ws('a', 1), ws('b', 2)])
    await vi.advanceTimersByTimeAsync(180_000)
    expect(state.hibernate).not.toHaveBeenCalled()
  })
})

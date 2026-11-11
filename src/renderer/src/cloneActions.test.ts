import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { GitApi, GitCloneProgress } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'

const addWorkspace = vi.fn<(path: string) => Promise<void>>()
vi.mock('./workspaceActions', () => ({ addWorkspace: (path: string) => addWorkspace(path) }))

const clone = vi.fn<GitApi['clone']>()
const checkCloneUrl = vi.fn<GitApi['checkCloneUrl']>()
const { api, emit } = installFakeApi({
  git: { clone: (url) => clone(url), checkCloneUrl: (url) => checkCloneUrl(url) }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const { toastTitles } = await import('./test/toastTitles')
const actions = await import('./cloneActions')

const URL = 'https://example.com/acme/proj.git'
const toasts = () => useStore.getState().toasts
const progress = (patch: Partial<GitCloneProgress> = {}): GitCloneProgress => ({
  url: URL,
  destination: '/home/projects/proj',
  stage: 'Recebendo objetos',
  percent: 10,
  ...patch
})

let stopWatching: () => void

beforeEach(() => {
  resetStore()
  addWorkspace.mockResolvedValue(undefined)
  stopWatching = actions.watchClone()
  return () => stopWatching()
})

describe('cloneRepository', () => {
  it('clones, reports completion, opens the folder as a workspace and clears the state', async () => {
    clone.mockResolvedValue('/home/projects/proj')
    await actions.cloneRepository(URL, 'proj')
    expect(clone).toHaveBeenCalledWith(URL)
    expect(addWorkspace).toHaveBeenCalledWith('/home/projects/proj')
    expect(toasts().map((toast) => [toast.tone, toast.title])).toEqual([['done', t().git.clone.cloned('proj')]])
    expect(useStore.getState().clone).toBeNull()
  })

  it('keeps the clone in the state while git runs', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const running = actions.cloneRepository(URL, 'proj')
    expect(useStore.getState().clone).toEqual({ url: URL, name: 'proj', destination: null })
    gate.resolve(null)
    await running
    expect(useStore.getState().clone).toBeNull()
  })

  it('a second clone while one is running only notifies', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const first = actions.cloneRepository(URL, 'proj')
    await actions.cloneRepository('https://example.com/other.git', 'other')
    expect(clone).toHaveBeenCalledTimes(1)
    expect(toastTitles()).toEqual([t().git.clone.inProgress])
    gate.resolve(null)
    await first
  })

  it('cancelling the folder dialog shows no notice and opens no workspace', async () => {
    clone.mockResolvedValue(null)
    await actions.cloneRepository(URL, 'proj')
    expect(toasts()).toEqual([])
    expect(addWorkspace).not.toHaveBeenCalled()
  })

  it('cancelling during the clone notifies the cancellation and removes the progress toast', async () => {
    clone.mockImplementation(async () => {
      emit.git.onCloneProgress(progress())
      return null
    })
    await actions.cloneRepository(URL, 'proj')
    expect(toastTitles()).toEqual([t().git.clone.cancelled])
    expect(addWorkspace).not.toHaveBeenCalled()
  })

  it('a git failure reports the reason and clears the state', async () => {
    clone.mockRejectedValue(new Error('repository not found'))
    await actions.cloneRepository(URL, 'proj')
    expect(toastTitles()).toEqual(['repository not found'])
    expect(useStore.getState().clone).toBeNull()
  })

  it('a failure opening the workspace also clears the state', async () => {
    clone.mockResolvedValue('/p/proj')
    addWorkspace.mockRejectedValue(new Error('did not open'))
    await actions.cloneRepository(URL, 'proj')
    expect(toastTitles()).toContain('did not open')
    expect(useStore.getState().clone).toBeNull()
  })
})

describe('watchClone', () => {
  it('the first progress shows the toast with Cancel and stores the destination', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const running = actions.cloneRepository(URL, 'proj')
    emit.git.onCloneProgress(progress())
    expect(useStore.getState().clone?.destination).toBe('/home/projects/proj')
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toMatchObject({
      tone: 'info',
      title: t().git.clone.cloning('proj'),
      description: 'Recebendo objetos 10%',
      progress: 10
    })
    expect(toasts()[0].actions?.map((a) => a.label)).toEqual([t().common.cancel])
    gate.resolve(null)
    await running
  })

  it('later progress updates the same toast in place', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const running = actions.cloneRepository(URL, 'proj')
    emit.git.onCloneProgress(progress())
    const id = toasts()[0].id
    emit.git.onCloneProgress(progress({ stage: 'Resolvendo deltas', percent: 80 }))
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toMatchObject({ id, description: 'Resolvendo deltas 80%', progress: 80 })
    gate.resolve(null)
    await running
  })

  it('without a percentage the text uses an ellipsis and the bar is indeterminate', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const running = actions.cloneRepository(URL, 'proj')
    emit.git.onCloneProgress(progress({ stage: 'Conectando', percent: null }))
    expect(toasts()[0]).toMatchObject({ description: 'Conectando…', progress: null })
    gate.resolve(null)
    await running
  })

  it('the Cancel button asks main to cancel', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const running = actions.cloneRepository(URL, 'proj')
    emit.git.onCloneProgress(progress())
    toasts()[0].actions![0].onClick()
    expect(api.git.cancelClone).toHaveBeenCalledTimes(1)
    gate.resolve(null)
    await running
  })

  it('cancelling with no clone running does not call main', async () => {
    const gate = deferred<string | null>()
    clone.mockReturnValue(gate.promise)
    const running = actions.cloneRepository(URL, 'proj')
    emit.git.onCloneProgress(progress())
    const cancel = toasts()[0].actions![0].onClick
    gate.resolve(null)
    await running
    cancel()
    expect(api.git.cancelClone).not.toHaveBeenCalled()
  })

  it('progress for another URL or with no clone running is ignored', () => {
    emit.git.onCloneProgress(progress())
    expect(toasts()).toEqual([])
    useStore.setState({ clone: { url: URL, name: 'proj', destination: null } })
    emit.git.onCloneProgress(progress({ url: 'https://example.com/other.git' }))
    expect(toasts()).toEqual([])
    expect(useStore.getState().clone?.destination).toBeNull()
  })

  it('the title uses the destination folder name, or the given name when it is empty', () => {
    useStore.setState({ clone: { url: URL, name: 'requested-name', destination: null } })
    emit.git.onCloneProgress(progress({ destination: '' }))
    expect(toasts()[0].title).toBe(t().git.clone.cloning('requested-name'))
  })

  it('after stopping, progress is no longer listened to', () => {
    stopWatching()
    expect(() => emit.git.onCloneProgress(progress())).toThrow()
  })
})

describe('checkCloneUrl', () => {
  it('forwards the validation from main', async () => {
    checkCloneUrl.mockResolvedValue({ ok: true, name: 'proj' })
    await expect(actions.checkCloneUrl(URL)).resolves.toEqual({ ok: true, name: 'proj' })
    expect(checkCloneUrl).toHaveBeenCalledWith(URL)
  })
})

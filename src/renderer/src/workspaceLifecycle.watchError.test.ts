import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkspacesState } from '@shared/types'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const { useStore } = await import('./store')
const { handleWorkspaceChange, setWorkspaces } = await import('./workspaceLifecycle')

const titles = (): string[] => useStore.getState().toasts.map((t) => t.title)
// `unread` varies only so the state changes content (equal to the previous one is ignored).
const bar = (active: boolean, unread: number): WorkspacesState => ({
  selfId: 'a',
  workspaces: [
    { id: 'a', name: 'a', root: '/a', branch: null, status: 'idle', unread, active, dormant: false, muted: false }
  ]
})
const failure = { dirs: [], files: [], watchError: 'no watcher' }

beforeEach(() => {
  useStore.setState({ toasts: [], workspaces: null, viewActive: true })
})

describe('watcher failure', () => {
  it('an active view notifies right away', () => {
    handleWorkspaceChange(failure)
    expect(titles()).toEqual(['no watcher'])
  })

  it('a hidden view keeps the notification and shows it when it becomes active again', () => {
    setWorkspaces(bar(false, 1))
    handleWorkspaceChange(failure)
    expect(titles()).toEqual([])
    setWorkspaces(bar(true, 2))
    expect(titles()).toEqual(['no watcher'])
    setWorkspaces(bar(false, 3))
    setWorkspaces(bar(true, 4))
    expect(titles()).toEqual(['no watcher'])
  })
})

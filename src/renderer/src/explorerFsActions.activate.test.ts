import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const openFile = vi.fn()
vi.mock('./tabActions', () => ({ openFile }))

const { useStore } = await import('./store')
const { activateExplorerEntry } = await import('./explorerFsActions')

beforeEach(() => {
  openFile.mockReset()
  useStore.setState({ expanded: {}, dirs: { '/r/folder': [] } })
})

describe('activateExplorerEntry', () => {
  it('opens a file in preview without stealing the tree focus', () => {
    activateExplorerEntry({ name: 'a.ts', path: '/r/a.ts', isDirectory: false })
    expect(openFile).toHaveBeenCalledWith('/r/a.ts', undefined, { preview: true, preserveFocus: true })
  })

  it('toggles the folder instead of opening', async () => {
    activateExplorerEntry({ name: 'folder', path: '/r/folder', isDirectory: true })
    await vi.waitFor(() => expect(useStore.getState().expanded['/r/folder']).toBe(true))
    expect(openFile).not.toHaveBeenCalled()
  })
})

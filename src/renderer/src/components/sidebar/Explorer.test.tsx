import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExplorerAction } from '@shared/types'
import { installFakeApi } from '../../test/fakeApi'

const createFile = vi.fn<(dir: string, name: string) => Promise<string>>()
const showContextMenu = vi.fn<(isDir: boolean, options?: { canPaste?: boolean }) => Promise<ExplorerAction | null>>()
installFakeApi({
  fs: { createFile, showContextMenu, clipboardFiles: () => Promise.resolve([]) }
})

const { Explorer, InlineInput } = await import('./Explorer')
const { useStore } = await import('../../store')
const { resetStore } = await import('../../test/resetStore')

function mount(): { input: HTMLInputElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<InlineInput depth={0} initial="" folder={false} />))
  const input = host.querySelector('input')!
  return { input, unmount: () => act(() => root.unmount()) }
}

function key(input: HTMLInputElement, init: KeyboardEventInit): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
}

afterEach(() => {
  createFile.mockReset()
  showContextMenu.mockReset()
  document.body.innerHTML = ''
})

describe('InlineInput (Explorer)', () => {
  it('Enter during IME composition does not confirm', () => {
    createFile.mockResolvedValue('/r/ã')
    useStore.setState({ explorerEdit: { mode: 'newFile', dir: '/r' } })
    const { input, unmount } = mount()
    input.value = 'ã'
    key(input, { key: 'Enter', isComposing: true })
    expect(createFile).not.toHaveBeenCalled()
    expect(useStore.getState().explorerEdit).not.toBeNull()
    unmount()
  })

  it('Enter outside composition confirms only once (the unmount blur does not repeat)', () => {
    createFile.mockResolvedValue('/r/a.ts')
    useStore.setState({ explorerEdit: { mode: 'newFile', dir: '/r' } })
    const { input, unmount } = mount()
    input.value = 'a.ts'
    key(input, { key: 'Enter' })
    // A new edit already open: without the `done` guard, the blur of the old field would confirm again.
    useStore.setState({ explorerEdit: { mode: 'newFile', dir: '/r' } })
    void act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    unmount()
    expect(createFile).toHaveBeenCalledTimes(1)
  })
})

describe('Explorer: context menu', () => {
  let unmountExplorer: (() => void) | null = null

  afterEach(() => {
    unmountExplorer?.()
    unmountExplorer = null
    resetStore()
  })

  it.each([
    { where: 'row', selector: '.tree-row', isDir: false },
    { where: 'root', selector: '.tree', isDir: true }
  ])('native menu failure ($where) becomes a notice, without an unhandled rejection', async ({ selector, isDir }) => {
    showContextMenu.mockRejectedValue(new Error('view destroyed'))
    const entry = { name: 'a.ts', path: '/r/a.ts', isDirectory: false }
    useStore.setState({ root: '/r', dirs: { '/r': [entry] }, toasts: [], explorerEdit: null })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Explorer />))
    unmountExplorer = () => act(() => root.unmount())
    act(() => {
      host.querySelector(selector)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    await vi.waitFor(() =>
      expect(showContextMenu).toHaveBeenCalledWith(isDir, { canPaste: false, canCompare: false, selectionCount: 1 })
    )
    await vi.waitFor(() => expect(useStore.getState().toasts.map((t) => t.title)).toContain('view destroyed'))
  })
})

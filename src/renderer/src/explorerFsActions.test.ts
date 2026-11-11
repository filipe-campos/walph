import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirEntry, ExplorerAction, FsApi, GitApi } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { gitStatus } from './test/gitFixtures'
import { fileTab } from './test/tabFixtures'
import { toastTitles } from './test/toastTitles'

const confirm = vi.fn<(options: object) => Promise<boolean>>()
const trash = vi.fn<FsApi['trash']>()
const move = vi.fn<FsApi['move']>()
const copy = vi.fn<FsApi['copy']>()
const createFile = vi.fn<FsApi['createFile']>()
const createDir = vi.fn<FsApi['createDir']>()
const rename = vi.fn<FsApi['rename']>()
const readDir = vi.fn<FsApi['readDir']>()
const clipboardFiles = vi.fn<FsApi['clipboardFiles']>()
const writeClipboardFiles = vi.fn<FsApi['writeClipboardFiles']>()
const showContextMenu = vi.fn<FsApi['showContextMenu']>()
const pathForFile = vi.fn<(file: File) => string>()
const status = vi.fn<GitApi['status']>()
const { api } = installFakeApi({
  dialog: { confirm: (options) => confirm(options) },
  git: { status: (root) => status(root) },
  files: { pathForFile: (file) => pathForFile(file) },
  fs: {
    trash: (path) => trash(path),
    move: (path, dir) => move(path, dir),
    copy: (src, dir) => copy(src, dir),
    createFile: (dir, name) => createFile(dir, name),
    createDir: (dir, name) => createDir(dir, name),
    rename: (path, name) => rename(path, name),
    readDir: (dir) => readDir(dir),
    clipboardFiles: () => clipboardFiles(),
    writeClipboardFiles: (paths) => writeClipboardFiles(paths),
    showContextMenu: (isDirectory, options) => showContextMenu(isDirectory, options)
  }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const fs = await import('./explorerFsActions')

const state = () => useStore.getState()
const dir = (path: string): DirEntry => ({ name: path.split('/').pop()!, path, isDirectory: true })
const file = (path: string): DirEntry => ({ name: path.split('/').pop()!, path, isDirectory: false })

function chooseMenu(action: ExplorerAction | null): void {
  showContextMenu.mockResolvedValue(action)
}

beforeEach(() => {
  resetStore()
  useStore.setState({ root: '/r', dirs: { '/r': [dir('/r/src'), file('/r/a.ts')], '/r/src': [file('/r/src/b.ts')] } })
  confirm.mockResolvedValue(true)
  trash.mockResolvedValue(undefined)
  move.mockImplementation(async (path, target) => `${target}/${path.split('/').pop()}`)
  copy.mockImplementation(async (src, target) => `${target}/${src.split('/').pop()}`)
  readDir.mockResolvedValue([])
  clipboardFiles.mockResolvedValue([])
  writeClipboardFiles.mockResolvedValue(true)
  status.mockResolvedValue(gitStatus())
})

describe('deletePaths', () => {
  it('confirms, moves to the trash, closes the clean tab and rereads the folder', async () => {
    useStore.setState({
      tabs: [fileTab({ id: 'a', path: '/r/a.ts' })],
      editorGroups: [{ id: 'g', tabIds: ['a'], activeTabId: 'a' }],
      activeGroupId: 'g'
    })
    readDir.mockResolvedValue([dir('/r/src')])
    await expect(fs.deletePaths(['/r/a.ts'])).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }))
    expect(trash).toHaveBeenCalledWith('/r/a.ts')
    expect(state().tabs).toEqual([])
    expect(readDir).toHaveBeenCalledWith('/r')
    expect(state().dirs['/r']).toEqual([dir('/r/src')])
    expect(status).toHaveBeenCalled()
  })

  it('a dirty tab of the deleted file stays open, marked as deleted', async () => {
    useStore.setState({
      tabs: [fileTab({ id: 'a', path: '/r/a.ts', dirty: true })],
      editorGroups: [{ id: 'g', tabIds: ['a'], activeTabId: 'a' }],
      activeGroupId: 'g'
    })
    await fs.deletePaths(['/r/a.ts'])
    expect(state().tabs[0]).toMatchObject({ id: 'a', deleted: true })
  })

  it('several items: one plural confirmation, skips what is inside another and prunes the selection', async () => {
    useStore.setState({ explorerSelection: ['/r/src', '/r/src/b.ts', '/r/a.ts'], explorerSelected: '/r/a.ts' })
    await expect(fs.deletePaths(['/r/src', '/r/src/b.ts', '/r/a.ts'])).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Mover 2 itens para a lixeira?' })
    )
    expect(trash.mock.calls).toEqual([['/r/src'], ['/r/a.ts']])
    expect(state().explorerSelection).toEqual([])
  })

  it('cancelling the confirmation deletes nothing', async () => {
    confirm.mockResolvedValue(false)
    await expect(fs.deletePaths(['/r/a.ts'])).resolves.toBe(false)
    expect(trash).not.toHaveBeenCalled()
  })

  it('a trash failure notifies and returns false', async () => {
    trash.mockRejectedValue(new Error('permission denied'))
    await expect(fs.deletePaths(['/r/a.ts'])).resolves.toBe(false)
    expect(toastTitles()).toEqual(['permission denied'])
  })
})

describe('moveEntry', () => {
  it('moves, updates the path of open tabs and rereads both folders', async () => {
    useStore.setState({ tabs: [fileTab({ id: 'a', path: '/r/a.ts' })] })
    await expect(fs.moveEntry('/r/a.ts', '/r/src')).resolves.toBe('/r/src/a.ts')
    expect(state().tabs[0].path).toBe('/r/src/a.ts')
    expect(readDir).toHaveBeenCalledWith('/r')
    expect(readDir).toHaveBeenCalledWith('/r/src')
  })

  it('moving a folder carries the tabs inside it', async () => {
    useStore.setState({ tabs: [fileTab({ id: 'b', path: '/r/src/b.ts' })] })
    await fs.moveEntry('/r/src', '/r/other')
    expect(state().tabs[0].path).toBe('/r/other/src/b.ts')
  })

  it('a failure notifies and returns null without touching the tabs', async () => {
    useStore.setState({ tabs: [fileTab({ id: 'a', path: '/r/a.ts' })] })
    move.mockRejectedValue(new Error('already exists'))
    await expect(fs.moveEntry('/r/a.ts', '/r/src')).resolves.toBeNull()
    expect(toastTitles()).toEqual(['already exists'])
    expect(state().tabs[0].path).toBe('/r/a.ts')
  })
})

describe('explorerTargetDir', () => {
  it('without an open folder there is no target', () => {
    useStore.setState({ root: null })
    expect(fs.explorerTargetDir()).toBeNull()
  })

  it.each([
    ['no selection', null, '/r'],
    ['the root itself', '/r', '/r'],
    ['a folder', '/r/src', '/r/src'],
    ['a file', '/r/src/b.ts', '/r/src'],
    ['a root file', '/r/a.ts', '/r']
  ])('selection: %s', (_name, selected, expected) => {
    useStore.setState({ explorerSelected: selected })
    expect(fs.explorerTargetDir()).toBe(expected)
  })
})

describe('copy, cut and paste', () => {
  it('copy stores in the internal clipboard and writes the native one for Finder', () => {
    useStore.setState({ explorerSelected: '/r/a.ts' })
    fs.copySelection('copy')
    expect(state().explorerClipboard).toEqual({ paths: ['/r/a.ts'], mode: 'copy' })
    expect(writeClipboardFiles).toHaveBeenCalledWith(['/r/a.ts'])
  })

  it('cut does not write the native clipboard', () => {
    useStore.setState({ explorerSelected: '/r/a.ts' })
    fs.copySelection('cut')
    expect(state().explorerClipboard).toEqual({ paths: ['/r/a.ts'], mode: 'cut' })
    expect(writeClipboardFiles).not.toHaveBeenCalled()
  })

  it('copies the whole selection, without what is inside another item', () => {
    useStore.setState({ explorerSelection: ['/r/a.ts', '/r/src', '/r/src/b.ts'], explorerSelected: '/r/src/b.ts' })
    fs.copySelection('copy')
    expect(state().explorerClipboard).toEqual({ paths: ['/r/a.ts', '/r/src'], mode: 'copy' })
  })

  it('pasting several selects all pasted items', async () => {
    useStore.setState({ explorerSelection: ['/r/a.ts', '/r/src'], explorerSelected: '/r/src' })
    fs.copySelection('copy')
    await fs.pasteIntoExplorer('/r/dest')
    expect(state().explorerSelection).toEqual(['/r/dest/a.ts', '/r/dest/src'])
  })

  it('without a selection or with the root selected it does not copy', () => {
    fs.copySelection('copy')
    useStore.setState({ explorerSelected: '/r' })
    fs.copySelection('copy')
    expect(state().explorerClipboard).toBeNull()
  })

  it('pasting a copy duplicates into the target folder, expands, selects and reveals the pasted item', async () => {
    useStore.setState({ explorerSelected: '/r/a.ts' })
    fs.copySelection('copy')
    await fs.pasteIntoExplorer('/r/src')
    expect(copy).toHaveBeenCalledWith('/r/a.ts', '/r/src')
    expect(state().expanded['/r/src']).toBe(true)
    expect(state().explorerSelected).toBe('/r/src/a.ts')
    expect(state().requests.explorerReveal?.payload).toEqual({ path: '/r/src/a.ts' })
    expect(state().explorerClipboard).not.toBeNull()
  })

  it('pasting a cut moves and empties the internal clipboard', async () => {
    useStore.setState({ explorerSelected: '/r/a.ts' })
    fs.copySelection('cut')
    await fs.pasteIntoExplorer('/r/src')
    expect(move).toHaveBeenCalledWith('/r/a.ts', '/r/src')
    expect(copy).not.toHaveBeenCalled()
    expect(state().explorerClipboard).toBeNull()
  })

  it('without an explicit destination it pastes into the selection target', async () => {
    useStore.setState({ explorerSelected: '/r/a.ts' })
    fs.copySelection('copy')
    useStore.setState({ explorerSelected: '/r/src/b.ts' })
    await fs.pasteIntoExplorer()
    expect(copy).toHaveBeenCalledWith('/r/a.ts', '/r/src')
  })

  it('files copied outside the app after the internal copy beat the internal clipboard', async () => {
    useStore.setState({ explorerSelected: '/r/a.ts' })
    clipboardFiles.mockResolvedValue(['/old/x.txt'])
    fs.copySelection('copy')
    await vi.waitFor(() => expect(clipboardFiles).toHaveBeenCalled())
    clipboardFiles.mockResolvedValue(['/outside/new.txt'])
    await fs.pasteIntoExplorer('/r/src')
    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledWith('/outside/new.txt', '/r/src')
  })

  it('a native clipboard equal to the one at copy time does not replace the internal one', async () => {
    clipboardFiles.mockResolvedValue(['/old/x.txt'])
    useStore.setState({ explorerSelected: '/r/a.ts' })
    fs.copySelection('copy')
    await fs.pasteIntoExplorer('/r/src')
    expect(copy).toHaveBeenCalledExactlyOnceWith('/r/a.ts', '/r/src')
  })

  it('without an internal clipboard it pastes the native clipboard files', async () => {
    clipboardFiles.mockResolvedValue(['/outside/1.txt', '/outside/2.txt'])
    await fs.pasteIntoExplorer('/r')
    expect(copy.mock.calls).toEqual([
      ['/outside/1.txt', '/r'],
      ['/outside/2.txt', '/r']
    ])
  })

  it('nothing to paste touches nothing', async () => {
    await fs.pasteIntoExplorer('/r')
    expect(copy).not.toHaveBeenCalled()
    expect(move).not.toHaveBeenCalled()
    expect(readDir).not.toHaveBeenCalled()
  })

  it('without an open folder it does not paste', async () => {
    useStore.setState({ root: null, explorerClipboard: { paths: ['/r/a.ts'], mode: 'copy' } })
    await fs.pasteIntoExplorer('/r')
    expect(copy).not.toHaveBeenCalled()
  })

  it('a failing copy notifies and the others go on', async () => {
    clipboardFiles.mockResolvedValue(['/outside/bad.txt', '/outside/good.txt'])
    copy.mockImplementation(async (src, target) => {
      if (src.endsWith('bad.txt')) throw new Error('no space left')
      return `${target}/good.txt`
    })
    await fs.pasteIntoExplorer('/r')
    expect(toastTitles()).toEqual(['no space left'])
    expect(state().explorerSelected).toBe('/r/good.txt')
  })

  it('a folder switch while reading the clipboard cancels the paste', async () => {
    const gate = deferred<string[]>()
    clipboardFiles.mockReturnValue(gate.promise)
    const pasting = fs.pasteIntoExplorer('/r')
    useStore.setState({ root: '/other' })
    gate.resolve(['/outside/1.txt'])
    await pasting
    expect(copy).not.toHaveBeenCalled()
  })

  it('duplicate copies next to the item and selects the copy', async () => {
    useStore.setState({ explorerSelected: '/r/src/b.ts' })
    copy.mockResolvedValue('/r/src/b copy.ts')
    await fs.duplicateSelection()
    expect(copy).toHaveBeenCalledWith('/r/src/b.ts', '/r/src')
    expect(state().explorerSelected).toBe('/r/src/b copy.ts')
  })

  it('duplicating the root or without a selection does nothing', async () => {
    await fs.duplicateSelection()
    useStore.setState({ explorerSelected: '/r' })
    await fs.duplicateSelection()
    expect(copy).not.toHaveBeenCalled()
  })
})

describe('files dropped from the OS', () => {
  it('copies each file into the folder and skips those without a path', async () => {
    pathForFile.mockImplementation((f) =>
      f.name === 'x.txt' ? '/outside/x.txt' : f.name === 'y.txt' ? '/outside/y.txt' : ''
    )
    await fs.importDroppedFiles([new File([''], 'x.txt'), new File([''], 'virtual'), new File([''], 'y.txt')], '/r/src')
    expect(copy.mock.calls).toEqual([
      ['/outside/x.txt', '/r/src'],
      ['/outside/y.txt', '/r/src']
    ])
    expect(state().expanded['/r/src']).toBe(true)
  })

  it('without any valid path it does nothing', async () => {
    pathForFile.mockReturnValue('')
    await fs.importDroppedFiles([new File([''], 'v')], '/r/src')
    expect(copy).not.toHaveBeenCalled()
    expect(readDir).not.toHaveBeenCalled()
  })
})

describe('context menu', () => {
  it('reports whether there is something to paste (internal or native clipboard)', async () => {
    chooseMenu(null)
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(showContextMenu).toHaveBeenLastCalledWith(false, { canPaste: false, canCompare: false, selectionCount: 1 })
    clipboardFiles.mockResolvedValue(['/outside/x'])
    await fs.showExplorerContextMenu(dir('/r/src'))
    expect(showContextMenu).toHaveBeenLastCalledWith(true, { canPaste: true, canCompare: false, selectionCount: 1 })
    clipboardFiles.mockRejectedValue(new Error('x'))
    useStore.setState({ explorerClipboard: { paths: ['/r/a.ts'], mode: 'copy' } })
    await fs.showExplorerContextMenu(dir('/r/src'))
    expect(showContextMenu).toHaveBeenLastCalledWith(true, { canPaste: true, canCompare: false, selectionCount: 1 })
  })

  it('new file expands the folder and opens the edit row', async () => {
    chooseMenu('newFile')
    await fs.showExplorerContextMenu(dir('/r/src'))
    expect(state().expanded['/r/src']).toBe(true)
    expect(state().explorerEdit).toEqual({ mode: 'newFile', dir: '/r/src' })
  })

  it('new folder opens the edit in folder mode', async () => {
    chooseMenu('newFolder')
    await fs.showExplorerContextMenu(dir('/r/src'))
    expect(state().explorerEdit).toEqual({ mode: 'newFolder', dir: '/r/src' })
  })

  it('rename opens the item edit', async () => {
    chooseMenu('rename')
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(state().explorerEdit).toEqual({ mode: 'rename', path: '/r/a.ts' })
  })

  it('delete confirms and deletes', async () => {
    chooseMenu('delete')
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(trash).toHaveBeenCalledWith('/r/a.ts')
  })

  it('copy path and reveal call main', async () => {
    chooseMenu('copyPath')
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(api.fs.copyPath).toHaveBeenCalledWith('/r/a.ts')
    chooseMenu('reveal')
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(api.fs.reveal).toHaveBeenCalledWith('/r/a.ts')
  })

  it('the relative path is relative to the root, and the root becomes "."', async () => {
    chooseMenu('copyRelativePath')
    await fs.showExplorerContextMenu(file('/r/src/b.ts'))
    expect(api.fs.copyPath).toHaveBeenLastCalledWith('src/b.ts')
    await fs.showExplorerContextMenu(dir('/r'), true)
    expect(api.fs.copyPath).toHaveBeenLastCalledWith('.')
  })

  it('copy and cut from the menu use the clicked item', async () => {
    chooseMenu('cut')
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(state().explorerClipboard).toEqual({ paths: ['/r/a.ts'], mode: 'cut' })
  })

  it('pasting on a file pastes into its folder; on a folder, inside it', async () => {
    useStore.setState({ explorerClipboard: { paths: ['/r/a.ts'], mode: 'copy' } })
    chooseMenu('paste')
    await fs.showExplorerContextMenu(file('/r/src/b.ts'))
    expect(copy).toHaveBeenLastCalledWith('/r/a.ts', '/r/src')
    await fs.showExplorerContextMenu(dir('/r/src'))
    expect(copy).toHaveBeenLastCalledWith('/r/a.ts', '/r/src')
  })

  it('duplicate from the menu copies next to the item', async () => {
    chooseMenu('duplicate')
    await fs.showExplorerContextMenu(file('/r/src/b.ts'))
    expect(copy).toHaveBeenCalledWith('/r/src/b.ts', '/r/src')
  })

  it.each<ExplorerAction>(['rename', 'delete', 'cut', 'copy', 'duplicate'])(
    'on the root the "%s" action is ignored',
    async (action) => {
      chooseMenu(action)
      await fs.showExplorerContextMenu(dir('/r'), true)
      expect(state().explorerEdit).toBeNull()
      expect(state().explorerClipboard).toBeNull()
      expect(trash).not.toHaveBeenCalled()
      expect(copy).not.toHaveBeenCalled()
    }
  )

  it('on the root, new file still works', async () => {
    chooseMenu('newFile')
    await fs.showExplorerContextMenu(dir('/r'), true)
    expect(state().explorerEdit).toEqual({ mode: 'newFile', dir: '/r' })
  })

  it('a menu closed without a choice does nothing', async () => {
    chooseMenu(null)
    await fs.showExplorerContextMenu(file('/r/a.ts'))
    expect(state().explorerEdit).toBeNull()
  })
})

describe('submitEdit', () => {
  it('new file creates, rereads the folder and opens the file', async () => {
    useStore.setState({ explorerEdit: { mode: 'newFile', dir: '/r/src' } })
    createFile.mockResolvedValue('/r/src/new.ts')
    await fs.submitEdit('  new.ts  ')
    expect(createFile).toHaveBeenCalledWith('/r/src', 'new.ts')
    expect(readDir).toHaveBeenCalledWith('/r/src')
    expect(state().explorerEdit).toBeNull()
    expect(state().tabs.map((tab) => tab.path)).toEqual(['/r/src/new.ts'])
  })

  it('new folder creates and expands', async () => {
    useStore.setState({ explorerEdit: { mode: 'newFolder', dir: '/r' } })
    createDir.mockResolvedValue('/r/folder')
    await fs.submitEdit('folder')
    expect(createDir).toHaveBeenCalledWith('/r', 'folder')
    expect(state().expanded['/r/folder']).toBe(true)
  })

  it('rename updates the open tab and notifies the selection listeners', async () => {
    useStore.setState({
      explorerEdit: { mode: 'rename', path: '/r/a.ts' },
      tabs: [fileTab({ id: 'a', path: '/r/a.ts' })]
    })
    rename.mockResolvedValue('/r/z.ts')
    const { onExplorerRenamed } = await import('./explorerActions')
    const heard: string[][] = []
    const off = onExplorerRenamed((from, to) => heard.push([from, to]))
    await fs.submitEdit('z.ts')
    off()
    expect(rename).toHaveBeenCalledWith('/r/a.ts', 'z.ts')
    expect(state().tabs[0].path).toBe('/r/z.ts')
    expect(heard).toContainEqual(['/r/a.ts', '/r/z.ts'])
  })

  it('renaming to the same name does not call main', async () => {
    useStore.setState({ explorerEdit: { mode: 'rename', path: '/r/a.ts' } })
    await fs.submitEdit('a.ts')
    expect(rename).not.toHaveBeenCalled()
    expect(state().explorerEdit).toBeNull()
  })

  it('an empty name only closes the edit', async () => {
    useStore.setState({ explorerEdit: { mode: 'newFile', dir: '/r' } })
    await fs.submitEdit('   ')
    expect(createFile).not.toHaveBeenCalled()
    expect(state().explorerEdit).toBeNull()
  })

  it('without an edit in progress it does nothing', async () => {
    await fs.submitEdit('x')
    expect(createFile).not.toHaveBeenCalled()
  })

  it('a main failure reports the reason', async () => {
    useStore.setState({ explorerEdit: { mode: 'newFile', dir: '/r' } })
    createFile.mockRejectedValue(new Error('invalid name'))
    await fs.submitEdit('a/b')
    expect(toastTitles()).toEqual(['invalid name'])
    expect(state().tabs).toEqual([])
  })
})

describe('simple shortcuts', () => {
  it('revealPath and copyPathToClipboard forward to main', () => {
    fs.revealPath('/r/a.ts')
    fs.copyPathToClipboard('/r/a.ts')
    expect(api.fs.reveal).toHaveBeenCalledWith('/r/a.ts')
    expect(api.fs.copyPath).toHaveBeenCalledWith('/r/a.ts')
  })
})

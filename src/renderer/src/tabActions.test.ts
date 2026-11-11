import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsApi, TabAction, UnsavedChoice } from '@shared/types'
import { installFakeApi } from './test/fakeApi'
import { fileTab } from './test/tabFixtures'
import { toastTitles } from './test/toastTitles'

const confirmUnsaved = vi.fn<(names: string[]) => Promise<UnsavedChoice>>()
const showContextMenu = vi.fn<(options: object) => Promise<TabAction | null>>()
const readText = vi.fn<FsApi['readText']>()
const { api } = installFakeApi({
  fs: { readText: (path, encoding) => readText(path, encoding) },
  dialog: { confirmUnsaved: (names) => confirmUnsaved(names) },
  tabs: { showContextMenu: (options) => showContextMenu(options) }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const documentState = await import('./components/editor/documentState')
const { forgetDocument } = await import('./components/editor/documentStore')

const {
  openFile,
  openImage,
  openDiff,
  openCommitDiff,
  pinTab,
  closeEditorGroup,
  closeTab,
  closeTabs,
  closeOtherTabs,
  closeTabsToRight,
  closeSavedTabs,
  activateTab,
  moveTab,
  splitEditor,
  focusOtherEditorGroup,
  activateGroup,
  resizeEditorGroups,
  focusEditorGroupAt,
  focusEditorGroupToward,
  moveActiveTabToAdjacentGroup,
  joinAllEditorGroups,
  dropTabOnGroup,
  consumePreserveFocus,
  openMarkdownPreview,
  showTabMenu,
  activeTab,
  activeLoadedFileTab,
  startTabReactions
} = await import('./tabActions')

const state = () => useStore.getState()
const paths = (groupIndex = 0): (string | undefined)[] =>
  state().editorGroups[groupIndex].tabIds.map((id) => state().tabs.find((tab) => tab.id === id)?.path)
const idOf = (path: string): string => state().tabs.find((tab) => tab.path === path)!.id

let stopReactions: () => void

beforeEach(() => {
  resetStore()
  useStore.setState({ root: '/r' })
  confirmUnsaved.mockReset().mockResolvedValue('save')
  showContextMenu.mockReset().mockResolvedValue(null)
  readText.mockResolvedValue({ text: '', encoding: 'utf8' })
  stopReactions = startTabReactions()
})

afterEach(() => {
  stopReactions()
  for (const id of [...documentState.states.keys()]) forgetDocument(id)
})

describe('openFile', () => {
  it('opens a pinned tab and activates it in the current group', () => {
    openFile('/r/a.ts')
    expect(paths()).toEqual(['/r/a.ts'])
    expect(activeTab()).toMatchObject({ path: '/r/a.ts', kind: 'file', preview: false })
  })

  it('the next preview replaces the current preview of the same group (new id, the old one is gone)', () => {
    openFile('/r/a.ts', undefined, { preview: true })
    const oldId = idOf('/r/a.ts')
    openFile('/r/b.ts', undefined, { preview: true })
    expect(paths()).toEqual(['/r/b.ts'])
    expect(state().tabs.some((tab) => tab.id === oldId)).toBe(false)
  })

  it('the preview replaces in the same place, without touching the pinned tabs', () => {
    openFile('/r/pinned1.ts')
    openFile('/r/prev.ts', undefined, { preview: true })
    openFile('/r/pinned2.ts')
    openFile('/r/new.ts', undefined, { preview: true })
    expect(paths()).toEqual(['/r/pinned1.ts', '/r/new.ts', '/r/pinned2.ts'])
  })

  it('the preview does not replace a pinned tab', () => {
    openFile('/r/a.ts')
    openFile('/r/b.ts', undefined, { preview: true })
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts'])
  })

  it('the preview of an already open file reuses the tab without pinning or duplicating it', () => {
    openFile('/r/a.ts', undefined, { preview: true })
    const id = idOf('/r/a.ts')
    openFile('/r/a.ts', undefined, { preview: true })
    expect(state().tabs).toHaveLength(1)
    expect(idOf('/r/a.ts')).toBe(id)
    expect(activeTab()).toMatchObject({ preview: true })
  })

  it('opening without preview pins the tab that was in preview', () => {
    openFile('/r/a.ts', undefined, { preview: true })
    openFile('/r/a.ts')
    expect(activeTab()).toMatchObject({ path: '/r/a.ts', preview: false })
  })

  it('the preview replaces the copy of the preview tab only in the active group; the other group keeps it', () => {
    openFile('/r/a.ts', undefined, { preview: true })
    splitEditor()
    openFile('/r/b.ts', undefined, { preview: true })
    expect(paths(0)).toEqual(['/r/a.ts'])
    expect(paths(1)).toEqual(['/r/b.ts'])
  })

  it('the preview of another group is not taken by opening a preview in this group', async () => {
    openFile('/r/p.ts', undefined, { preview: true })
    splitEditor()
    openFile('/r/x.ts')
    await closeTab(idOf('/r/p.ts'), state().activeGroupId)
    openFile('/r/y.ts', undefined, { preview: true })
    expect(paths(0)).toEqual(['/r/p.ts'])
    expect(paths(1)).toEqual(['/r/x.ts', '/r/y.ts'])
  })

  it('the position to reveal is bound to the opened tab id', () => {
    openFile('/r/a.ts', { line: 3, column: 2, length: 4 })
    expect(state().reveal).toEqual({ tabId: idOf('/r/a.ts'), line: 3, column: 2, length: 4 })
  })

  it('restores the maximized panel and goes back to the editor screen', () => {
    useStore.setState({ panelMaximized: true, screen: 'containers' })
    openFile('/r/a.ts')
    expect(state()).toMatchObject({ panelMaximized: false, screen: 'workbench' })
  })

  it('records the file in the folder recents, but not a file outside it', () => {
    openFile('/r/inside.ts')
    openFile('/outside/x.ts')
    expect(state().recentFiles).toEqual(['/r/inside.ts'])
  })

  describe('preserveFocus', () => {
    it('applies only once to the opened tab', () => {
      openFile('/r/a.ts', undefined, { preserveFocus: true })
      const id = idOf('/r/a.ts')
      expect(consumePreserveFocus(id)).toBe(true)
      expect(consumePreserveFocus(id)).toBe(false)
    })

    it('showing another tab consumes the old request', () => {
      openFile('/r/a.ts', undefined, { preserveFocus: true })
      const id = idOf('/r/a.ts')
      consumePreserveFocus('other')
      expect(consumePreserveFocus(id)).toBe(false)
    })

    it('with a position to reveal the focus goes to the editor', () => {
      openFile('/r/a.ts', { line: 1, column: 1, length: 0 }, { preserveFocus: true })
      expect(consumePreserveFocus(idOf('/r/a.ts'))).toBe(false)
    })
  })

  describe('images and SVG', () => {
    it('an image opens in the viewer, not in the editor', () => {
      openFile('/r/photo.png')
      expect(activeTab()).toMatchObject({ kind: 'image', path: '/r/photo.png' })
    })

    it('opening the same image twice reuses the tab', () => {
      openImage('/r/photo.png')
      openImage('/r/photo.png')
      expect(state().tabs).toHaveLength(1)
    })

    it('SVG opens as an image; with a position to reveal or asText it opens as text', () => {
      openFile('/r/i.svg')
      expect(activeTab()).toMatchObject({ kind: 'image' })
      openFile('/r/j.svg', { line: 1, column: 1, length: 0 })
      expect(activeTab()).toMatchObject({ kind: 'file', path: '/r/j.svg' })
      openFile('/r/k.svg', undefined, { asText: true })
      expect(activeTab()).toMatchObject({ kind: 'file', path: '/r/k.svg' })
    })

    it('PNG with a position to reveal stays an image', () => {
      openFile('/r/photo.png', { line: 1, column: 1, length: 0 })
      expect(activeTab()).toMatchObject({ kind: 'image' })
    })
  })
})

describe('diff and pin', () => {
  it('openDiff reuses the diff of the same file and the same side (staged)', () => {
    openDiff('/r/a.ts', false)
    openDiff('/r/a.ts', false)
    openDiff('/r/a.ts', true)
    expect(state().tabs.filter((tab) => tab.kind === 'diff')).toHaveLength(2)
  })

  it('openCommitDiff tells commits and files apart', () => {
    const file = { path: '/r/a.ts', status: 'M' } as never
    openCommitDiff('h1', file)
    openCommitDiff('h2', file)
    expect(state().tabs).toHaveLength(2)
    expect(state().tabs[0]).toMatchObject({ kind: 'diff', commit: { hash: 'h1' } })
  })

  it('pinTab pins a preview tab', () => {
    openFile('/r/a.ts', undefined, { preview: true })
    pinTab(idOf('/r/a.ts'))
    expect(activeTab()).toMatchObject({ preview: false })
  })
})

describe('closeEditorGroup', () => {
  function twoGroups(): void {
    openFile('/r/a.ts')
    openFile('/r/b.ts')
    splitEditor()
    openFile('/r/c.ts')
  }

  it('with a single group does nothing', async () => {
    openFile('/r/a.ts')
    await closeEditorGroup()
    expect(state().editorGroups).toHaveLength(1)
    expect(paths()).toEqual(['/r/a.ts'])
  })

  it('closes the active group: drops the tabs only it has and keeps the ones the other group shows', async () => {
    twoGroups()
    await closeEditorGroup()
    expect(state().editorGroups).toHaveLength(1)
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts'])
    expect(state().tabs.map((tab) => tab.path)).not.toContain('/r/c.ts')
  })

  it('accepts the id of a group that is not the active one', async () => {
    twoGroups()
    const first = state().editorGroups[0].id
    await closeEditorGroup(first)
    expect(state().editorGroups.map((g) => g.id)).not.toContain(first)
    expect(paths()).toEqual(['/r/b.ts', '/r/c.ts'])
    expect(state().tabs.map((tab) => tab.path)).not.toContain('/r/a.ts')
  })

  it('a missing group id does nothing', async () => {
    twoGroups()
    await closeEditorGroup('nope')
    expect(state().editorGroups).toHaveLength(2)
  })

  it('a dirty tab only in this group asks; cancel keeps the group', async () => {
    twoGroups()
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => (tab.path === '/r/c.ts' ? { ...tab, dirty: true } : tab)) }))
    confirmUnsaved.mockResolvedValue('cancel')
    await closeEditorGroup()
    expect(confirmUnsaved).toHaveBeenCalledWith(['c.ts'])
    expect(state().editorGroups).toHaveLength(2)
  })

  it('"Don\'t Save" closes the group discarding the dirty tab', async () => {
    twoGroups()
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => (tab.path === '/r/c.ts' ? { ...tab, dirty: true } : tab)) }))
    confirmUnsaved.mockResolvedValue('dontSave')
    await closeEditorGroup()
    expect(state().editorGroups).toHaveLength(1)
  })

  it('a dirty tab the other group also shows does not ask', async () => {
    openFile('/r/a.ts')
    splitEditor()
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => ({ ...tab, dirty: true })) }))
    await closeEditorGroup()
    expect(confirmUnsaved).not.toHaveBeenCalled()
    expect(state().editorGroups).toHaveLength(1)
  })

  it('a group that disappeared while the dialog was open is not closed again', async () => {
    twoGroups()
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => (tab.path === '/r/c.ts' ? { ...tab, dirty: true } : tab)) }))
    const target = state().activeGroupId
    confirmUnsaved.mockImplementation(async () => {
      await closeEditorGroup(state().editorGroups.find((g) => g.id !== target)!.id)
      return 'dontSave'
    })
    await closeEditorGroup(target)
    expect(state().editorGroups).toHaveLength(1)
    expect(state().editorGroups[0].id).toBe(target)
  })
})

describe('closing tabs', () => {
  beforeEach(() => {
    for (const name of ['a', 'b', 'c', 'd']) openFile(`/r/${name}.ts`)
  })

  it('closeTab closes the tab and activates the neighbor', async () => {
    await closeTab(idOf('/r/d.ts'))
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts', '/r/c.ts'])
    expect(activeTab()?.path).toBe('/r/c.ts')
  })

  it('closeTab of a missing tab does nothing', async () => {
    await closeTab('nope')
    expect(state().tabs).toHaveLength(4)
  })

  it('closeOtherTabs keeps only the chosen one', async () => {
    await closeOtherTabs(idOf('/r/b.ts'))
    expect(paths()).toEqual(['/r/b.ts'])
  })

  it('closeTabsToRight closes the ones to the right', async () => {
    await closeTabsToRight(idOf('/r/b.ts'))
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts'])
  })

  it('closeSavedTabs keeps the dirty ones and closes the diff and clean ones', async () => {
    openDiff('/r/a.ts', false)
    useStore.setState((s) => ({
      tabs: s.tabs.map((tab) => (tab.path === '/r/b.ts' && tab.kind === 'file' ? { ...tab, dirty: true } : tab))
    }))
    await closeSavedTabs()
    expect(paths()).toEqual(['/r/b.ts'])
  })

  it('several dirty tabs ask only once with all the names', async () => {
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => ({ ...tab, dirty: true })) }))
    confirmUnsaved.mockResolvedValue('dontSave')
    await closeTabs(state().tabs.map((tab) => tab.id))
    expect(confirmUnsaved).toHaveBeenCalledTimes(1)
    expect(confirmUnsaved).toHaveBeenCalledWith(['a.ts', 'b.ts', 'c.ts', 'd.ts'])
    expect(state().tabs).toHaveLength(0)
  })

  it('canceling the prompt keeps all the tabs', async () => {
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => ({ ...tab, dirty: true })) }))
    confirmUnsaved.mockResolvedValue('cancel')
    await closeTabs(state().tabs.map((tab) => tab.id))
    expect(state().tabs).toHaveLength(4)
  })

  it('with groupId a tab the other group shows stays open and does not ask', async () => {
    splitEditor()
    const second = state().activeGroupId
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => ({ ...tab, dirty: true })) }))
    await closeTabs([idOf('/r/d.ts')], second)
    expect(confirmUnsaved).not.toHaveBeenCalled()
    expect(state().editorGroups).toHaveLength(1)
    expect(paths(0)).toContain('/r/d.ts')
  })
})

describe('showTabMenu', () => {
  beforeEach(() => {
    for (const name of ['a', 'b', 'c']) openFile(`/r/${name}.ts`)
  })

  it('tells the menu what exists around the tab', async () => {
    showContextMenu.mockResolvedValue(null)
    await showTabMenu(idOf('/r/c.ts'))
    expect(showContextMenu).toHaveBeenCalledWith({
      hasOthers: true,
      hasRight: false,
      hasSaved: true,
      isFile: true,
      canCompare: false
    })
    useStore.setState((s) => ({ tabs: s.tabs.map((tab) => ({ ...tab, dirty: true })), compareSelection: '/r/c.ts' }))
    await showTabMenu(idOf('/r/a.ts'))
    expect(showContextMenu).toHaveBeenLastCalledWith({
      hasOthers: true,
      hasRight: true,
      hasSaved: false,
      isFile: true,
      canCompare: true
    })
  })

  it('select for compare and compare with selected open the comparison', async () => {
    showContextMenu.mockResolvedValue('selectForCompare')
    await showTabMenu(idOf('/r/a.ts'))
    expect(state().compareSelection).toBe('/r/a.ts')
    showContextMenu.mockResolvedValue('compareWithSelected')
    await showTabMenu(idOf('/r/b.ts'))
    expect(activeTab()).toMatchObject({
      kind: 'diff',
      path: '/r/b.ts',
      compare: { left: { path: '/r/a.ts' }, right: { path: '/r/b.ts' } }
    })
  })

  it.each<[TabAction, string[]]>([
    ['close', ['/r/a.ts', '/r/c.ts']],
    ['closeOthers', ['/r/b.ts']],
    ['closeRight', ['/r/a.ts', '/r/b.ts']],
    ['closeSaved', []]
  ])('runs the chosen action: %s', async (action, expected) => {
    showContextMenu.mockResolvedValue(action)
    await showTabMenu(idOf('/r/b.ts'))
    expect(paths()).toEqual(expected)
  })

  it('copyPath copies the tab path', async () => {
    showContextMenu.mockResolvedValue('copyPath')
    await showTabMenu(idOf('/r/b.ts'))
    expect(api.fs.copyPath).toHaveBeenCalledWith('/r/b.ts')
  })

  it('reveal shows the explorer', async () => {
    useStore.setState({ view: 'git', sidebarVisible: false })
    showContextMenu.mockResolvedValue('reveal')
    await showTabMenu(idOf('/r/b.ts'))
    expect(state()).toMatchObject({ view: 'explorer', sidebarVisible: true })
  })

  it('a menu closed without a choice does nothing; a menu failure is warned', async () => {
    showContextMenu.mockResolvedValue(null)
    await showTabMenu(idOf('/r/b.ts'))
    expect(state().tabs).toHaveLength(3)
    showContextMenu.mockRejectedValue(new Error('menu broke'))
    await showTabMenu(idOf('/r/b.ts'))
    expect(toastTitles()).toEqual(['menu broke'])
  })

  it('a missing tab does not open the menu', async () => {
    await showTabMenu('nope')
    expect(showContextMenu).not.toHaveBeenCalled()
  })
})

describe('groups and markdown', () => {
  it('splitEditor copies the active tab to a new group and requests its focus', () => {
    openFile('/r/a.ts')
    splitEditor()
    expect(state().editorGroups).toHaveLength(2)
    expect(paths(1)).toEqual(['/r/a.ts'])
    expect(state().requests.groupFocus?.payload).toEqual({ groupId: state().activeGroupId })
  })

  it('splitEditor without a tab does not split', () => {
    splitEditor()
    expect(state().editorGroups).toHaveLength(1)
  })

  it('focusOtherEditorGroup toggles the active group', () => {
    openFile('/r/a.ts')
    splitEditor()
    const second = state().activeGroupId
    focusOtherEditorGroup()
    expect(state().activeGroupId).not.toBe(second)
    activateGroup(second)
    expect(state().activeGroupId).toBe(second)
  })

  it('resizeEditorGroups moves the divider with a minimum', () => {
    openFile('/r/a.ts')
    splitEditor()
    resizeEditorGroups([], 0, 5)
    expect(state().editorLayout).toMatchObject({ sizes: [0.95, 0.050000000000000044] })
  })

  it('split down, focus by direction and by position', () => {
    openFile('/r/a.ts')
    splitEditor('right')
    splitEditor('down')
    const [left, top, bottom] = state().editorGroups.map((g) => g.id)
    expect(state().activeGroupId).toBe(bottom)
    focusEditorGroupToward('up')
    expect(state().activeGroupId).toBe(top)
    focusEditorGroupToward('left')
    expect(state().activeGroupId).toBe(left)
    focusEditorGroupAt(2)
    expect(state().activeGroupId).toBe(bottom)
    expect(state().requests.groupFocus?.payload).toEqual({ groupId: bottom })
  })

  it('moving the active tab to the next group creates the group and takes the focus', () => {
    openFile('/r/a.ts')
    openFile('/r/b.ts')
    moveActiveTabToAdjacentGroup(1)
    expect(state().editorGroups).toHaveLength(2)
    expect(paths(0)).toEqual(['/r/a.ts'])
    expect(paths(1)).toEqual(['/r/b.ts'])
    moveActiveTabToAdjacentGroup(-1)
    expect(state().editorGroups).toHaveLength(1)
    expect(paths(0)).toEqual(['/r/a.ts', '/r/b.ts'])
  })

  it('joining all groups leaves a single one with the tabs of all', () => {
    openFile('/r/a.ts')
    splitEditor()
    openFile('/r/b.ts')
    joinAllEditorGroups()
    expect(state().editorGroups).toHaveLength(1)
    expect(state().editorLayout).toEqual({ group: state().activeGroupId })
    expect(paths(0)).toEqual(['/r/a.ts', '/r/b.ts'])
  })

  it('dropping a tab on a group edge splits; in the center it moves', () => {
    openFile('/r/a.ts')
    openFile('/r/b.ts')
    const first = state().activeGroupId
    dropTabOnGroup(idOf('/r/b.ts'), first, 'down', first)
    expect(state().editorGroups).toHaveLength(2)
    expect(state().editorLayout).toMatchObject({ direction: 'column' })
    const second = state().activeGroupId
    dropTabOnGroup(idOf('/r/a.ts'), second, 'center', first)
    expect(state().editorGroups).toHaveLength(1)
    expect(paths(0)).toEqual(['/r/b.ts', '/r/a.ts'])
    // On the edge of its own group it splits; with the group's only tab, nothing changes.
    dropTabOnGroup(idOf('/r/a.ts'), second, 'right', second)
    expect(state().editorGroups).toHaveLength(2)
    const lone = state().activeGroupId
    const before = state().editorLayout
    dropTabOnGroup(idOf('/r/a.ts'), lone, 'down', lone)
    expect(state().editorLayout).toBe(before)
  })

  it('moveTab takes the tab to the other group and the emptied group closes', () => {
    openFile('/r/a.ts')
    splitEditor()
    const [fromFirst, second] = state().editorGroups.map((group) => group.id)
    moveTab(idOf('/r/a.ts'), 0, second, fromFirst)
    expect(state().editorGroups.map((group) => group.id)).toEqual([second])
    expect(paths()).toEqual(['/r/a.ts'])
  })

  it('moveTab takes the tab out of the source group and into the target without closing any', () => {
    openFile('/r/a.ts')
    openFile('/r/b.ts')
    splitEditor()
    const [first, second] = state().editorGroups.map((group) => group.id)
    moveTab(idOf('/r/b.ts'), 0, second, first)
    expect(state().editorGroups.map((group) => group.id)).toEqual([first, second])
    expect(paths(0)).toEqual(['/r/a.ts'])
    expect(paths(1)).toEqual(['/r/b.ts'])
  })

  it('moveTab of a missing tab is ignored', () => {
    moveTab('nope', 0)
    expect(state().tabs).toHaveLength(0)
  })

  it('activateTab switches the active tab and marks it as recent', () => {
    openFile('/r/a.ts')
    openFile('/r/b.ts')
    activateTab(idOf('/r/a.ts'))
    expect(activeTab()?.path).toBe('/r/a.ts')
    expect(state().recentFiles[0]).toBe('/r/a.ts')
  })

  it('openMarkdownPreview opens the preview beside, focuses it if it exists and goes back to the file from it', () => {
    openFile('/r/README.md')
    const source = idOf('/r/README.md')
    openMarkdownPreview()
    expect(state().editorGroups).toHaveLength(2)
    const preview = state().tabs.find((tab) => tab.kind === 'markdownPreview')!
    expect(state().editorGroups[1].tabIds).toEqual([preview.id])
    expect(state().activeTabId).toBe(source)

    openMarkdownPreview()
    expect(state().tabs.filter((tab) => tab.kind === 'markdownPreview')).toHaveLength(1)

    activateGroup(state().editorGroups[1].id)
    expect(state().activeTabId).toBe(preview.id)
    openMarkdownPreview()
    expect(state().activeTabId).toBe(source)
  })

  it('openMarkdownPreview only applies to a markdown file', () => {
    openFile('/r/a.ts')
    openMarkdownPreview()
    expect(state().editorGroups).toHaveLength(1)
  })
})

describe('active tabs', () => {
  it('activeLoadedFileTab requires the file to have been loaded (EOL detected)', () => {
    useStore.setState({ tabs: [fileTab({ eol: null })], activeTabId: 't1' })
    expect(activeLoadedFileTab()).toBeNull()
    useStore.setState({ tabs: [fileTab({ eol: 'LF' })], activeTabId: 't1' })
    expect(activeLoadedFileTab()?.id).toBe('t1')
  })
})

describe('startTabReactions', () => {
  it('tabs on fallback indent follow editor.tabSize; the ones with detected indent do not change', () => {
    useStore.setState((s) => ({
      tabs: [
        fileTab({ id: 'f', indent: { kind: 'spaces', size: 2 }, indentFallback: true }),
        fileTab({ id: 'd', path: '/r/d.ts', indent: { kind: 'spaces', size: 2 }, indentFallback: false })
      ],
      settings: { ...s.settings, 'editor.tabSize': 8 }
    }))
    const byId = (id: string) => state().tabs.find((tab) => tab.id === id) as ReturnType<typeof fileTab>
    expect(byId('f').indent).toEqual({ kind: 'spaces', size: 8 })
    expect(byId('d').indent).toEqual({ kind: 'spaces', size: 2 })
  })

  it('editing a tab (via the editor handler) makes it dirty and pins the preview', () => {
    openFile('/r/a.ts', undefined, { preview: true })
    const id = idOf('/r/a.ts')
    documentState.handlers.setDirty(id, true)
    expect(activeTab()).toMatchObject({ dirty: true, preview: false })
    documentState.handlers.setDirty(id, false)
    expect(activeTab()).toMatchObject({ dirty: false })
  })

  it('the cursor only updates the store when it changes', () => {
    const cursor = { line: 1, column: 1, selected: 0 }
    documentState.handlers.setCursor(cursor)
    const first = state().cursor
    documentState.handlers.setCursor({ ...cursor })
    expect(state().cursor).toBe(first)
    documentState.handlers.setCursor({ ...cursor, column: 2 })
    expect(state().cursor).toEqual({ line: 1, column: 2, selected: 0 })
  })

  it('closing the tab discards its editor state', () => {
    openFile('/r/a.ts')
    const id = idOf('/r/a.ts')
    documentState.states.set(id, {} as never)
    useStore.setState({ tabs: [] })
    expect(documentState.hasDocument(id)).toBe(false)
  })
})

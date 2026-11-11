import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnsavedChoice } from '@shared/types'
import { installFakeApi } from './test/fakeApi'

const exists = vi.fn<(path: string) => Promise<boolean>>()
installFakeApi({
  fs: { exists: (path) => exists(path), readText: () => Promise.resolve({ text: '', encoding: 'utf8' }) },
  dialog: { confirmUnsaved: (): Promise<UnsavedChoice> => Promise.resolve('dontSave') }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const documentState = await import('./components/editor/documentState')
const { forgetDocument } = await import('./components/editor/documentStore')
const { openFile, openDiff, closeTab, closeOtherTabs, closeEditorGroup, splitEditor, startTabReactions } =
  await import('./tabActions')
const { reopenClosedTab } = await import('./closedTabActions')

const state = () => useStore.getState()
const paths = (groupIndex = 0): (string | undefined)[] =>
  (state().editorGroups[groupIndex]?.tabIds ?? []).map((id) => state().tabs.find((tab) => tab.id === id)?.path)
const idOf = (path: string): string => state().tabs.find((tab) => tab.path === path)?.id ?? ''

let stop: () => void

beforeEach(() => {
  resetStore()
  useStore.setState({ root: '/r' })
  exists.mockReset().mockResolvedValue(true)
  stop = startTabReactions()
})

afterEach(() => {
  stop()
  for (const id of [...documentState.states.keys()]) forgetDocument(id)
})

describe('reopenClosedTab', () => {
  it('puts the tab back where it was, pinned and with the saved cursor', async () => {
    for (const name of ['a', 'b', 'c']) openFile(`/r/${name}.ts`, undefined, { preview: name === 'b' })
    await closeTab(idOf('/r/b.ts'))
    expect(paths()).toEqual(['/r/a.ts', '/r/c.ts'])
    await reopenClosedTab()
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts', '/r/c.ts'])
    const reopened = state().tabs.find((t) => t.path === '/r/b.ts')
    expect(reopened?.kind === 'file' && reopened.preview).toBe(false)
    expect(state().activeTabId).toBe(reopened?.id)
    expect(state().closedTabs).toEqual([])
  })

  it('closing several at once and reopening in sequence restores the whole range', async () => {
    for (const name of ['a', 'b', 'c', 'd']) openFile(`/r/${name}.ts`)
    await closeOtherTabs(idOf('/r/a.ts'))
    expect(paths()).toEqual(['/r/a.ts'])
    await reopenClosedTab()
    await reopenClosedTab()
    await reopenClosedTab()
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts', '/r/c.ts', '/r/d.ts'])
    await reopenClosedTab()
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts', '/r/c.ts', '/r/d.ts'])
  })

  it('skips deleted files and tabs already open in the group', async () => {
    for (const name of ['a', 'b', 'c']) openFile(`/r/${name}.ts`)
    await closeTab(idOf('/r/b.ts'))
    await closeTab(idOf('/r/c.ts'))
    openFile('/r/b.ts')
    exists.mockImplementation((path) => Promise.resolve(path !== '/r/c.ts'))
    await reopenClosedTab()
    expect(paths()).toEqual(['/r/a.ts', '/r/b.ts'])
    expect(state().closedTabs).toEqual([])
  })

  it('goes back to the source group when it still exists; otherwise to the active one', async () => {
    openFile('/r/a.ts')
    splitEditor()
    openFile('/r/b.ts')
    const right = state().activeGroupId
    await closeTab(idOf('/r/b.ts'), right)
    useStore.setState({ activeGroupId: state().editorGroups[0]?.id ?? '' })
    await reopenClosedTab()
    expect(paths(1)).toEqual(['/r/a.ts', '/r/b.ts'])

    await closeEditorGroup(right)
    expect(state().editorGroups).toHaveLength(1)
    await reopenClosedTab()
    expect(paths(0)).toEqual(['/r/a.ts', '/r/b.ts'])
  })

  it('reopens diffs as diffs, without checking the file', async () => {
    openFile('/r/a.ts')
    openDiff('/r/gone.ts', true)
    await closeTab(state().activeTabId ?? '')
    exists.mockResolvedValue(false)
    await reopenClosedTab()
    const diff = state().tabs.find((t) => t.kind === 'diff')
    expect(diff?.kind === 'diff' && diff.staged).toBe(true)
    expect(exists).not.toHaveBeenCalled()
  })
})

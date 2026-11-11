import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsApi } from '@shared/types'
import { installFakeApi } from './test/fakeApi'
import { fileTab } from './test/tabFixtures'

const readText = vi.fn<FsApi['readText']>()
installFakeApi({ fs: { readText: (path, encoding) => readText(path, encoding) } })

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const { loadDocument, forgetDocument } = await import('./components/editor/documentStore')
const {
  canCompareWithSelected,
  compareActiveWith,
  compareActiveWithSaved,
  compareWithSelected,
  openCompare,
  readCompareSide,
  selectForCompare,
  swapCompareSides
} = await import('./compareActions')
const { openFile } = await import('./tabActions')

const state = () => useStore.getState()
const activeTab = () => state().tabs.find((t) => t.id === state().activeTabId)

beforeEach(() => {
  resetStore()
  useStore.setState({ root: '/r' })
  readText.mockReset().mockResolvedValue({ text: 'disk\n', encoding: 'utf8' })
})

describe('compare files', () => {
  it('selected on the left, the other on the right; a file is not compared with itself', () => {
    expect(canCompareWithSelected('/r/b.ts')).toBe(false)
    selectForCompare('/r/a.ts')
    expect(canCompareWithSelected('/r/a.ts')).toBe(false)
    expect(canCompareWithSelected('/r/b.ts')).toBe(true)
    compareWithSelected('/r/a.ts')
    expect(state().tabs).toHaveLength(0)
    compareWithSelected('/r/b.ts')
    expect(activeTab()).toMatchObject({
      kind: 'diff',
      path: '/r/b.ts',
      compare: { left: { path: '/r/a.ts' }, right: { path: '/r/b.ts' } }
    })
  })

  it('reopening the same comparison activates the existing tab', () => {
    openCompare({ path: '/r/a.ts' }, { path: '/r/b.ts' })
    openFile('/r/c.ts')
    openCompare({ path: '/r/a.ts' }, { path: '/r/b.ts' })
    expect(state().tabs.filter((t) => t.kind === 'diff')).toHaveLength(1)
    expect(activeTab()?.kind).toBe('diff')
    // The saved side is a different comparison.
    openCompare({ path: '/r/a.ts', saved: true }, { path: '/r/b.ts' })
    expect(state().tabs.filter((t) => t.kind === 'diff')).toHaveLength(2)
  })

  it('compare with saved puts the disk to the left of the active file buffer', () => {
    compareActiveWithSaved()
    expect(state().tabs).toHaveLength(0)
    openFile('/r/a.ts')
    compareActiveWithSaved()
    expect(activeTab()).toMatchObject({
      compare: { left: { path: '/r/a.ts', saved: true }, right: { path: '/r/a.ts' } }
    })
  })

  it('compare with the file chosen in the picker', () => {
    openFile('/r/a.ts')
    compareActiveWith('/r/a.ts')
    expect(activeTab()?.kind).toBe('file')
    compareActiveWith('/r/z.ts')
    expect(activeTab()).toMatchObject({ compare: { left: { path: '/r/a.ts' }, right: { path: '/r/z.ts' } } })
  })

  it('swapping exchanges the sides and the tab path follows the right side', () => {
    openCompare({ path: '/r/a.ts', saved: true }, { path: '/r/b.ts' })
    swapCompareSides()
    expect(activeTab()).toMatchObject({
      path: '/r/a.ts',
      compare: { left: { path: '/r/b.ts' }, right: { path: '/r/a.ts', saved: true } }
    })
    // A tab that is not a comparison: nothing changes (not even the list reference).
    const after = state().tabs
    swapCompareSides('nope')
    expect(state().tabs).toBe(after)
  })

  it('a side reads the open tab buffer; with `saved` (or without a tab), the disk', async () => {
    const tab = fileTab({ id: 't1', path: '/r/a.ts' })
    useStore.setState({ tabs: [tab] })
    loadDocument(tab.id, 'buffer\n', { kind: 'spaces', size: 2 })
    expect(await readCompareSide({ path: '/r/a.ts' })).toBe('buffer\n')
    expect(await readCompareSide({ path: '/r/a.ts', saved: true })).toBe('disk\n')
    expect(await readCompareSide({ path: '/r/other.ts' })).toBe('disk\n')
    expect(readText).toHaveBeenCalledWith('/r/other.ts', undefined)
    forgetDocument(tab.id)
  })
})

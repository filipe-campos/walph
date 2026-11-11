import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const doc = { toString: () => 'text' }
const currentState = vi.fn((_id: string) => ({ doc }) as never)
const matchesSaved = vi.fn((_id: string, _text: string): boolean | null => true)
const notifyEdit = vi.fn()
const syncTabWithDisk = vi.fn()

vi.mock('./components/editor/groupViews', async (orig) => ({
  ...(await orig<object>()),
  currentState: (id: string) => currentState(id)
}))
vi.mock('./components/editor/documentState', async (orig) => ({
  ...(await orig<object>()),
  matchesSaved: (id: string, text: string) => matchesSaved(id, text),
  notifyEdit: (id: string) => notifyEdit(id)
}))
vi.mock('./diskSync', async (orig) => ({
  ...(await orig<object>()),
  syncTabWithDisk: (id: string) => syncTabWithDisk(id)
}))

const { useStore } = await import('./store')
const { setTabEol } = await import('./tabFormatActions')
const { clearFormatDirty, formatDirtyEol, markFormatDirty } = await import('./diskSync')

const tab = () => useStore.getState().tabs[0] as { eol: string; dirty: boolean }

function seed(patch: object = {}): void {
  useStore.setState({
    tabs: [
      {
        id: 't',
        kind: 'file',
        path: '/a.ts',
        dirty: false,
        preview: false,
        deleted: false,
        conflict: false,
        eol: 'LF',
        indent: null,
        indentFallback: false,
        encoding: null,
        encodingChosen: false,
        language: null,
        ...patch
      }
    ] as never
  })
}

beforeEach(() => {
  clearFormatDirty('t')
  currentState.mockClear()
  matchesSaved.mockReset().mockReturnValue(true)
  notifyEdit.mockClear()
  syncTabWithDisk.mockClear()
  seed()
})

describe('setTabEol', () => {
  it('LF to CRLF on a clean tab: dirty, keeps the disk EOL and notifies auto save once', () => {
    setTabEol('t', 'CRLF')
    expect(tab()).toMatchObject({ eol: 'CRLF', dirty: true })
    expect(formatDirtyEol('t')).toBe('LF')
    expect(notifyEdit).toHaveBeenCalledExactlyOnceWith('t')
    expect(syncTabWithDisk).not.toHaveBeenCalled()
  })

  it('LF, CRLF, LF with the saved text: cleans the tab and formatDirty, without rereading the disk', () => {
    setTabEol('t', 'CRLF')
    setTabEol('t', 'LF')
    expect(tab()).toMatchObject({ eol: 'LF', dirty: false })
    expect(formatDirtyEol('t')).toBeUndefined()
    expect(notifyEdit).toHaveBeenCalledTimes(1)
    expect(syncTabWithDisk).not.toHaveBeenCalled()
  })

  it('back to the disk EOL with edited text: stays dirty', () => {
    setTabEol('t', 'CRLF')
    matchesSaved.mockReturnValue(false)
    setTabEol('t', 'LF')
    expect(tab()).toMatchObject({ eol: 'LF', dirty: true })
    expect(formatDirtyEol('t')).toBeUndefined()
    expect(syncTabWithDisk).not.toHaveBeenCalled()
  })

  it('back to the disk EOL in conflict with the saved text: rereads the disk', () => {
    seed({ conflict: true, dirty: true })
    markFormatDirty('t', 'LF')
    setTabEol('t', 'CRLF')
    // The tab was already CRLF in the state: the plan starts from the current EOL.
    seed({ conflict: true, dirty: true, eol: 'CRLF' })
    setTabEol('t', 'LF')
    expect(syncTabWithDisk).toHaveBeenCalledExactlyOnceWith('t')
  })

  it('a tab that was already dirty is not announced again', () => {
    seed({ dirty: true })
    setTabEol('t', 'CRLF')
    expect(notifyEdit).not.toHaveBeenCalled()
    expect(formatDirtyEol('t')).toBe('LF')
  })

  it('same EOL as current, unknown EOL or missing tab: nothing changes', () => {
    setTabEol('t', 'LF')
    seed({ eol: null })
    setTabEol('t', 'CRLF')
    setTabEol('nope', 'CRLF')
    expect(formatDirtyEol('t')).toBeUndefined()
    expect(notifyEdit).not.toHaveBeenCalled()
  })
})

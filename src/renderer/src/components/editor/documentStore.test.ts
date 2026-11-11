import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'
import { bindDocumentHandlers, matchesSaved } from './documentState'
import { applyTabEdits, forgetDocument, loadDocument, replaceDocument, saveDocument } from './documentStore'
import { currentState, getView, mountView, setActiveGroup, showDocument, unmountView } from './groupViews'

const indent = { kind: 'spaces', size: 2 } as const
const setDirty = vi.fn<(tabId: string, dirty: boolean) => void>()
const writeFile = vi.fn<(path: string, content: string) => Promise<void>>()

beforeEach(() => {
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })
  Range.prototype.getBoundingClientRect = () => rect
  installFakeApi({ fs: { writeFile: (path, content) => writeFile(path, content) } })
  writeFile.mockResolvedValue(undefined)
  bindDocumentHandlers({ setDirty, setCursor: () => {}, onScroll: () => {} })
})

afterEach(() => {
  forgetDocument('t')
  setDirty.mockReset()
  writeFile.mockReset()
})

describe('matchesSaved', () => {
  it('null for a tab never loaded', () => {
    expect(matchesSaved('t', 'abc')).toBeNull()
  })

  it('compares with the base line ignoring the line break type', () => {
    loadDocument('t', 'a\r\nb', indent)

    expect(matchesSaved('t', 'a\nb')).toBe(true)
    expect(matchesSaved('t', 'a\r\nb')).toBe(true)
    expect(matchesSaved('t', 'a\nc')).toBe(false)
  })

  it('forgetting the tab clears the base line', () => {
    loadDocument('t', 'abc', indent)
    forgetDocument('t')

    expect(matchesSaved('t', 'abc')).toBeNull()
  })
})

describe('dirty state of the visible tab', () => {
  it('becomes dirty on edit and clean when going back to the saved text', () => {
    loadDocument('t', 'abc', indent)
    mountView('g', document.body.appendChild(document.createElement('div')))
    setActiveGroup('g')
    showDocument('g', 't')

    getView('g')!.dispatch({ changes: { from: 3, insert: 'd' } })
    getView('g')!.dispatch({ changes: { from: 3, to: 4 } })

    expect(setDirty.mock.calls).toEqual([
      ['t', true],
      ['t', false]
    ])
    unmountView('g')
  })
})

describe('hidden tabs', () => {
  it('applyTabEdits marks as dirty, notifies the edit and keeps a single transaction', () => {
    loadDocument('t', 'abc', indent)

    const applied = applyTabEdits('t', [
      { from: 0, to: 1, insert: 'X' },
      { from: 3, to: 3, insert: '!' }
    ])

    expect(applied).toBe(true)
    expect(currentState('t')!.doc.toString()).toBe('Xbc!')
    expect(setDirty.mock.calls).toEqual([['t', true]])
  })

  it('applyTabEdits returns false for a tab not loaded and true for an empty list', () => {
    expect(applyTabEdits('t', [{ from: 0, to: 0, insert: 'x' }])).toBe(false)
    loadDocument('t', 'abc', indent)
    expect(applyTabEdits('t', [])).toBe(true)
  })

  it('replaceDocument adopts the disk text as the new base line', () => {
    loadDocument('t', 'abc', indent)

    expect(replaceDocument('t', 'abcdef', indent)).toBe(true)

    expect(currentState('t')!.doc.toString()).toBe('abcdef')
    expect(matchesSaved('t', 'abcdef')).toBe(true)
    expect(matchesSaved('t', 'abc')).toBe(false)
  })

  it('replaceDocument returns false for a tab not loaded', () => {
    expect(replaceDocument('t', 'x', indent)).toBe(false)
  })
})

describe('saveDocument', () => {
  it('writes with the requested EOL and takes the text as the base line', async () => {
    loadDocument('t', 'a\nb', indent)
    applyTabEdits('t', [{ from: 3, to: 3, insert: 'c' }])
    expect(matchesSaved('t', 'a\nbc')).toBe(false)

    const stillDirty = await saveDocument('t', '/p/a.txt', 'CRLF')

    expect(writeFile).toHaveBeenCalledWith('/p/a.txt', 'a\r\nbc')
    expect(stillDirty).toBe(false)
    expect(matchesSaved('t', 'a\nbc')).toBe(true)
  })

  it('restores the previous base line if the write fails', async () => {
    loadDocument('t', 'abc', indent)
    applyTabEdits('t', [{ from: 3, to: 3, insert: 'd' }])
    writeFile.mockRejectedValue(new Error('disk full'))

    await expect(saveDocument('t', '/p/a.txt', 'LF')).rejects.toThrow('disk full')

    expect(matchesSaved('t', 'abc')).toBe(true)
    expect(matchesSaved('t', 'abcd')).toBe(false)
  })

  it('null for a tab not loaded', async () => {
    expect(await saveDocument('t', '/p/a.txt', 'LF')).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })
})

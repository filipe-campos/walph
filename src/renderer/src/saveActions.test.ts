import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { TextEncoding, UnsavedChoice } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { fileTab } from './test/tabFixtures'
import { toastTitles } from './test/toastTitles'

const confirmUnsaved = vi.fn<(names: string[]) => Promise<UnsavedChoice>>()
const confirm = vi.fn<(options: object) => Promise<boolean>>()
const writeFile = vi.fn<(path: string, content: string, encoding?: TextEncoding) => Promise<void>>()
const { api } = installFakeApi({
  dialog: { confirmUnsaved: (names) => confirmUnsaved(names), confirm: (options) => confirm(options) },
  fs: { writeFile: (...args) => writeFile(...args) }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const save = await import('./saveActions')
const { loadDocument, applyTabEdits, forgetDocument } = await import('./components/editor/documentStore')
const { currentState } = await import('./components/editor/groupViews')
const documentState = await import('./components/editor/documentState')

const indent = { kind: 'spaces', size: 2 } as const
const state = () => useStore.getState()
const tabOf = (id: string) => state().tabs.find((tab) => tab.id === id) as ReturnType<typeof fileTab>

function open(id: string, text: string, patch: Partial<ReturnType<typeof fileTab>> = {}): void {
  useStore.setState((s) => ({ tabs: [...s.tabs, fileTab({ id, path: `/r/${id}.ts`, ...patch })] }))
  loadDocument(id, text, indent)
}

beforeEach(() => {
  resetStore()
  writeFile.mockResolvedValue(undefined)
})

afterEach(() => {
  for (const id of [...documentState.states.keys()]) forgetDocument(id)
})

describe('confirmAndSave', () => {
  it('with no dirty tabs among the requested ones returns true without opening a dialog', async () => {
    open('a', 'x')
    useStore.setState((s) => ({ tabs: [...s.tabs, fileTab({ id: 'b', path: '/r/b.ts', dirty: true })] }))
    await expect(save.confirmAndSave(['a'])).resolves.toBe(true)
    expect(confirmUnsaved).not.toHaveBeenCalled()
  })

  it('non-file tabs do not count as dirty', async () => {
    useStore.setState({ tabs: [{ id: 'd', kind: 'diff', path: '/r/a.ts', staged: false }] })
    await expect(save.confirmAndSave(['d'])).resolves.toBe(true)
    expect(confirmUnsaved).not.toHaveBeenCalled()
  })

  it('cancel returns false and does not write', async () => {
    open('a', 'x', { dirty: true })
    confirmUnsaved.mockResolvedValue('cancel')
    await expect(save.confirmAndSave(['a'])).resolves.toBe(false)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('"Don\'t Save" proceeds without writing', async () => {
    open('a', 'x', { dirty: true })
    confirmUnsaved.mockResolvedValue('dontSave')
    await expect(save.confirmAndSave(['a'])).resolves.toBe(true)
    expect(writeFile).not.toHaveBeenCalled()
    expect(tabOf('a').dirty).toBe(true)
  })

  it('"Save" writes only the requested dirty tabs, in tab order, with a single dialog', async () => {
    open('a', 'one')
    open('b', 'two', { dirty: true })
    open('c', 'three', { dirty: true })
    open('d', 'four', { dirty: true })
    confirmUnsaved.mockResolvedValue('save')
    await expect(save.confirmAndSave(['a', 'b', 'c'])).resolves.toBe(true)
    expect(confirmUnsaved).toHaveBeenCalledExactlyOnceWith(['b.ts', 'c.ts'])
    expect(writeFile.mock.calls.map(([path]) => path).sort()).toEqual(['/r/b.ts', '/r/c.ts'])
    expect(tabOf('b').dirty).toBe(false)
    expect(tabOf('d').dirty).toBe(true)
  })

  it('"Save" with a failing write returns false and warns which file failed', async () => {
    open('a', 'one', { dirty: true })
    open('b', 'two', { dirty: true })
    confirmUnsaved.mockResolvedValue('save')
    writeFile.mockImplementation(async (path) => {
      if (path === '/r/b.ts') throw new Error('disk full')
    })
    await expect(save.confirmAndSave(['a', 'b'])).resolves.toBe(false)
    expect(toastTitles()).toEqual([t().editor.file.saveFailed('b.ts', 'disk full')])
    expect(tabOf('a').dirty).toBe(false)
  })

  it('a dialog failure is warned and counts as cancel', async () => {
    open('a', 'x', { dirty: true })
    confirmUnsaved.mockRejectedValue(new Error('dialog broke'))
    await expect(save.confirmAndSave(['a'])).resolves.toBe(false)
    expect(toastTitles()).toEqual(['dialog broke'])
  })

  it('suspends auto save while the dialog is open and releases it when done', async () => {
    open('a', 'x', { dirty: true })
    const choice = deferred<UnsavedChoice>()
    confirmUnsaved.mockReturnValue(choice.promise)
    const pending = save.confirmAndSave(['a'])
    expect(state().confirmingSave).toBe(true)
    choice.resolve('cancel')
    await pending
    expect(state().confirmingSave).toBe(false)
  })

  it('releases auto save even when the dialog fails', async () => {
    open('a', 'x', { dirty: true })
    confirmUnsaved.mockRejectedValue(new Error('x'))
    await save.confirmAndSave(['a'])
    expect(state().confirmingSave).toBe(false)
  })
})

describe('withAutoSaveSuspended', () => {
  it('nested dialogs only release when the last one finishes', async () => {
    const outer = deferred<void>()
    const inner = deferred<void>()
    const a = save.withAutoSaveSuspended(() => outer.promise)
    const b = save.withAutoSaveSuspended(() => inner.promise)
    expect(state().confirmingSave).toBe(true)
    inner.resolve()
    await b
    expect(state().confirmingSave).toBe(true)
    outer.resolve()
    await a
    expect(state().confirmingSave).toBe(false)
  })

  it('returns the result and releases when the function throws', async () => {
    await expect(save.withAutoSaveSuspended(async () => 7)).resolves.toBe(7)
    await expect(
      save.withAutoSaveSuspended(async () => {
        throw new Error('x')
      })
    ).rejects.toThrow('x')
    expect(state().confirmingSave).toBe(false)
  })
})

describe('saveTab', () => {
  it('writes with the tab EOL and clears dirty, deleted and conflict', async () => {
    open('a', 'one\ntwo', { dirty: true, deleted: true, conflict: true, eol: 'CRLF' })
    await expect(save.saveTab('a')).resolves.toBe(true)
    expect(writeFile).toHaveBeenCalledWith('/r/a.ts', 'one\r\ntwo', undefined)
    expect(tabOf('a')).toMatchObject({ dirty: false, deleted: false, conflict: false })
  })

  it('a tab without a loaded document writes nothing', async () => {
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true })] })
    await expect(save.saveTab('a')).resolves.toBe(true)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('a missing tab returns true', async () => {
    await expect(save.saveTab('nope')).resolves.toBe(true)
  })

  it('the requested encoding is used for the write and becomes the chosen one', async () => {
    open('a', 'olá', { dirty: true })
    await save.saveTab('a', { encoding: 'utf16le' })
    expect(writeFile).toHaveBeenCalledWith('/r/a.ts', 'olá', 'utf16le')
    expect(tabOf('a')).toMatchObject({ encoding: 'utf16le', encodingChosen: true })
  })

  it('uses the encoding already detected for the tab', async () => {
    open('a', 'x', { dirty: true, encoding: 'utf8bom' })
    await save.saveTab('a')
    expect(writeFile).toHaveBeenCalledWith('/r/a.ts', 'x', 'utf8bom')
    expect(tabOf('a').encodingChosen).toBe(false)
  })

  it('an edit during the write keeps the tab dirty', async () => {
    open('a', 'one', { dirty: true })
    writeFile.mockImplementation(async () => {
      applyTabEdits('a', [{ from: 0, to: 0, insert: 'new ' }])
    })
    await save.saveTab('a')
    expect(tabOf('a').dirty).toBe(true)
    expect(currentState('a')!.doc.toString()).toBe('new one')
  })

  it('a tab on fallback indent that gained detectable indentation switches to the detected one', async () => {
    open('a', 'x', { dirty: true, indentFallback: true, indent: { kind: 'spaces', size: 2 } })
    applyTabEdits('a', [{ from: 0, to: 1, insert: 'if (a) {\n    b()\n    c()\n}\n' }])
    await save.saveTab('a')
    expect(tabOf('a')).toMatchObject({ indentFallback: false, indent: { kind: 'spaces', size: 4 } })
  })

  it('a failure warns with the file name and returns false', async () => {
    open('a', 'x', { dirty: true })
    writeFile.mockRejectedValue(new Error('read only'))
    await expect(save.saveTab('a')).resolves.toBe(false)
    expect(toastTitles()).toEqual([t().editor.file.saveFailed('a.ts', 'read only')])
    expect(tabOf('a').dirty).toBe(true)
  })

  it('with onError the message goes to the caller, without a toast', async () => {
    open('a', 'x', { dirty: true })
    writeFile.mockRejectedValue(new Error('read only'))
    const onError = vi.fn()
    await expect(save.saveTab('a', { onError })).resolves.toBe(false)
    expect(onError).toHaveBeenCalledWith(t().editor.file.saveFailed('a.ts', 'read only'))
    expect(toastTitles()).toEqual([])
  })
})

describe('saveAllTabs', () => {
  it('writes only the tabs with changes', async () => {
    open('a', 'one')
    open('b', 'two', { dirty: true })
    useStore.setState((s) => ({ tabs: [...s.tabs, { id: 'i', kind: 'image', path: '/r/i.png' }] }))
    await save.saveAllTabs()
    expect(writeFile.mock.calls.map(([path]) => path)).toEqual(['/r/b.ts'])
  })
})

describe('confirmDialog', () => {
  it('returns the dialog answer', async () => {
    confirm.mockResolvedValue(true)
    await expect(save.confirmDialog({ message: 'ok?', confirmLabel: 'Yes' })).resolves.toBe(true)
  })

  it('a dialog failure counts as "no" and is warned', async () => {
    confirm.mockRejectedValue(new Error('no dialog'))
    await expect(save.confirmDialog({ message: 'ok?', confirmLabel: 'Yes' })).resolves.toBe(false)
    expect(toastTitles()).toEqual(['no dialog'])
  })
})

describe('window close', () => {
  it('with nothing pending confirms the close and keeps auto save suspended', async () => {
    await save.handleCloseRequested()
    expect(api.window.confirmClose).toHaveBeenCalledTimes(1)
    expect(state().confirmingSave).toBe(true)
    save.handleCloseAborted()
    expect(state().confirmingSave).toBe(false)
  })

  it('canceling the dialog cancels the close and releases auto save', async () => {
    open('a', 'x', { dirty: true })
    confirmUnsaved.mockResolvedValue('cancel')
    await save.handleCloseRequested()
    expect(api.window.cancelClose).toHaveBeenCalledTimes(1)
    expect(api.window.confirmClose).not.toHaveBeenCalled()
    expect(state().confirmingSave).toBe(false)
  })

  it('"Don\'t Save" closes without writing', async () => {
    open('a', 'x', { dirty: true })
    confirmUnsaved.mockResolvedValue('dontSave')
    await save.handleCloseRequested()
    expect(writeFile).not.toHaveBeenCalled()
    expect(api.window.confirmClose).toHaveBeenCalledTimes(1)
    save.handleCloseAborted()
  })

  it('writes the session before closing', async () => {
    useStore.setState({ root: '/r' })
    await save.handleCloseRequested()
    expect(api.session.save).toHaveBeenCalled()
    save.handleCloseAborted()
  })

  it('a second request while the dialog is open is ignored', async () => {
    open('a', 'x', { dirty: true })
    const choice = deferred<UnsavedChoice>()
    confirmUnsaved.mockReturnValue(choice.promise)
    const first = save.handleCloseRequested()
    await save.handleCloseRequested()
    choice.resolve('cancel')
    await first
    expect(confirmUnsaved).toHaveBeenCalledTimes(1)
    expect(api.window.cancelClose).toHaveBeenCalledTimes(1)
  })
})

describe('startSaveReactions', () => {
  let stop: () => void
  beforeEach(() => {
    stop = save.startSaveReactions()
  })
  afterEach(() => stop())

  it('notifies main only when the window starts or stops having dirty files', () => {
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true })] })
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true }), fileTab({ id: 'b', dirty: true })] })
    useStore.setState({ tabs: [] })
    expect(api.window.setDirty.mock.calls).toEqual([[true], [false]])
  })
})

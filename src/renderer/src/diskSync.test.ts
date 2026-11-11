import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { TextEncoding, TextFile } from '@shared/types'
import { installFakeApi } from './test/fakeApi'
import { deferred } from './test/deferred'
import { fileTab } from './test/tabFixtures'
import { toastTitles } from './test/toastTitles'

const readText = vi.fn<(path: string, encoding?: TextEncoding) => Promise<TextFile>>()
const exists = vi.fn<(path: string) => Promise<boolean>>()
installFakeApi({ fs: { readText: (path, encoding) => readText(path, encoding), exists: (path) => exists(path) } })

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const diskSync = await import('./diskSync')
const { loadDocument, forgetDocument } = await import('./components/editor/documentStore')
const { currentState } = await import('./components/editor/groupViews')
const documentState = await import('./components/editor/documentState')

const { syncTabWithDisk, syncTabsWithDisk, reloadFromDisk, reloadWithEncoding, keepMyVersion } = diskSync
const indent = { kind: 'spaces', size: 2 } as const
const file = (text: string, encoding: TextEncoding = 'utf8'): TextFile => ({ text, encoding })
const tabOf = (id = 't1') => useStore.getState().tabs.find((tab) => tab.id === id) as ReturnType<typeof fileTab>
const docOf = (id = 't1'): string => currentState(id)!.doc.toString()

function open(text: string, patch: Partial<ReturnType<typeof fileTab>> = {}, load = true): void {
  const tab = fileTab(patch)
  useStore.setState((s) => ({ tabs: [...s.tabs, tab] }))
  if (load) loadDocument(tab.id, text, indent)
}

let stopReactions: () => void

beforeEach(() => {
  resetStore()
  readText.mockReset()
  exists.mockReset().mockResolvedValue(true)
  stopReactions = diskSync.startDiskSyncReactions()
})

afterEach(() => {
  // Closing the tabs with the reactions on forgets the tab's module state (read warnings, format).
  useStore.setState({ tabs: [] })
  stopReactions()
  for (const id of [...documentState.states.keys()]) forgetDocument(id)
  diskSync.clearFormatDirty('t1')
})

describe('syncTabWithDisk: failing read', () => {
  it('a file that no longer exists marks the tab as deleted without warning', async () => {
    open('abc')
    readText.mockRejectedValue(new Error('ENOENT'))
    exists.mockResolvedValue(false)
    await syncTabWithDisk('t1')
    expect(tabOf().deleted).toBe(true)
    expect(toastTitles()).toEqual([])
  })

  it('a file that exists but could not be read warns the reason and is not marked deleted', async () => {
    open('abc')
    readText.mockRejectedValue(new Error('file too large'))
    await syncTabWithDisk('t1')
    expect(tabOf().deleted).toBe(false)
    expect(toastTitles()).toEqual([t().editor.file.readFailed('a.ts', 'file too large')])
  })

  it('the warning fires once per tab and comes back after a successful read', async () => {
    open('abc')
    readText.mockRejectedValue(new Error('boom'))
    await syncTabWithDisk('t1')
    await syncTabWithDisk('t1')
    expect(toastTitles()).toHaveLength(1)

    readText.mockResolvedValue(file('abc'))
    await syncTabWithDisk('t1')
    readText.mockRejectedValue(new Error('boom'))
    await syncTabWithDisk('t1')
    expect(toastTitles()).toHaveLength(2)
  })

  it('failing to check existence counts as "exists" (warning, not deletion)', async () => {
    open('abc')
    readText.mockRejectedValue(new Error('EACCES'))
    exists.mockRejectedValue(new Error('ipc'))
    await syncTabWithDisk('t1')
    expect(tabOf().deleted).toBe(false)
    expect(toastTitles()).toHaveLength(1)
  })

  it('an error from a superseded read neither marks deleted nor warns', async () => {
    open('abc')
    const first = deferred<TextFile>()
    readText.mockImplementationOnce(() => first.promise)
    readText.mockResolvedValueOnce(file('abc'))
    exists.mockResolvedValue(false)
    const slow = syncTabWithDisk('t1')
    await syncTabWithDisk('t1')
    first.reject(new Error('ENOENT'))
    await slow
    expect(tabOf().deleted).toBe(false)
    expect(toastTitles()).toEqual([])
  })

  it('a tab closed during the failed read is not touched', async () => {
    open('abc')
    const read = deferred<TextFile>()
    readText.mockImplementation(() => read.promise)
    const sync = syncTabWithDisk('t1')
    useStore.setState({ tabs: [] })
    exists.mockResolvedValue(false)
    read.resolve(file('x'))
    await sync
    expect(toastTitles()).toEqual([])
  })
})

describe('syncTabWithDisk: reconciliation', () => {
  it('a clean tab reloads the new disk text and adopts EOL and indent', async () => {
    open('one\ntwo\n')
    readText.mockResolvedValue(file('  a\r\n  b\r\n  c\r\n'))
    await syncTabWithDisk('t1')
    expect(docOf()).toBe('  a\n  b\n  c\n')
    expect(tabOf()).toMatchObject({ dirty: false, conflict: false, eol: 'CRLF', indent: { kind: 'spaces', size: 2 } })
  })

  it('a dirty tab with a different disk becomes a conflict and keeps the editor text', async () => {
    open('one')
    useStore.setState({ tabs: [fileTab({ dirty: true })] })
    readText.mockResolvedValue(file('other'))
    await syncTabWithDisk('t1')
    expect(tabOf().conflict).toBe(true)
    expect(docOf()).toBe('one')
  })

  it('a dirty tab whose disk went back to the saved text clears the conflict', async () => {
    open('one', { dirty: true, conflict: true })
    readText.mockResolvedValue(file('one'))
    await syncTabWithDisk('t1')
    expect(tabOf()).toMatchObject({ conflict: false, dirty: true })
  })

  it('a clean tab with the same text and another EOL adopts the new format without reloading', async () => {
    open('a\nb', { eol: 'LF' })
    readText.mockResolvedValue(file('a\r\nb'))
    await syncTabWithDisk('t1')
    expect(tabOf()).toMatchObject({ eol: 'CRLF', conflict: false, dirty: false })
  })

  it('a tab never loaded in the editor is ignored', async () => {
    open('', {}, false)
    readText.mockResolvedValue(file('anything'))
    await syncTabWithDisk('t1')
    expect(tabOf()).toMatchObject({ eol: 'LF', deleted: false, conflict: false })
  })

  it('a file marked deleted that reappeared is no longer deleted', async () => {
    open('abc', { deleted: true })
    readText.mockResolvedValue(file('abc'))
    await syncTabWithDisk('t1')
    expect(tabOf().deleted).toBe(false)
  })

  it('uses the encoding chosen by the user on rereads', async () => {
    open('abc', { encoding: 'windows1252', encodingChosen: true })
    readText.mockResolvedValue(file('abc', 'windows1252'))
    await syncTabWithDisk('t1')
    expect(readText).toHaveBeenCalledWith('/r/a.ts', 'windows1252')
  })

  it('a missing tab does not read the disk', async () => {
    await syncTabWithDisk('nope')
    expect(readText).not.toHaveBeenCalled()
  })

  it('marks the "disk" work as pending while reading', async () => {
    open('abc')
    const read = deferred<TextFile>()
    readText.mockImplementation(() => read.promise)
    const sync = syncTabWithDisk('t1')
    expect(document.documentElement.dataset.pending).toBe('disk')
    read.resolve(file('abc'))
    await sync
    expect(document.documentElement.dataset.pending).toBeUndefined()
  })

  it('an old read response does not overwrite the newer one', async () => {
    open('base')
    const first = deferred<TextFile>()
    readText.mockImplementationOnce(() => first.promise)
    readText.mockResolvedValueOnce(file('new'))
    const slow = syncTabWithDisk('t1')
    await syncTabWithDisk('t1')
    first.resolve(file('old'))
    await slow
    expect(docOf()).toBe('new')
  })
})

describe('reloadFromDisk', () => {
  it('discards the editor version and adopts the disk', async () => {
    open('mine', { dirty: true, conflict: true })
    readText.mockResolvedValue(file('disk text'))
    await reloadFromDisk('t1')
    expect(docOf()).toBe('disk text')
    expect(tabOf()).toMatchObject({ dirty: false, conflict: false })
  })

  it('deleted file: clears the conflict and warns it is gone from disk', async () => {
    open('mine', { dirty: true, conflict: true })
    readText.mockRejectedValue(new Error('ENOENT'))
    exists.mockResolvedValue(false)
    await reloadFromDisk('t1')
    expect(tabOf()).toMatchObject({ deleted: true, conflict: false, dirty: true })
    expect(toastTitles()).toEqual([t().editor.file.goneFromDisk])
  })

  it('an unreadable read (file exists) does not clear the conflict', async () => {
    open('mine', { dirty: true, conflict: true })
    readText.mockRejectedValue(new Error('binary'))
    await reloadFromDisk('t1')
    expect(tabOf().conflict).toBe(true)
    expect(toastTitles()).toEqual([t().editor.file.readFailed('a.ts', 'binary')])
  })
})

describe('keepMyVersion', () => {
  it('clears the conflict mark and keeps the tab dirty', () => {
    open('mine', { dirty: true, conflict: true })
    keepMyVersion('t1')
    expect(tabOf()).toMatchObject({ conflict: false, dirty: true })
  })
})

describe('reloadWithEncoding', () => {
  it('rereads forcing the encoding and marks it as chosen', async () => {
    open('cafÃ©', { encoding: 'utf8' })
    readText.mockResolvedValue(file('café', 'windows1252'))
    const tab = tabOf()
    await expect(reloadWithEncoding(tab, 'windows1252')).resolves.toBe(true)
    expect(readText).toHaveBeenCalledWith('/r/a.ts', 'windows1252')
    expect(docOf()).toBe('café')
    expect(tabOf()).toMatchObject({ encoding: 'windows1252', encodingChosen: true, dirty: false })
  })

  it('tab clean at request time and edited during the read: does not discard what was typed', async () => {
    open('abc')
    const read = deferred<TextFile>()
    readText.mockImplementation(() => read.promise)
    const pending = reloadWithEncoding(tabOf(), 'iso88591')
    useStore.setState({ tabs: [fileTab({ dirty: true })] })
    read.resolve(file('disk text', 'iso88591'))
    await expect(pending).resolves.toBe(false)
    expect(docOf()).toBe('abc')
    expect(toastTitles()).toEqual([t().editor.file.editedDuringRead])
    expect(useStore.getState().toasts[0].tone).toBe('info')
  })

  it('a tab dirty at request time (already confirmed by the user) is reloaded even though dirty', async () => {
    open('abc', { dirty: true })
    readText.mockResolvedValue(file('disk text', 'iso88591'))
    await expect(reloadWithEncoding(tabOf(), 'iso88591')).resolves.toBe(true)
    expect(docOf()).toBe('disk text')
    expect(tabOf().dirty).toBe(false)
  })

  it('a read failure warns and returns false without changing the tab', async () => {
    open('abc')
    readText.mockRejectedValue(new Error('invalid'))
    await expect(reloadWithEncoding(tabOf(), 'utf16le')).resolves.toBe(false)
    expect(toastTitles()).toEqual([t().editor.file.reopenFailed('a.ts', 'invalid')])
    expect(tabOf().encodingChosen).toBe(false)
  })

  it('a tab closed during the read returns false without warning', async () => {
    open('abc')
    const tab = tabOf()
    const read = deferred<TextFile>()
    readText.mockImplementation(() => read.promise)
    const pending = reloadWithEncoding(tab, 'utf16le')
    useStore.setState({ tabs: [] })
    read.resolve(file('x'))
    await expect(pending).resolves.toBe(false)
    expect(toastTitles()).toEqual([])
  })

  it('a watcher read started afterwards invalidates the reread with encoding', async () => {
    open('abc')
    const tab = tabOf()
    const read = deferred<TextFile>()
    readText.mockImplementationOnce(() => read.promise)
    const pending = reloadWithEncoding(tab, 'utf16le')
    diskSync.beginDiskRead('t1')
    read.resolve(file('x', 'utf16le'))
    await expect(pending).resolves.toBe(false)
    expect(docOf()).toBe('abc')
  })
})

describe('syncTabsWithDisk', () => {
  it('unlink marks the tab as deleted and invalidates in-flight reads', async () => {
    open('abc')
    const read = deferred<TextFile>()
    readText.mockImplementation(() => read.promise)
    const inFlight = syncTabWithDisk('t1')
    syncTabsWithDisk([{ path: '/r/a.ts', type: 'unlink' }])
    read.resolve(file('new'))
    await inFlight
    expect(tabOf().deleted).toBe(true)
    expect(docOf()).toBe('abc')
  })

  it('a deleted folder marks the tabs inside it', () => {
    open('abc', { id: 'a', path: '/r/dir/a.ts' })
    open('abc', { id: 'b', path: '/r/other/b.ts' })
    syncTabsWithDisk([{ path: '/r/dir', type: 'unlink' }])
    expect(tabOf('a').deleted).toBe(true)
    expect(tabOf('b').deleted).toBe(false)
  })

  it('change rereads only the affected tabs', async () => {
    open('abc', { id: 'a', path: '/r/a.ts' })
    open('abc', { id: 'b', path: '/r/b.ts' })
    readText.mockResolvedValue(file('new'))
    syncTabsWithDisk([{ path: '/r/a.ts', type: 'change' }])
    await vi.waitFor(() => expect(docOf('a')).toBe('new'))
    expect(readText).toHaveBeenCalledTimes(1)
    expect(docOf('b')).toBe('abc')
  })

  it('the last event of the batch decides (unlink followed by add rereads)', async () => {
    open('abc')
    readText.mockResolvedValue(file('abc'))
    syncTabsWithDisk([
      { path: '/r/a.ts', type: 'unlink' },
      { path: '/r/a.ts', type: 'add' }
    ])
    await vi.waitFor(() => expect(readText).toHaveBeenCalled())
    await vi.waitFor(() => expect(tabOf().deleted).toBe(false))
  })

  it('an empty batch and non-file tabs do nothing', () => {
    useStore.setState({ tabs: [{ id: 'i', kind: 'image', path: '/r/a.ts' }] })
    syncTabsWithDisk([])
    syncTabsWithDisk([{ path: '/r/a.ts', type: 'unlink' }])
    expect(readText).not.toHaveBeenCalled()
  })
})

describe('tab dirty only by format', () => {
  it('markFormatDirty keeps the disk EOL until cleared', () => {
    diskSync.markFormatDirty('t1', 'CRLF')
    expect(diskSync.formatDirtyEol('t1')).toBe('CRLF')
    diskSync.clearFormatDirty('t1')
    expect(diskSync.formatDirtyEol('t1')).toBeUndefined()
  })

  it('reloading from disk clears the format mark', async () => {
    open('abc')
    diskSync.markFormatDirty('t1', 'LF')
    readText.mockResolvedValue(file('new'))
    await reloadFromDisk('t1')
    expect(diskSync.formatDirtyEol('t1')).toBeUndefined()
  })
})

describe('startDiskSyncReactions', () => {
  it('closing the tab forgets the format mark and the read warning', async () => {
    open('abc')
    diskSync.markFormatDirty('t1', 'CRLF')
    readText.mockRejectedValue(new Error('x'))
    await syncTabWithDisk('t1')
    useStore.setState({ tabs: [] })
    expect(diskSync.formatDirtyEol('t1')).toBeUndefined()

    open('abc')
    await syncTabWithDisk('t1')
    expect(toastTitles()).toHaveLength(2)
  })
})

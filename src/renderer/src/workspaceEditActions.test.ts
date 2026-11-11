import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { omitUndefined } from '@shared/omitUndefined'
import type { LspTextEdit, LspWorkspaceEdit, TextFile } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { fileTab } from './test/tabFixtures'

const readText = vi.fn<(path: string, encoding?: string) => Promise<TextFile>>()
const writeFile = vi.fn<(path: string, content: string, encoding?: string) => Promise<void>>()
const { api, emit } = installFakeApi({
  fs: { readText: (path, encoding) => readText(path, encoding), writeFile: (...args) => writeFile(...args) }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const { toastTitles } = await import('./test/toastTitles')
const { applyWorkspaceEdit, snapshotDocs, watchLspEdits } = await import('./workspaceEditActions')
const { loadDocument, applyTabEdits, forgetDocument } = await import('./components/editor/documentStore')
const { currentState } = await import('./components/editor/groupViews')
const { bindLspPaths, lspDocVersion } = await import('./components/editor/lspSync')
const documentState = await import('./components/editor/documentState')

const indent = { kind: 'spaces', size: 2 } as const
const insertAt = (line: number, character: number, newText: string): LspTextEdit => ({
  range: { start: { line, character }, end: { line, character } },
  newText
})
const replace = (line: number, from: number, to: number, newText: string): LspTextEdit => ({
  range: { start: { line, character: from }, end: { line, character: to } },
  newText
})
const diskFile = (text: string, encoding: TextFile['encoding'] = 'utf8'): TextFile => ({ text, encoding })
const docOf = (id: string): string => currentState(id)!.doc.toString()

function openTab(id: string, path: string, text: string): void {
  useStore.setState((s) => ({ tabs: [...s.tabs, fileTab({ id, path, dirty: false })] }))
  loadDocument(id, text, indent)
}

beforeEach(() => {
  resetStore()
  useStore.setState({ root: '/r' })
  bindLspPaths((id) => useStore.getState().tabs.find((tab) => tab.id === id)?.path)
  writeFile.mockResolvedValue(undefined)
})

afterEach(() => {
  for (const id of [...documentState.states.keys()]) forgetDocument(id)
  bindLspPaths(() => undefined)
})

describe('applyWorkspaceEdit', () => {
  it('without edits it neither reads nor writes anything', async () => {
    const result = await applyWorkspaceEdit({ files: [{ path: '/r/a.ts', edits: [] }] })
    expect(result).toEqual({ ok: true, files: 0 })
    expect(readText).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  describe('closed files (disk)', () => {
    it('edits the disk preserving CRLF and the read encoding', async () => {
      readText.mockResolvedValue(diskFile('uno\r\ndos\r\n', 'utf16le'))
      const result = await applyWorkspaceEdit({ files: [{ path: '/r/a.txt', edits: [insertAt(1, 3, '!')] }] })
      expect(result).toEqual({ ok: true, files: 1 })
      expect(writeFile).toHaveBeenCalledWith('/r/a.txt', 'uno\r\ndos!\r\n', 'utf16le')
    })

    it('LSP positions count UTF-16 units in multibyte text', async () => {
      readText.mockResolvedValue(diskFile('ação = 1\n'))
      await applyWorkspaceEdit({ files: [{ path: '/r/a.txt', edits: [replace(0, 0, 4, 'x')] }] })
      expect(writeFile).toHaveBeenCalledWith('/r/a.txt', 'x = 1\n', 'utf8')
    })

    it('rereads with the encoding the user chose in the not yet loaded tab', async () => {
      useStore.setState({
        tabs: [fileTab({ id: 'x', path: '/r/a.txt', encoding: 'windows1252', encodingChosen: true })]
      })
      readText.mockResolvedValue(diskFile('a', 'windows1252'))
      await applyWorkspaceEdit({ files: [{ path: '/r/a.txt', edits: [insertAt(0, 1, 'b')] }] })
      expect(readText).toHaveBeenCalledWith('/r/a.txt', 'windows1252')
    })

    it('a read failure returns the error and writes nothing', async () => {
      readText.mockImplementation(async (path) => {
        if (path === '/r/bad.txt') throw new Error('permission denied')
        return diskFile('ok')
      })
      const result = await applyWorkspaceEdit({
        files: [
          { path: '/r/good.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/bad.txt', edits: [insertAt(0, 0, 'x')] }
        ]
      })
      expect(result).toEqual({ ok: false, files: 0, reason: 'permission denied' })
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('rejects if the folder changed during the read', async () => {
      readText.mockImplementation(async () => {
        useStore.setState({ root: '/other' })
        return diskFile('a')
      })
      const result = await applyWorkspaceEdit({ files: [{ path: '/r/a.txt', edits: [insertAt(0, 0, 'x')] }] })
      expect(result).toMatchObject({ ok: false, reason: t().lsp.edit.folderChanged })
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('overlapping edits reject the whole set, including the other files', async () => {
      readText.mockResolvedValue(diskFile('abcdef'))
      const result = await applyWorkspaceEdit({
        files: [
          { path: '/r/a.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/b.txt', edits: [replace(0, 0, 4, 'x'), replace(0, 2, 5, 'y')] }
        ]
      })
      expect(result).toEqual({ ok: false, files: 0, reason: t().lsp.edit.overlapping })
      expect(writeFile).not.toHaveBeenCalled()
    })
  })

  describe('loaded tabs', () => {
    it('applies in the editor without writing to disk, in a single undo', async () => {
      openTab('a', '/r/a.ts', 'let a\nlet b\n')
      const result = await applyWorkspaceEdit({
        files: [
          {
            path: '/r/a.ts',
            ...omitUndefined({ version: lspDocVersion('/r/a.ts') }),
            edits: [replace(0, 4, 5, 'x'), replace(1, 4, 5, 'y')]
          }
        ]
      })
      expect(result).toEqual({ ok: true, files: 1 })
      expect(docOf('a')).toBe('let x\nlet y\n')
      expect(writeFile).not.toHaveBeenCalled()
      expect(readText).not.toHaveBeenCalled()
    })

    it('a server version different from the editor one is rejected as stale', async () => {
      openTab('a', '/r/a.ts', 'abc')
      const result = await applyWorkspaceEdit({
        files: [{ path: '/r/a.ts', version: (lspDocVersion('/r/a.ts') ?? 0) + 1, edits: [insertAt(0, 0, 'x')] }]
      })
      expect(result).toEqual({ ok: false, files: 0, reason: t().lsp.edit.stale })
      expect(docOf('a')).toBe('abc')
    })

    it('without a version the edit applies to what is in the editor', async () => {
      openTab('a', '/r/a.ts', 'abc')
      applyTabEdits('a', [{ from: 0, to: 0, insert: 'z' }])
      const result = await applyWorkspaceEdit({ files: [{ path: '/r/a.ts', edits: [insertAt(0, 4, '!')] }] })
      expect(result.ok).toBe(true)
      expect(docOf('a')).toBe('zabc!')
    })

    it('a document changed after the snapshot is rejected with the file name', async () => {
      openTab('a', '/r/dir/a.ts', 'abc')
      const snapshot = snapshotDocs()
      applyTabEdits('a', [{ from: 0, to: 0, insert: 'z' }])
      const result = await applyWorkspaceEdit(
        { files: [{ path: '/r/dir/a.ts', edits: [insertAt(0, 0, 'x')] }] },
        { snapshot }
      )
      expect(result).toEqual({ ok: false, files: 0, reason: t().lsp.edit.changedWhileWaiting('a.ts') })
      expect(docOf('a')).toBe('zabc')
    })

    it('a snapshot with equal text (even in another object) does not block', async () => {
      openTab('a', '/r/a.ts', 'abc')
      const snapshot = snapshotDocs()
      applyTabEdits('a', [{ from: 0, to: 0, insert: 'z' }])
      applyTabEdits('a', [{ from: 0, to: 1, insert: '' }])
      const result = await applyWorkspaceEdit(
        { files: [{ path: '/r/a.ts', edits: [insertAt(0, 3, '!')] }] },
        { snapshot }
      )
      expect(result.ok).toBe(true)
      expect(docOf('a')).toBe('abc!')
    })

    it('snapshotDocs only includes already loaded tabs', () => {
      openTab('a', '/r/a.ts', 'abc')
      useStore.setState((s) => ({ tabs: [...s.tabs, fileTab({ id: 'n', path: '/r/n.ts' })] }))
      expect([...snapshotDocs().keys()]).toEqual(['/r/a.ts'])
    })
  })

  describe('writing and cancellation', () => {
    it('cancelled before writing: nothing is written or edited', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      openTab('a', '/r/a.ts', 'abc')
      const result = await applyWorkspaceEdit(
        {
          files: [
            { path: '/r/d.txt', edits: [insertAt(0, 0, 'x')] },
            { path: '/r/a.ts', edits: [insertAt(0, 0, 'x')] }
          ]
        },
        { isCancelled: () => true }
      )
      expect(result).toEqual({ ok: false, files: 0, reason: t().lsp.edit.expired })
      expect(writeFile).not.toHaveBeenCalled()
      expect(docOf('a')).toBe('abc')
    })

    it('a partial disk failure reports what was written and leaves the tabs alone', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      writeFile.mockImplementation(async (path) => {
        if (path === '/r/bad.txt') throw new Error('disk full')
      })
      openTab('a', '/r/a.ts', 'abc')
      const result = await applyWorkspaceEdit({
        files: [
          { path: '/r/good.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/bad.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/a.ts', edits: [insertAt(0, 0, 'x')] }
        ]
      })
      expect(result).toEqual({
        ok: false,
        files: 1,
        reason: t().lsp.edit.writeFailedPartial('bad.txt: disk full', 'good.txt')
      })
      expect(docOf('a')).toBe('abc')
    })

    it('all writes failing uses the message without the written list', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      writeFile.mockRejectedValue(new Error('read-only'))
      const result = await applyWorkspaceEdit({ files: [{ path: '/r/a.txt', edits: [insertAt(0, 0, 'x')] }] })
      expect(result).toEqual({ ok: false, files: 0, reason: t().lsp.edit.writeFailed('a.txt: read-only') })
    })

    it('expired during the writes: the disk was already written but the tab does not receive the edit', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      openTab('a', '/r/a.ts', 'abc')
      let cancelled = false
      writeFile.mockImplementation(async () => {
        cancelled = true
      })
      const result = await applyWorkspaceEdit(
        {
          files: [
            { path: '/r/d.txt', edits: [insertAt(0, 0, 'x')] },
            { path: '/r/a.ts', edits: [insertAt(0, 0, 'x')] }
          ]
        },
        { isCancelled: () => cancelled }
      )
      expect(result).toEqual({ ok: false, files: 1, reason: t().lsp.edit.expiredDuring })
      expect(docOf('a')).toBe('abc')
    })

    it('expired during the writes but there was only disk: the result is a success', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      let cancelled = false
      writeFile.mockImplementation(async () => {
        cancelled = true
      })
      const result = await applyWorkspaceEdit(
        { files: [{ path: '/r/d.txt', edits: [insertAt(0, 0, 'x')] }] },
        { isCancelled: () => cancelled }
      )
      expect(result).toEqual({ ok: true, files: 1 })
    })

    it('a tab edited during the writes: no tab is changed and the partial result is reported', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      openTab('a', '/r/a.ts', 'abc')
      openTab('b', '/r/b.ts', 'abc')
      writeFile.mockImplementation(async () => {
        applyTabEdits('b', [{ from: 0, to: 0, insert: 'z' }])
      })
      const result = await applyWorkspaceEdit({
        files: [
          { path: '/r/d.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/a.ts', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/b.ts', edits: [insertAt(0, 0, 'x')] }
        ]
      })
      expect(result).toEqual({ ok: false, files: 1, reason: t().lsp.edit.partiallyApplied(1, 3) })
      expect(docOf('a')).toBe('abc')
      expect(docOf('b')).toBe('zabc')
    })

    it('a tab closed during the writes also counts as partial', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      openTab('a', '/r/a.ts', 'abc')
      writeFile.mockImplementation(async () => forgetDocument('a'))
      const result = await applyWorkspaceEdit({
        files: [
          { path: '/r/d.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/a.ts', edits: [insertAt(0, 0, 'x')] }
        ]
      })
      expect(result).toEqual({ ok: false, files: 1, reason: t().lsp.edit.partiallyApplied(1, 2) })
    })

    it('disk and tabs together: counts every changed file', async () => {
      readText.mockResolvedValue(diskFile('abc'))
      openTab('a', '/r/a.ts', 'abc')
      const result = await applyWorkspaceEdit({
        files: [
          { path: '/r/d.txt', edits: [insertAt(0, 0, 'x')] },
          { path: '/r/a.ts', edits: [insertAt(0, 0, 'x')] }
        ]
      })
      expect(result).toEqual({ ok: true, files: 2 })
      expect(writeFile).toHaveBeenCalledTimes(1)
      expect(docOf('a')).toBe('xabc')
    })
  })
})

describe('watchLspEdits', () => {
  const edit = (path: string, text: string): LspWorkspaceEdit => ({ files: [{ path, edits: [insertAt(0, 0, text)] }] })
  let stop: () => void

  beforeEach(() => {
    stop = watchLspEdits()
  })
  afterEach(() => stop())

  it('applies the server request and answers with success', async () => {
    readText.mockResolvedValue(diskFile('abc'))
    emit.lsp.onApplyEdit({ id: 7, edit: edit('/r/d.txt', 'x') })
    await vi.waitFor(() => expect(api.lsp.applyEditResult).toHaveBeenCalledWith(7, true, undefined))
    expect(writeFile).toHaveBeenCalledWith('/r/d.txt', 'xabc', 'utf8')
  })

  it('a failure answers the server and notifies the user with the reason', async () => {
    readText.mockRejectedValue(new Error('gone'))
    emit.lsp.onApplyEdit({ id: 8, edit: edit('/r/d.txt', 'x') })
    await vi.waitFor(() => expect(api.lsp.applyEditResult).toHaveBeenCalledWith(8, false, 'gone'))
    expect(toastTitles()).toContain(t().lsp.errors.server('gone'))
  })

  it('a request cancelled by main neither writes nor answers', async () => {
    const read = deferred<TextFile>()
    readText.mockImplementation(() => read.promise)
    emit.lsp.onApplyEdit({ id: 9, edit: edit('/r/d.txt', 'x') })
    emit.lsp.onApplyEditCancelled(9)
    read.resolve(diskFile('abc'))
    await vi.waitFor(() => expect(readText).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(writeFile).not.toHaveBeenCalled()
    expect(api.lsp.applyEditResult).not.toHaveBeenCalled()
  })

  it('after stopping, the server request is no longer handled', () => {
    stop()
    expect(() => emit.lsp.onApplyEdit({ id: 1, edit: edit('/r/d.txt', 'x') })).toThrow()
  })
})

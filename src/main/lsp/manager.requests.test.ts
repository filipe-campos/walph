import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LspApplyEditRequest, LspRefresh, LspServerStatus } from '@shared/types'
import { LspManager } from './manager'
import { makeRealTempDir } from '../testing/testEnv'

// Fake server (fixtures/fakeServer.cjs) to exercise routing, deadlines, cancellation, completion cache and
// `workspace/applyEdit` without depending on typescript-language-server.
const fake = join(import.meta.dirname, 'fixtures', 'fakeServer.cjs')

async function waitFor<T>(read: () => T | undefined | false, ms = 10_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = read()
    if (value) return value
    if (Date.now() > end) throw new Error('timeout waiting for the condition')
    await new Promise((r) => setTimeout(r, 20))
  }
}

const at = (line: number, character = 0) => ({ line, character })
const range = (l: number) => ({ start: at(l), end: at(l, 1) })

describe('LspManager: requests with a fake server', () => {
  let root: string
  let file: string
  let manager: LspManager
  let status: LspServerStatus[] = []
  const applyRequests: LspApplyEditRequest[] = []
  const cancelled: number[] = []
  const refreshes: LspRefresh[] = []
  let answerEdit: ((r: LspApplyEditRequest) => void) | null = null

  beforeAll(async () => {
    root = makeRealTempDir('walph-lsp-fake-')
    file = join(root, 'a.ts')
    writeFileSync(file, 'abc\n')
    manager = new LspManager({
      getRoot: () => root,
      getServersSetting: () => ({}),
      emitDiagnostics: () => undefined,
      emitStatus: (s) => (status = s),
      emitLog: () => undefined,
      emitApplyEdit: (r) => {
        applyRequests.push(r)
        answerEdit?.(r)
      },
      launchFor: () => ({ command: process.execPath, args: [fake], env: { ...process.env } }),
      initOptionsFor: () => undefined,
      timeouts: { hover: 400 },
      emitApplyEditCancelled: (id) => cancelled.push(id),
      emitRefresh: (r) => refreshes.push(r),
      applyEditTimeoutMs: 300
    })
    manager.open(file, 'abc\n', 1)
    await waitFor(() => status[0]?.state === 'ready')
  })

  afterAll(async () => {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  })

  it('without an open document or with a path from elsewhere returns empty/null, not an error', async () => {
    expect(await manager.hover(join(root, 'other.ts'), at(0))).toBeNull()
    expect(await manager.definition(file, at(0))).toEqual([]) // the server does not announce definition
    expect(manager.triggerCharacters(join(root, 'other.ts'))).toEqual({
      completion: [],
      signature: [],
      signatureRetrigger: []
    })
    expect(manager.triggerCharacters(file).completion).toEqual(['.'])
  })

  it('hover normalizes the markup', async () => {
    expect(await manager.hover(file, at(3))).toEqual({ contents: { kind: 'markdown', value: 'hover 3' } })
  })

  it('completion keeps only the last list and resolves by index', async () => {
    const first = await manager.completion(file, at(0), '.')
    expect(first?.items.map((i) => i.label)).toEqual(['alpha', 'beta'])
    expect(first?.items[0]).toMatchObject({ kind: 3, resolvable: true })
    const resolved = await manager.resolveCompletion(first!.resultId, 1)
    expect(resolved).toMatchObject({ label: 'beta', detail: 'resolved 2', resolvable: false })
    expect(resolved?.documentation).toEqual({ kind: 'plaintext', value: 'doc' })

    const second = await manager.completion(file, at(0))
    expect(second!.resultId).not.toBe(first!.resultId)
    expect(await manager.resolveCompletion(first!.resultId, 0)).toBeNull()
    expect(await manager.resolveCompletion(second!.resultId, 9)).toBeNull()
    expect(await manager.resolveCompletion(second!.resultId, 0)).not.toBeNull()
  })

  it('a new completion cancels the previous in-flight one (which resolves null)', async () => {
    const slow = manager.completion(file, at(98))
    await new Promise((r) => setTimeout(r, 50))
    const fast = await manager.completion(file, at(0))
    expect(fast?.items).toHaveLength(2)
    expect(await slow).toBeNull()
  })

  it('hitting the deadline rejects with a pt-BR message and the server stays usable', async () => {
    await expect(manager.hover(file, at(99))).rejects.toThrow(/demorou demais.*hover/)
    expect(await manager.hover(file, at(1))).not.toBeNull()
  })

  it('prepareRename and rename: a text edit passes; creating a file and a server error reject', async () => {
    expect(await manager.prepareRename(file, at(0))).toEqual({
      range: { start: at(0), end: at(0, 3) },
      placeholder: 'abc'
    })
    // Server refusal with an error = "cannot rename there".
    expect(await manager.prepareRename(file, at(7))).toBeNull()
    expect(await manager.rename(file, at(0), 'renamed')).toEqual({
      files: [{ path: file, version: 1, edits: [{ range: { start: at(0), end: at(0, 3) }, newText: 'renamed' }] }]
    })
    await expect(manager.rename(file, at(0), 'create')).rejects.toThrow(/criar, renomear ou apagar/)
    await expect(manager.rename(file, at(0), 'error')).rejects.toThrow('Servidor de linguagem: invalid name')
  })

  it('codeActions: resolves those without an edit, drops those still empty and keeps commands', async () => {
    const actions = await manager.codeActions(file, range(0))
    expect(actions.map((a) => a.title)).toEqual(['Already done', 'Needs resolve', 'Command'])
    expect(actions[0].edit?.files[0].path).toBe(file)
  })

  it('executeCommand only accepts commands announced by the server', async () => {
    await expect(manager.executeCommand(file, { title: 'x', command: 'fake.ok' })).resolves.toBeUndefined()
    await expect(manager.executeCommand(file, { title: 'x', command: 'rm.rf' })).rejects.toThrow(/não aceita o comando/)
  })

  it('workspace/applyEdit: the renderer applies and the server receives applied', async () => {
    answerEdit = (r) => manager.resolveApplyEdit(r.id, true)
    const hover = await manager.hover(file, at(50))
    expect(hover?.contents.value).toBe('applied=true')
    expect(applyRequests.at(-1)).toMatchObject({ label: 'Test', edit: { files: [{ path: file }] } })
  })

  it('workspace/applyEdit: renderer refusal and deadline become applied=false', async () => {
    answerEdit = (r) => manager.resolveApplyEdit(r.id, false, 'dirty tab')
    expect((await manager.hover(file, at(50)))?.contents.value).toBe('applied=false dirty tab')
    answerEdit = null
    const timedOut = await manager.hover(file, at(50))
    expect(timedOut?.contents.value).toMatch(/^applied=false/)
    // The renderer is told to abort whatever it is still applying
    expect(cancelled).toContain(applyRequests.at(-1)!.id)
  })

  it('workspace/applyEdit with a file creation is refused without reaching the renderer', async () => {
    const before = applyRequests.length
    const hover = await manager.hover(file, at(51))
    expect(hover?.contents.value).toMatch(/applied=false .*criar, renomear ou apagar/)
    expect(applyRequests).toHaveLength(before)
  })

  it('inlay hints and document highlights arrive normalized', async () => {
    const hints = await manager.inlayHints(file, { start: at(0, 1), end: at(1) })
    expect(hints).toEqual([
      { position: at(0, 1), label: [{ value: 'start:' }], kind: 'parameter', paddingLeft: false, paddingRight: true }
    ])
    expect(await manager.documentHighlights(file, at(0))).toEqual([
      { range: { start: at(0), end: at(0, 3) }, kind: 'write' },
      { range: { start: at(1), end: at(1, 3) }, kind: 'read' }
    ])
  })

  it('semantic tokens: full, then a delta over it; a refused delta falls back to the full request', async () => {
    expect(await manager.semanticTokens(file)).toEqual({
      types: ['variable', 'function'],
      modifiers: ['readonly'],
      data: [0, 0, 3, 0, 1]
    })
    expect((await manager.semanticTokens(file))?.data).toEqual([0, 0, 3, 1, 1])
    expect((await manager.semanticTokens(file))?.data).toEqual([0, 0, 3, 0, 1])
  })

  it('server workspace/semanticTokens/refresh reaches the renderer', async () => {
    expect((await manager.hover(file, at(70)))?.contents.value).toBe('refreshed')
    expect(refreshes).toContainEqual({ kind: 'semanticTokens', serverId: 'typescript' })
  })

  it('the built-in server receives the code lens settings after initialized', async () => {
    const settings = JSON.parse((await manager.hover(file, at(62)))?.contents.value ?? 'null')
    expect(settings.typescript.referencesCodeLens.enabled).toBe(true)
  })

  it('codeLens: list stored per document, resolves by index and locations ready for the peek', async () => {
    const list = await manager.codeLens(file)
    expect(list?.resolvable).toBe(true)
    expect(list?.lenses).toEqual([
      { range: { start: at(0), end: at(0, 3) } },
      {
        range: { start: at(1), end: at(1, 1) },
        command: { title: 'ready', command: { title: 'ready', command: 'fake.ok' } }
      }
    ])
    const resolved = await manager.resolveCodeLens(file, list!.resultId, 0)
    expect(resolved?.command).toEqual({
      title: '1 reference',
      locations: [{ path: file, range: { start: at(0, 1), end: at(0, 2) } }]
    })
    // Replaced list, out-of-range index or another document: nothing to resolve.
    const next = await manager.codeLens(file)
    expect(await manager.resolveCodeLens(file, list!.resultId, 0)).toBeNull()
    expect(await manager.resolveCodeLens(file, next!.resultId, 9)).toBeNull()
    expect(await manager.resolveCodeLens(join(root, 'other.ts'), next!.resultId, 0)).toBeNull()
  })

  it('server workspace/codeLens/refresh reaches the renderer', async () => {
    expect((await manager.hover(file, at(61)))?.contents.value).toBe('refreshed')
    expect(refreshes).toContainEqual({ kind: 'codeLens', serverId: 'typescript' })
  })

  it('call hierarchy: items stored in main, neighbors by id and only in the kind direction', async () => {
    const [root0] = await manager.prepareHierarchy('call', file, at(0))
    expect(root0).toMatchObject({ kind: 'call', name: 'abc', symbolKind: 12, path: file })
    expect(await manager.prepareHierarchy('type', file, at(0))).toEqual([]) // no typeHierarchyProvider
    const incoming = await manager.hierarchyRelated(root0.id, 'incoming')
    expect(incoming).toEqual([
      {
        item: expect.objectContaining({ name: 'in:root', path: file }),
        ranges: [{ start: at(0, 1), end: at(0, 2) }]
      }
    ])
    // The child item stores its own raw item: expanding again passes its `data` to the server.
    const deeper = await manager.hierarchyRelated(incoming[0].item.id, 'outgoing')
    expect(deeper[0]?.item.name).toBe('out:root>')
    expect(await manager.hierarchyRelated(root0.id, 'supertypes')).toEqual([])
    expect(await manager.hierarchyRelated(123456, 'incoming')).toEqual([])
  })

  it('a request during the restart resolves empty right away, without waiting for the deadline', async () => {
    const restarting = manager.restart()
    await new Promise((r) => setTimeout(r, 0))
    const started = Date.now()
    expect(await manager.hover(file, at(99))).toBeNull()
    expect(Date.now() - started).toBeLessThan(200)
    await restarting
    await waitFor(() => status[0]?.state === 'ready')
  })

  it('shutting down the manager with a pending edit leaves nothing waiting', async () => {
    answerEdit = null
    const before = applyRequests.length
    const pending = manager.hover(file, at(50))
    await waitFor(() => applyRequests.length > before)
    await manager.shutdown()
    // The server was shut down too: the request ends (with an error or answer), never hangs.
    await Promise.allSettled([pending])
    expect(await manager.hover(file, at(0))).toBeNull()
  })
})

describe('LspManager: workspace/didChangeWatchedFiles', () => {
  let root: string
  let manager: LspManager
  let status: LspServerStatus[] = []
  let open: string

  beforeAll(async () => {
    root = makeRealTempDir('walph-lsp-watch-')
    open = join(root, 'a.ts')
    manager = new LspManager({
      getRoot: () => root,
      getServersSetting: () => ({}),
      emitDiagnostics: () => undefined,
      emitStatus: (s) => (status = s),
      emitLog: () => undefined,
      launchFor: () => ({
        command: process.execPath,
        args: [fake],
        env: { ...process.env, FAKE_WATCH_BASE: pathToFileURL(join(root, 'sub')).href }
      }),
      initOptionsFor: () => undefined
    })
    manager.open(open, '', 1)
    await waitFor(() => status[0]?.state === 'ready')
  })

  afterAll(async () => {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  })

  it('sends only what the registered watchers ask for, ignores change of an open file', async () => {
    // The registration arrives after `initialized`: retries until something shows up.
    const changes = [
      { path: join(root, 'x.watch'), type: 'add' as const }, // kind 5 includes create
      { path: join(root, 'y.watch'), type: 'change' as const }, // outside the kind
      { path: join(root, 'z.txt'), type: 'unlink' as const }, // no glob
      { path: join(root, 'sub', 'k.rel'), type: 'change' as const }, // RelativePattern, default kind
      { path: open, type: 'change' as const } // open: ignored
    ]
    let received: Array<{ uri: string; type: number }> = []
    const end = Date.now() + 10_000
    while (Date.now() < end && received.length === 0) {
      manager.fileChanges(changes)
      await new Promise((r) => setTimeout(r, 100))
      received = JSON.parse((await manager.hover(open, at(60)))?.contents.value ?? '[]')
    }
    const types = received.map((r) => `${r.uri.split('/').slice(-1)[0]}:${r.type}`)
    expect(new Set(types)).toEqual(new Set(['x.watch:1', 'k.rel:2']))
  })
})

import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ServerCaps } from './capabilities'
import type { ManagedDoc } from './documentMirror'
import { requests, REQUEST_TIMEOUTS_MS, type RequestHost, type Target } from './requests'
import { ServerResponseError } from './server'
import { pathToUri } from './uri'

// Server URIs become native paths (with the drive on Windows).
const A = resolve('/p/a.ts')
const B = resolve('/p/b.ts')

const caps = (over: Partial<ServerCaps> = {}): ServerCaps => ({
  completion: true,
  completionResolve: true,
  completionTriggers: ['.'],
  hover: true,
  signatureHelp: true,
  signatureTriggers: ['('],
  signatureRetriggers: [','],
  definition: true,
  references: true,
  rename: true,
  prepareRename: false,
  formatting: true,
  codeAction: true,
  codeActionResolve: false,
  documentSymbol: true,
  workspaceSymbol: true,
  executeCommands: null,
  inlayHint: true,
  documentHighlight: true,
  semanticTokens: { types: ['variable', 'function'], modifiers: ['readonly'], delta: true },
  implementation: true,
  typeDefinition: true,
  declaration: false,
  codeLens: true,
  codeLensResolve: true,
  callHierarchy: true,
  typeHierarchy: false,
  ...over
})

const doc = (text = 'const fooBar = 1'): ManagedDoc => ({
  path: '/p/a.ts',
  key: '/p/a.ts',
  uri: 'file:///p/a.ts',
  languageId: 'typescript',
  text,
  version: 1,
  serverId: 'ts',
  diagnostics: []
})

const target = (over: Partial<ServerCaps> = {}, text?: string): Target =>
  ({ doc: doc(text), entry: { def: { id: 'ts' }, server: { runId: 3 } }, caps: caps(over) }) as unknown as Target

const host = (): RequestHost => ({
  canon: () => (p) => p,
  editContext: () => ({ root: '/p' }),
  storeCompletion: vi.fn(() => 42),
  storeCodeLenses: vi.fn(() => 7),
  storeHierarchyItem: vi.fn(() => 9),
  requestRaw: vi.fn()
})

const pos = { line: 0, character: 8 }

describe('requests: request table', () => {
  it('each request uses a known deadline and the exclusive keys are only the typing ones', () => {
    for (const spec of Object.values(requests)) expect(REQUEST_TIMEOUTS_MS[spec.kind]).toBeGreaterThan(0)
    const exclusive = Object.entries(requests)
      .filter(([, s]) => s.exclusive)
      .map(([name, s]) => [name, s.exclusive])
    expect(exclusive).toEqual([
      ['completion', 'completion'],
      ['hover', 'hover'],
      ['signatureHelp', 'signature'],
      ['documentHighlights', 'documentHighlights']
    ])
  })

  it('the capability decides whether the request is made', () => {
    expect(requests.hover.cap(caps({ hover: false }))).toBe(false)
    expect(requests.codeActions.cap(caps())).toBe(true)
    expect(requests.rename.cap(caps({ rename: false }))).toBe(false)
  })

  it('completion marks TriggerCharacter only if the server declared the character', () => {
    const t = target()
    expect(requests.completion.params(t, pos, '.')).toEqual({
      textDocument: { uri: 'file:///p/a.ts' },
      position: pos,
      context: { triggerKind: 2, triggerCharacter: '.' }
    })
    expect(requests.completion.params(t, pos, ';')).toMatchObject({ context: { triggerKind: 1 } })
    expect(requests.completion.params(t, pos)).toMatchObject({ context: { triggerKind: 1 } })
  })

  it('completion stores the list in the host and returns the id; null stays null', async () => {
    const h = host()
    const t = target()
    const list = await requests.completion.normalize({ items: [{ label: 'alpha' }] }, t, h, pos)
    expect(list).toMatchObject({ resultId: 42, items: [{ label: 'alpha' }] })
    expect(h.storeCompletion).toHaveBeenCalledOnce()
    expect(await requests.completion.normalize(null, t, h, pos)).toBeNull()
  })

  it('signatureHelp accepts the server trigger and retrigger', () => {
    const t = target()
    expect(requests.signatureHelp.params(t, pos, ',')).toMatchObject({
      context: { triggerKind: 2, triggerCharacter: ',', isRetrigger: false }
    })
    expect(requests.signatureHelp.params(t, pos, 'x')).toMatchObject({
      context: { triggerKind: 1, isRetrigger: false }
    })
  })

  it('references includes the declaration and rename carries the new name', () => {
    const t = target()
    expect(requests.references.params(t, pos)).toMatchObject({ context: { includeDeclaration: true } })
    expect(requests.rename.params(t, pos, 'renamed')).toMatchObject({ newName: 'renamed' })
  })

  it('rename without files becomes null', () => {
    const t = target()
    expect(requests.rename.normalize({ changes: {} }, t, host(), pos, 'x')).toBeNull()
    expect(requests.rename.normalize(null, t, host(), pos, 'x')).toBeNull()
  })

  it('prepareRename without server support uses the word under the cursor, without going to the server', () => {
    const t = target({ prepareRename: false })
    expect(requests.prepareRename.shortcut?.(t, pos)).toEqual({
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
      placeholder: 'fooBar'
    })
    expect(requests.prepareRename.shortcut?.(target({ prepareRename: false }, '   '), pos)).toBeNull()
    expect(requests.prepareRename.shortcut?.(target({ prepareRename: true }), pos)).toBeUndefined()
  })

  it('prepareRename: server refusal becomes null; other errors propagate', () => {
    expect(requests.prepareRename.recover?.(new ServerResponseError('x'))).toBeNull()
    const boom = new Error('crash')
    expect(() => requests.prepareRename.recover?.(boom)).toThrow(boom)
  })

  it('codeActions without resolve returns only the actionable ones', async () => {
    const raw = [{ title: 'With command', command: { title: 'x', command: 'c' } }, { title: 'Empty' }]
    const result = await requests.codeActions.normalize(raw, target(), host(), { start: pos, end: pos })
    expect(result.map((a) => a.title)).toEqual(['With command'])
    expect(await requests.codeActions.normalize({}, target(), host(), { start: pos, end: pos })).toEqual([])
  })

  it('codeActions resolves those that came without an edit and ignores a resolve failure', async () => {
    const h = host()
    vi.mocked(h.requestRaw).mockImplementation(async (_t, _m, params) => {
      const title = (params as { title: string }).title
      if (title === 'Failure') throw new Error('x')
      return { edit: { changes: { 'file:///p/a.ts': [{ range: { start: pos, end: pos }, newText: 'z' }] } } }
    })
    const raw = [{ title: 'Resolve' }, { title: 'Failure' }]
    const result = await requests.codeActions.normalize(raw, target({ codeActionResolve: true }), h, {
      start: pos,
      end: pos
    })
    expect(result.map((a) => a.title)).toEqual(['Resolve'])
    expect(h.requestRaw).toHaveBeenCalledTimes(2)
    expect(vi.mocked(h.requestRaw).mock.calls[0].slice(1, 2)).toEqual(['codeAction/resolve'])
  })

  it('semanticTokens stores the result with resultId and the delta starts from it', async () => {
    const t = target()
    const full = await requests.semanticTokens.normalize({ resultId: 'r1', data: [0, 6, 6, 0, 1] }, t, host())
    expect(full).toEqual({ types: ['variable', 'function'], modifiers: ['readonly'], data: [0, 6, 6, 0, 1] })
    const previous = t.doc.semanticTokens
    expect(previous).toEqual({ resultId: 'r1', data: [0, 6, 6, 0, 1], serverId: 'ts', runId: 3 })
    if (!previous) throw new Error('no cache')
    expect(requests.semanticTokensDelta.params(t, previous)).toMatchObject({ previousResultId: 'r1' })
    const delta = await requests.semanticTokensDelta.normalize(
      { resultId: 'r2', edits: [{ start: 3, deleteCount: 1, data: [1] }] },
      t,
      host(),
      previous
    )
    expect(delta?.data).toEqual([0, 6, 6, 1, 1])
    expect(t.doc.semanticTokens?.resultId).toBe('r2')
    expect(await requests.semanticTokens.normalize(null, t, host())).toBeNull()
    expect(t.doc.semanticTokens).toBeUndefined()
  })

  it('semanticTokens requests nothing for a document too large or without a legend', () => {
    expect(requests.semanticTokens.shortcut?.(target({}, 'x'.repeat(3_000_001)))).toBeNull()
    expect(requests.semanticTokens.shortcut?.(target())).toBeUndefined()
    expect(requests.semanticTokens.cap(caps({ semanticTokens: null }))).toBe(false)
    expect(requests.semanticTokensDelta.cap(caps({ semanticTokens: { types: [], modifiers: [], delta: false } }))).toBe(
      false
    )
  })

  it('inlayHints carries the range and documentHighlights the position', () => {
    const range = { start: pos, end: { line: 3, character: 0 } }
    expect(requests.inlayHints.params(target(), range)).toMatchObject({ range })
    expect(requests.documentHighlights.params(target(), pos)).toMatchObject({ position: pos })
  })

  it('implementation, type and declaration: own methods, per-method capability and normalized locations', () => {
    expect(requests.implementation.method).toBe('textDocument/implementation')
    expect(requests.typeDefinition.method).toBe('textDocument/typeDefinition')
    expect(requests.declaration.method).toBe('textDocument/declaration')
    expect(requests.declaration.cap(caps())).toBe(false)
    expect(requests.implementation.cap(caps())).toBe(true)
    expect(requests.typeDefinition.params(target(), pos)).toEqual({
      textDocument: { uri: 'file:///p/a.ts' },
      position: pos
    })
    const link = {
      targetUri: pathToUri(B),
      targetRange: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
      targetSelectionRange: { start: { line: 1, character: 9 }, end: { line: 1, character: 12 } }
    }
    expect(
      requests.implementation.normalize([link, { uri: 'untitled:x', range: link.targetRange }], target(), host(), pos)
    ).toEqual([{ path: B, range: link.targetSelectionRange }])
  })

  it('codeLens stores the raw items in the host and says whether it can resolve; null stays null', async () => {
    const h = host()
    const range = { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } }
    const raw = [{ range }, { range: 'x' }, { range, command: { title: '2 references', command: 'x.run' } }]
    const result = await requests.codeLens.normalize(raw, target(), h)
    expect(result).toEqual({
      resultId: 7,
      resolvable: true,
      lenses: [
        { range },
        { range, command: { title: '2 references', command: { title: '2 references', command: 'x.run' } } }
      ]
    })
    expect(vi.mocked(h.storeCodeLenses).mock.calls[0]?.[1]).toEqual([raw[0], raw[2]])
    expect(await requests.codeLens.normalize(null, target(), h)).toBeNull()
  })

  it('prepareCallHierarchy stores each raw item and returns its id', async () => {
    const h = host()
    const range = { start: { line: 0, character: 0 }, end: { line: 4, character: 1 } }
    const raw = [{ name: 'run', kind: 12, uri: pathToUri(A), range, selectionRange: range, data: 1 }, { name: 'x' }]
    const items = await requests.prepareCallHierarchy.normalize(raw, target(), h, pos)
    expect(items).toEqual([{ id: 9, kind: 'call', name: 'run', symbolKind: 12, path: A, range, selectionRange: range }])
    expect(h.storeHierarchyItem).toHaveBeenCalledWith(expect.anything(), 'call', raw[0])
    expect(requests.prepareTypeHierarchy.cap(caps())).toBe(false)
  })
})

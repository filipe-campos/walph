import { CompletionContext, type Completion, type CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { LspApi, LspCompletionItem, LspCompletionList } from '@shared/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../test/deferred'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import type { LspHost } from './lspHost'
import { completionIcon, lspCompletion } from './lspCompletion'

const completion = vi.fn<LspApi['completion']>()
const resolveCompletion = vi.fn<LspApi['resolveCompletion']>()
const triggerCharacters = vi.fn<LspApi['triggerCharacters']>()

const item = (label: string, extra: Partial<LspCompletionItem> = {}): LspCompletionItem => ({
  label,
  insertText: label,
  insertTextFormat: 'plain',
  resolvable: false,
  ...extra
})
const list = (items: LspCompletionItem[], extra: Partial<LspCompletionList> = {}): LspCompletionList => ({
  resultId: 7,
  isIncomplete: false,
  items,
  ...extra
})

function setup(doc: string, cursor = doc.length, host: Partial<LspHost> = {}, path: string | null = '/r/a.ts') {
  installFakeApi({ lsp: { completion, resolveCompletion, triggerCharacters } })
  triggerCharacters.mockResolvedValue({ completion: ['.'], signature: [], signatureRetrigger: [] })
  const editor = mountEditor({ doc, extensions: [lspCompletion('t1')], selection: { anchor: cursor }, host, path })
  const request = async (explicit = false, aborted = false): Promise<CompletionResult | null> => {
    const [source] = editor.view.state.languageDataAt<(ctx: CompletionContext) => Promise<CompletionResult | null>>(
      'autocomplete',
      cursor
    )
    const ctx = new CompletionContext(editor.view.state, cursor, explicit)
    if (aborted) Object.defineProperty(ctx, 'abortListeners', { value: null })
    return source(ctx)
  }
  return { ...editor, request }
}

const optionOf = (result: CompletionResult, label: string): Completion => result.options.find((o) => o.label === label)!

function apply(view: EditorView, option: Completion, from: number, to: number): void {
  ;(option.apply as (v: EditorView, c: Completion, f: number, t: number) => void)(view, option, from, to)
}

afterEach(() => {
  unmountEditors()
})

describe('LSP completion source', () => {
  it('without a server, with a server not ready yet or a tab without a path: asks for nothing', async () => {
    for (const args of [
      [{ serverFor: () => null }, '/r/a.ts'],
      [{ serverFor: () => ({ id: 's', ready: false }) }, '/r/a.ts'],
      [{}, null]
    ] as const) {
      const { request } = setup('fo', 2, args[0], args[1])
      expect(await request()).toBeNull()
      unmountEditors()
    }
    expect(completion).not.toHaveBeenCalled()
  })

  it('asks main at the cursor LSP position (UTF-16, 0-based line) and returns the word as the start', async () => {
    completion.mockResolvedValue(list([item('foo')]))
    const { request } = setup('a\n😀 fo')
    const result = (await request())!
    expect(completion).toHaveBeenCalledExactlyOnceWith('/r/a.ts', { line: 1, character: 5 }, undefined)
    expect(result.from).toBe(5)
    expect(result.options.map((o) => o.label)).toEqual(['foo'])
  })

  it('sorts by the server sortText and turns the order into a decreasing boost', async () => {
    completion.mockResolvedValue(
      list([item('c', { sortText: '3' }), item('a', { sortText: '1' }), item('b', { sortText: '2' })])
    )
    const { request } = setup('x')
    const result = (await request())!
    expect(result.options.map((o) => o.label)).toEqual(['a', 'b', 'c'])
    const boosts = result.options.map((o) => o.boost!)
    expect(boosts[0]).toBeGreaterThan(boosts[1])
    expect(boosts[1]).toBeGreaterThan(boosts[2])
  })

  it('uses filterText as the label, keeps the original one in displayLabel; the type comes from kind', async () => {
    completion.mockResolvedValue(list([item('Foo()', { filterText: 'foo', kind: 2, detail: 'void' })]))
    const { request } = setup('f')
    const [option] = (await request())!.options
    expect(option).toMatchObject({ label: 'foo', displayLabel: 'Foo()', type: 'method', detail: 'void' })
  })

  it('a complete list holds for what is typed later; an incomplete one asks again on every keystroke', async () => {
    completion.mockResolvedValue(list([item('foo')]))
    const complete = setup('f')
    expect((await complete.request())!.validFor).toBeInstanceOf(RegExp)
    unmountEditors()
    completion.mockResolvedValue(list([item('foo')], { isIncomplete: true }))
    expect((await setup('f').request())!.validFor).toBeUndefined()
  })

  it('a number does not trigger unless explicitly requested (Ctrl+Space)', async () => {
    completion.mockResolvedValue(list([item('12x')]))
    const { request } = setup('12')
    expect(await request()).toBeNull()
    expect(completion).not.toHaveBeenCalled()
    expect(await request(true)).not.toBeNull()
  })

  it('after a server trigger character it asks with triggerCharacter', async () => {
    completion.mockResolvedValue(list([item('bar')]))
    const { request } = setup('foo.')
    const result = (await request())!
    expect(completion).toHaveBeenCalledWith('/r/a.ts', { line: 0, character: 4 }, '.')
    expect(result.from).toBe(4)
  })

  it('empty word after a non-trigger character: only the explicit request queries the server', async () => {
    completion.mockResolvedValue(list([item('bar')]))
    const { request } = setup('foo ')
    expect(await request()).toBeNull()
    expect(completion).not.toHaveBeenCalled()
    await request(true)
    expect(completion).toHaveBeenCalledWith('/r/a.ts', { line: 0, character: 4 }, undefined)
  })

  it('an empty document without an explicit request does not query', async () => {
    const { request } = setup('')
    expect(await request()).toBeNull()
    expect(completion).not.toHaveBeenCalled()
  })

  it('a server error, an empty or null list and an aborted context result in nothing', async () => {
    const { request } = setup('f')
    completion.mockRejectedValueOnce(new Error('boom'))
    expect(await request()).toBeNull()
    completion.mockResolvedValueOnce(list([]))
    expect(await request()).toBeNull()
    completion.mockResolvedValueOnce(null)
    expect(await request()).toBeNull()
    completion.mockResolvedValueOnce(list([item('foo')]))
    expect(await request(false, true)).toBeNull()
  })
})

describe('applying an item', () => {
  it('plain text replaces the typed word and leaves the cursor after it', async () => {
    completion.mockResolvedValue(list([item('foobar')]))
    const { view, request } = setup('x fo')
    const result = (await request())!
    apply(view, optionOf(result, 'foobar'), 2, 4)
    expect(view.state.doc.toString()).toBe('x foobar')
    expect(view.state.selection.main.head).toBe(8)
  })

  it('without insertText it falls back to the label', async () => {
    completion.mockResolvedValue(list([item('lbl', { insertText: '' })]))
    const { view, request } = setup('l')
    apply(view, optionOf((await request())!, 'lbl'), 0, 1)
    expect(view.state.doc.toString()).toBe('lbl')
  })

  it('a server textEdit uses the new text and starts at the smaller of its start and the word start', async () => {
    completion.mockResolvedValue(
      list([
        item('log', {
          textEdit: {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
            newText: 'console.log'
          }
        })
      ])
    )
    const { view, request } = setup('console.lo')
    apply(view, optionOf((await request())!, 'log'), 8, 10)
    expect(view.state.doc.toString()).toBe('console.log')
  })

  it('extra edits (auto-import) go in together and shift the cursor', async () => {
    completion.mockResolvedValue(
      list([
        item('useX', {
          additionalTextEdits: [
            { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'import x\n' }
          ]
        })
      ])
    )
    const { view, request } = setup('\nus')
    apply(view, optionOf((await request())!, 'useX'), 1, 3)
    expect(view.state.doc.toString()).toBe('import x\n\nuseX')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('an extra edit ending after the insertion point is discarded', async () => {
    completion.mockResolvedValue(
      list([
        item('foo', {
          additionalTextEdits: [
            { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '//' }
          ]
        })
      ])
    )
    const { view, request } = setup('f\nlinha', 1)
    apply(view, optionOf((await request())!, 'foo'), 0, 1)
    expect(view.state.doc.toString()).toBe('foo\nlinha')
  })

  it('an extra edit with a position outside the document is ignored without breaking the application', async () => {
    completion.mockResolvedValue(
      list([
        item('foo', {
          additionalTextEdits: [
            { range: { start: { line: 99, character: 0 }, end: { line: 99, character: 0 } }, newText: 'x' }
          ]
        })
      ])
    )
    const { view, request } = setup('f')
    apply(view, optionOf((await request())!, 'foo'), 0, 1)
    expect(view.state.doc.toString()).toBe('foo')
  })

  it('a snippet becomes CodeMirror fields, with the cursor on the first field', async () => {
    completion.mockResolvedValue(
      list([item('fn', { insertText: 'fn(${1:arg}, ${2:other})$0', insertTextFormat: 'snippet' })])
    )
    const { view, request } = setup('f')
    apply(view, optionOf((await request())!, 'fn'), 0, 1)
    expect(view.state.doc.toString()).toBe('fn(arg, other)')
    expect(view.state.selection.main).toMatchObject({ from: 3, to: 6 })
  })

  it('a snippet with auto-import shifts the range by what was inserted before', async () => {
    completion.mockResolvedValue(
      list([
        item('fn', {
          insertText: 'fn($1)',
          insertTextFormat: 'snippet',
          additionalTextEdits: [
            { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'import\n' }
          ]
        })
      ])
    )
    const { view, request } = setup('\nf')
    apply(view, optionOf((await request())!, 'fn'), 1, 2)
    expect(view.state.doc.toString()).toBe('import\n\nfn()')
    expect(view.state.selection.main.head).toBe(view.state.doc.length - 1)
  })
})

describe('item resolution', () => {
  const importEdit = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    newText: 'import y\n'
  }

  it('auto-import edits arriving on resolve after Enter go in if nothing changed before the cursor', async () => {
    const resolution = deferred<LspCompletionItem>()
    resolveCompletion.mockReturnValue(resolution.promise)
    completion.mockResolvedValue(list([item('useY', { resolvable: true })]))
    const { view, request } = setup('\nus')
    apply(view, optionOf((await request())!, 'useY'), 1, 3)
    expect(view.state.doc.toString()).toBe('\nuseY')
    expect(resolveCompletion).toHaveBeenCalledExactlyOnceWith(7, 0)

    resolution.resolve(item('useY', { additionalTextEdits: [importEdit] }))
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('import y\n\nuseY'))
  })

  it('if the text before the cursor changed while resolving, the late edits are discarded', async () => {
    const resolution = deferred<LspCompletionItem>()
    resolveCompletion.mockReturnValue(resolution.promise)
    completion.mockResolvedValue(list([item('useY', { resolvable: true })]))
    const { view, request } = setup('\nus')
    apply(view, optionOf((await request())!, 'useY'), 1, 3)
    view.dispatch({ changes: { from: 0, insert: '// ' } })
    resolution.resolve(item('useY', { additionalTextEdits: [importEdit] }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(view.state.doc.toString()).toBe('// \nuseY')
  })

  it('a failing resolve does not prevent the application', async () => {
    resolveCompletion.mockRejectedValue(new Error('x'))
    completion.mockResolvedValue(list([item('useY', { resolvable: true })]))
    const { view, request } = setup('us')
    apply(view, optionOf((await request())!, 'useY'), 0, 2)
    expect(view.state.doc.toString()).toBe('useY')
  })
})

describe('item information', () => {
  const infoOf = async (option: Completion): Promise<Node | null> => {
    const info = option.info as (c: Completion) => Promise<Node | null>
    return info(option)
  }

  it('a resolvable item shows the detail and documentation of the resolved item', async () => {
    resolveCompletion.mockResolvedValue(
      item('foo', { detail: 'function foo(): void', documentation: { kind: 'plaintext', value: 'Does foo.' } })
    )
    completion.mockResolvedValue(list([item('foo', { resolvable: true })]))
    const { request } = setup('f')
    const dom = (await infoOf(optionOf((await request())!, 'foo'))) as HTMLElement
    expect(dom.className).toBe('lsp-completion-info')
    expect(dom.querySelector('.lsp-info-detail')!.textContent).toBe('function foo(): void')
    expect(dom.querySelector('.lsp-doc')!.textContent).toContain('Does foo.')
  })

  it('the item is resolved only once even with several queries', async () => {
    resolveCompletion.mockResolvedValue(item('foo', { detail: 'd' }))
    completion.mockResolvedValue(list([item('foo', { resolvable: true })]))
    const { request } = setup('f')
    const option = optionOf((await request())!, 'foo')
    await infoOf(option)
    await infoOf(option)
    expect(resolveCompletion).toHaveBeenCalledTimes(1)
  })

  it('a null or failing resolve falls back to the original item', async () => {
    resolveCompletion.mockResolvedValueOnce(null)
    completion.mockResolvedValue(
      list([item('a', { resolvable: true, detail: 'da' }), item('b', { resolvable: true, detail: 'db' })])
    )
    const { request } = setup('x')
    const result = (await request())!
    const a = (await infoOf(optionOf(result, 'a'))) as HTMLElement
    expect(a.querySelector('.lsp-info-detail')!.textContent).toBe('da')
    resolveCompletion.mockRejectedValueOnce(new Error('x'))
    const b = (await infoOf(optionOf(result, 'b'))) as HTMLElement
    expect(b.querySelector('.lsp-info-detail')!.textContent).toBe('db')
  })

  it('an item without documentation and not resolvable has no info panel', async () => {
    completion.mockResolvedValue(list([item('foo', { detail: 'detail only' })]))
    const { request } = setup('f')
    expect(optionOf((await request())!, 'foo').info).toBeUndefined()
  })

  it('without detail or documentation the info is null', async () => {
    resolveCompletion.mockResolvedValue(item('foo', { documentation: { kind: 'plaintext', value: '   ' } }))
    completion.mockResolvedValue(list([item('foo', { resolvable: true })]))
    const { request } = setup('f')
    expect(await infoOf(optionOf((await request())!, 'foo'))).toBeNull()
  })
})

describe('item icon', () => {
  it('draws the type codicon with the color group class', () => {
    const el = completionIcon.render({ label: 'x', type: 'method' }) as HTMLElement
    expect(el.className).toBe('codicon codicon-symbol-method cm-completionKind kind-function')
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('an unknown type uses the neutral group', () => {
    const el = completionIcon.render({ label: 'x', type: 'nonexistent' }) as HTMLElement
    expect(el.className).toContain('kind-other')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const manager = vi.hoisted(() => ({
  current: null as Record<string, (...args: unknown[]) => unknown> | null
}))

vi.mock('electron', () => harness.electronMock)
vi.mock('../lsp/registry', () => ({
  lspManagerOf: () => manager.current,
  ensureLspManager: () => manager.current,
  syncLspActivity: () => undefined,
  killAllLsp: () => undefined
}))
vi.mock('../window/windows', () => ({
  onWindowRootChange: () => () => undefined,
  onWorkspaceEvent: () => () => undefined
}))
vi.mock('../workspace/viewWatchers', () => ({ onWorkspaceFiles: () => () => undefined }))
vi.mock('../settings/state', () => ({ onSettingsChange: () => () => undefined }))

const pos = { line: 1, character: 2 }

describe('ipc/lsp: requests generated from the table', () => {
  const wc = fakeWebContents()

  beforeEach(async () => {
    harness.reset()
    manager.current = null
    vi.resetModules()
    ;(await import('./lsp')).registerLspHandlers()
  })

  it('registers every request channel', () => {
    expect(harness.registered().invoke).toEqual(
      [
        'completion',
        'resolveCompletion',
        'triggerCharacters',
        'hover',
        'signatureHelp',
        'definition',
        'references',
        'prepareRename',
        'rename',
        'format',
        'codeActions',
        'executeCommand',
        'documentSymbols',
        'workspaceSymbols',
        'inlayHints',
        'documentHighlights',
        'semanticTokens',
        'implementation',
        'typeDefinition',
        'declaration',
        'codeLens',
        'resolveCodeLens',
        'prepareHierarchy',
        'hierarchyRelated',
        'restart',
        'status',
        'log'
      ]
        .map((name) => `lsp:${name}`)
        .sort()
    )
  })

  it('without a manager returns the empty value of each request', async () => {
    const call = (channel: string, ...args: unknown[]) => harness.invoke(channel, wc, ...args)
    expect(await call('lsp:completion', '/a/b.ts', pos)).toBeNull()
    expect(await call('lsp:resolveCompletion', 1, 0)).toBeNull()
    expect(await call('lsp:triggerCharacters', '/a/b.ts')).toEqual({
      completion: [],
      signature: [],
      signatureRetrigger: []
    })
    expect(await call('lsp:hover', '/a/b.ts', pos)).toBeNull()
    expect(await call('lsp:definition', '/a/b.ts', pos)).toEqual([])
    expect(await call('lsp:references', '/a/b.ts', pos)).toEqual([])
    expect(await call('lsp:prepareRename', '/a/b.ts', pos)).toBeNull()
    expect(await call('lsp:rename', '/a/b.ts', pos, 'novo')).toBeNull()
    expect(await call('lsp:format', '/a/b.ts', { tabSize: 2, insertSpaces: true })).toEqual([])
    expect(await call('lsp:documentSymbols', '/a/b.ts')).toEqual([])
    expect(await call('lsp:workspaceSymbols', 'abc')).toEqual([])
    expect(await call('lsp:inlayHints', '/a/b.ts', { start: pos, end: pos })).toEqual([])
    expect(await call('lsp:documentHighlights', '/a/b.ts', pos)).toEqual([])
    expect(await call('lsp:semanticTokens', '/a/b.ts')).toBeNull()
    await expect(call('lsp:executeCommand', '/a/b.ts', { title: 't', command: 'c' })).rejects.toThrow(
      'Nenhum servidor de linguagem pronto para este arquivo.'
    )
  })

  it('an invalid argument rejects even without a manager', async () => {
    const call = (channel: string, ...args: unknown[]) => harness.invoke(channel, wc, ...args)
    await expect(call('lsp:hover', 'relativo.ts', pos)).rejects.toThrow(
      'Pedido ao servidor de linguagem inválido (caminho)'
    )
    await expect(call('lsp:hover', '/a/b.ts', { line: -1, character: 0 })).rejects.toThrow('(posição)')
    await expect(call('lsp:rename', '/a/b.ts', pos, '  ')).rejects.toThrow('(novo nome)')
    await expect(call('lsp:resolveCompletion', 'x', 0)).rejects.toThrow('Pedido ao servidor de linguagem inválido')
    await expect(call('lsp:workspaceSymbols', 'x'.repeat(257))).rejects.toThrow('(consulta)')
    await expect(call('lsp:inlayHints', '/a/b.ts', { start: pos })).rejects.toThrow(
      'Pedido ao servidor de linguagem inválido'
    )
  })

  it('with a manager forwards the already validated arguments, in contract order', async () => {
    const hover = vi.fn(() => ({ contents: 'x' }))
    const rename = vi.fn(() => null)
    const completion = vi.fn(() => null)
    manager.current = { hover, rename, completion }
    const call = (channel: string, ...args: unknown[]) => harness.invoke(channel, wc, ...args)
    expect(await call('lsp:hover', '/a/b.ts', pos)).toEqual({ contents: 'x' })
    expect(hover).toHaveBeenCalledWith('/a/b.ts', pos)
    await call('lsp:rename', '/a/b.ts', pos, 'novo')
    expect(rename).toHaveBeenCalledWith('/a/b.ts', pos, 'novo')
    await call('lsp:completion', '/a/b.ts', pos, '.')
    expect(completion).toHaveBeenCalledWith('/a/b.ts', pos, '.')
    await call('lsp:completion', '/a/b.ts', pos)
    expect(completion).toHaveBeenLastCalledWith('/a/b.ts', pos, undefined)
  })
})

import { describe, expect, it } from 'vitest'
import { clientCapabilities, parseServerCaps } from './capabilities'

describe('parseServerCaps', () => {
  it('provider true or object turns on; missing/false turns off', () => {
    const caps = parseServerCaps({
      hoverProvider: true,
      definitionProvider: {},
      referencesProvider: false,
      completionProvider: { resolveProvider: true, triggerCharacters: ['.', 3, ''] },
      signatureHelpProvider: { triggerCharacters: ['('], retriggerCharacters: [','] },
      renameProvider: { prepareProvider: true },
      codeActionProvider: { resolveProvider: true },
      executeCommandProvider: { commands: ['a.b'] }
    })
    expect(caps).toMatchObject({
      hover: true,
      definition: true,
      references: false,
      completion: true,
      completionResolve: true,
      completionTriggers: ['.'],
      signatureHelp: true,
      signatureTriggers: ['('],
      signatureRetriggers: [','],
      rename: true,
      prepareRename: true,
      codeAction: true,
      codeActionResolve: true,
      formatting: false,
      documentSymbol: false,
      workspaceSymbol: false,
      executeCommands: ['a.b']
    })
  })

  it('renameProvider true has no prepareRename; without capabilities everything is off', () => {
    expect(parseServerCaps({ renameProvider: true })).toMatchObject({ rename: true, prepareRename: false })
    expect(parseServerCaps(undefined)).toMatchObject({ completion: false, executeCommands: null })
  })

  it('inlay hints, document highlight and the semantic tokens legend (off-format names become empty)', () => {
    const caps = parseServerCaps({
      inlayHintProvider: { resolveProvider: true },
      documentHighlightProvider: true,
      semanticTokensProvider: {
        legend: { tokenTypes: ['variable', 'bad name', 3, 'x"y'], tokenModifiers: ['readonly'] },
        full: { delta: true }
      }
    })
    expect(caps).toMatchObject({ inlayHint: true, documentHighlight: true })
    expect(caps.semanticTokens).toEqual({ types: ['variable', '', '', ''], modifiers: ['readonly'], delta: true })
    // Only `range` (without `full`) is no use to the client.
    const rangeOnly = { legend: { tokenTypes: [], tokenModifiers: [] }, range: true }
    expect(parseServerCaps({ semanticTokensProvider: rangeOnly }).semanticTokens).toBeNull()
    expect(
      parseServerCaps({ semanticTokensProvider: { legend: { tokenTypes: [], tokenModifiers: [] }, full: true } })
        .semanticTokens?.delta
    ).toBe(false)
  })

  it('extended navigation, code lens and hierarchies', () => {
    expect(
      parseServerCaps({
        implementationProvider: true,
        typeDefinitionProvider: {},
        codeLensProvider: { resolveProvider: true },
        callHierarchyProvider: true
      })
    ).toMatchObject({
      implementation: true,
      typeDefinition: true,
      declaration: false,
      codeLens: true,
      codeLensResolve: true,
      callHierarchy: true,
      typeHierarchy: false
    })
    expect(parseServerCaps({ codeLensProvider: {} })).toMatchObject({ codeLens: true, codeLensResolve: false })
  })
})

describe('clientCapabilities', () => {
  it('declares the request capabilities', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- only inspects the capabilities object
    const c = clientCapabilities() as any
    expect(c.workspace.applyEdit).toBe(true)
    expect(c.workspace.workspaceEdit.documentChanges).toBe(true)
    expect(c.textDocument.completion.completionItem.snippetSupport).toBe(true)
    expect(c.textDocument.completion.completionItemKind.valueSet).toHaveLength(25)
    expect(c.textDocument.definition.linkSupport).toBe(true)
    expect(c.textDocument.rename.prepareSupport).toBe(true)
    expect(c.textDocument.documentSymbol.hierarchicalDocumentSymbolSupport).toBe(true)
    expect(c.textDocument.codeAction.resolveSupport.properties).toEqual(['edit'])
    expect(c.workspace.inlayHint.refreshSupport).toBe(true)
    expect(c.workspace.semanticTokens.refreshSupport).toBe(true)
    expect(c.textDocument.semanticTokens.requests.full.delta).toBe(true)
    expect(c.textDocument.semanticTokens.formats).toEqual(['relative'])
    expect(c.textDocument.implementation.linkSupport).toBe(true)
    expect(c.textDocument.declaration.linkSupport).toBe(true)
    expect(c.textDocument.callHierarchy).toBeDefined()
    expect(c.workspace.codeLens.refreshSupport).toBe(true)
  })
})

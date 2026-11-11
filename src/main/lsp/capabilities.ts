import { isRecord, isNonEmptyString } from '@shared/guards'

/** Only what the client reads from the `initialize` `ServerCapabilities` (provider `true` or options object = on). */
export interface ServerCaps {
  completion: boolean
  completionResolve: boolean
  completionTriggers: string[]
  hover: boolean
  signatureHelp: boolean
  signatureTriggers: string[]
  signatureRetriggers: string[]
  definition: boolean
  references: boolean
  rename: boolean
  prepareRename: boolean
  formatting: boolean
  codeAction: boolean
  codeActionResolve: boolean
  documentSymbol: boolean
  workspaceSymbol: boolean
  /** Commands the server accepts in `workspace/executeCommand`; `null` = not offered. */
  executeCommands: string[] | null
  inlayHint: boolean
  documentHighlight: boolean
  /** `null` = no `semanticTokens/full` (`range` alone is not enough: the client requests the whole document). */
  semanticTokens: SemanticTokensCaps | null
  implementation: boolean
  typeDefinition: boolean
  declaration: boolean
  codeLens: boolean
  codeLensResolve: boolean
  callHierarchy: boolean
  typeHierarchy: boolean
}

export interface SemanticTokensCaps {
  types: string[]
  modifiers: string[]
  delta: boolean
}

const on = (v: unknown): boolean => v === true || isRecord(v)

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => isNonEmptyString(s)) : [])

const flag = (provider: unknown, key: string): boolean => isRecord(provider) && provider[key] === true

/** Legend names become CSS classes in the renderer: off-format ones become `''` (the others' index does not change). */
const LEGEND_NAME = /^[A-Za-z][\w-]{0,63}$/
const LEGEND_LIMIT = 256

const legendNames = (v: unknown): string[] =>
  Array.isArray(v) ? v.slice(0, LEGEND_LIMIT).map((n) => (typeof n === 'string' && LEGEND_NAME.test(n) ? n : '')) : []

function parseSemanticTokens(v: unknown): SemanticTokensCaps | null {
  if (!isRecord(v) || !isRecord(v.legend)) return null
  const full = v.full
  if (full !== true && !isRecord(full)) return null
  return {
    types: legendNames(v.legend.tokenTypes),
    modifiers: legendNames(v.legend.tokenModifiers),
    delta: flag(full, 'delta')
  }
}

export function parseServerCaps(raw: unknown): ServerCaps {
  const c = isRecord(raw) ? raw : {}
  const completion = c.completionProvider
  const signature = c.signatureHelpProvider
  const exec = c.executeCommandProvider
  return {
    completion: on(completion),
    completionResolve: flag(completion, 'resolveProvider'),
    completionTriggers: isRecord(completion) ? strings(completion.triggerCharacters) : [],
    hover: on(c.hoverProvider),
    signatureHelp: on(signature),
    signatureTriggers: isRecord(signature) ? strings(signature.triggerCharacters) : [],
    signatureRetriggers: isRecord(signature) ? strings(signature.retriggerCharacters) : [],
    definition: on(c.definitionProvider),
    references: on(c.referencesProvider),
    rename: on(c.renameProvider),
    prepareRename: flag(c.renameProvider, 'prepareProvider'),
    formatting: on(c.documentFormattingProvider),
    codeAction: on(c.codeActionProvider),
    codeActionResolve: flag(c.codeActionProvider, 'resolveProvider'),
    documentSymbol: on(c.documentSymbolProvider),
    workspaceSymbol: on(c.workspaceSymbolProvider),
    executeCommands: isRecord(exec) ? strings(exec.commands) : null,
    inlayHint: on(c.inlayHintProvider),
    documentHighlight: on(c.documentHighlightProvider),
    semanticTokens: parseSemanticTokens(c.semanticTokensProvider),
    implementation: on(c.implementationProvider),
    typeDefinition: on(c.typeDefinitionProvider),
    declaration: on(c.declarationProvider),
    codeLens: on(c.codeLensProvider),
    codeLensResolve: flag(c.codeLensProvider, 'resolveProvider'),
    callHierarchy: on(c.callHierarchyProvider),
    typeHierarchy: on(c.typeHierarchyProvider)
  }
}

// The standard types and modifiers of the specification: what the renderer knows how to color.
const SEMANTIC_TOKEN_TYPES = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator'
]
const SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary'
]

const range = (max: number): number[] => Array.from({ length: max }, (_, i) => i + 1)

/** `capabilities` sent in `initialize`. No dynamic registration: what the server announces in the result holds. */
export function clientCapabilities(): Record<string, unknown> {
  const markup = ['markdown', 'plaintext']
  return {
    general: { positionEncodings: ['utf-16'] },
    workspace: {
      workspaceFolders: true,
      configuration: true,
      applyEdit: true,
      workspaceEdit: { documentChanges: true },
      symbol: { dynamicRegistration: false, symbolKind: { valueSet: range(26) } },
      executeCommand: { dynamicRegistration: false },
      didChangeWatchedFiles: { dynamicRegistration: true, relativePatternSupport: true },
      inlayHint: { refreshSupport: true },
      semanticTokens: { refreshSupport: true },
      codeLens: { refreshSupport: true }
    },
    textDocument: {
      synchronization: { dynamicRegistration: false, willSave: false, willSaveWaitUntil: false, didSave: true },
      publishDiagnostics: { relatedInformation: false, versionSupport: true },
      completion: {
        dynamicRegistration: false,
        contextSupport: true,
        completionItem: {
          snippetSupport: true,
          documentationFormat: markup,
          insertReplaceSupport: true,
          labelDetailsSupport: true,
          resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] }
        },
        completionItemKind: { valueSet: range(25) }
      },
      hover: { dynamicRegistration: false, contentFormat: markup },
      signatureHelp: {
        dynamicRegistration: false,
        contextSupport: true,
        signatureInformation: {
          documentationFormat: markup,
          parameterInformation: { labelOffsetSupport: true },
          activeParameterSupport: true
        }
      },
      definition: { dynamicRegistration: false, linkSupport: true },
      references: { dynamicRegistration: false },
      implementation: { dynamicRegistration: false, linkSupport: true },
      typeDefinition: { dynamicRegistration: false, linkSupport: true },
      declaration: { dynamicRegistration: false, linkSupport: true },
      codeLens: { dynamicRegistration: false },
      callHierarchy: { dynamicRegistration: false },
      typeHierarchy: { dynamicRegistration: false },
      rename: { dynamicRegistration: false, prepareSupport: true },
      formatting: { dynamicRegistration: false },
      codeAction: {
        dynamicRegistration: false,
        isPreferredSupport: true,
        disabledSupport: true,
        dataSupport: true,
        resolveSupport: { properties: ['edit'] },
        codeActionLiteralSupport: {
          codeActionKind: {
            valueSet: [
              '',
              'quickfix',
              'refactor',
              'refactor.extract',
              'refactor.inline',
              'refactor.rewrite',
              'source',
              'source.organizeImports',
              'source.fixAll'
            ]
          }
        }
      },
      documentSymbol: {
        dynamicRegistration: false,
        hierarchicalDocumentSymbolSupport: true,
        symbolKind: { valueSet: range(26) }
      },
      inlayHint: { dynamicRegistration: false },
      documentHighlight: { dynamicRegistration: false },
      semanticTokens: {
        dynamicRegistration: false,
        requests: { range: false, full: { delta: true } },
        tokenTypes: SEMANTIC_TOKEN_TYPES,
        tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
        formats: ['relative'],
        overlappingTokenSupport: false,
        multilineTokenSupport: false,
        serverCancelSupport: true,
        augmentsSyntaxTokens: true
      }
    }
  }
}

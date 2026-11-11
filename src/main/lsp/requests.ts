import { t } from '@shared/i18n'
import type {
  LspCodeAction,
  LspCodeLensList,
  LspCompletionList,
  LspDocumentHighlight,
  LspHierarchyItem,
  LspHierarchyKind,
  LspHover,
  LspInlayHint,
  LspLocation,
  LspPosition,
  LspRange,
  LspSemanticTokens,
  LspServerState,
  LspSignatureHelp,
  LspDocumentSymbol,
  LspTextEdit,
  LspWorkspaceEdit
} from '@shared/types'
import type { ServerCaps } from './capabilities'
import { CODE_ACTION_LIMIT, diagnosticsForRange, isActionable, needsResolve, normalizeCodeAction } from './codeActions'
import { normalizeCodeLenses } from './codeLens'
import { normalizeCompletion } from './completion'
import { normalizeDocumentHighlights } from './documentHighlights'
import { normalizeInlayHints } from './inlayHints'
import { normalizeHierarchyItems } from './hierarchy'
import type { ManagedDoc } from './documentMirror'
import { normalizeLocations } from './locations'
import { normalizeHover } from './markup'
import { normalizePrepareRename, textInRange, wordAt } from './rename'
import { normalizeSemanticTokens, SEMANTIC_TOKENS_MAX_TEXT, type SemanticTokensCache } from './semanticTokens'
import { ServerResponseError, type LanguageServer } from './server'
import type { ResolvedServer } from './serverConfig'
import { asTextEdits } from './shape'
import { normalizeSignatureHelp } from './signature'
import { normalizeDocumentSymbols } from './symbols'
import { normalizeWorkspaceEdit, type EditContext } from './workspaceEdit'

/** Request deadlines (ms): the renderer never waits on a hung server. */
export const REQUEST_TIMEOUTS_MS = {
  completion: 5_000,
  resolve: 5_000,
  hover: 5_000,
  signature: 5_000,
  definition: 5_000,
  prepareRename: 5_000,
  format: 5_000,
  codeActions: 5_000,
  /** Each `codeAction/resolve` (the whole list already used up the `codeActions` deadline). */
  codeActionResolve: 3_000,
  documentSymbols: 5_000,
  references: 15_000,
  rename: 15_000,
  workspaceSymbols: 15_000,
  executeCommand: 15_000,
  inlayHints: 5_000,
  documentHighlights: 5_000,
  semanticTokens: 10_000,
  implementation: 15_000,
  typeDefinition: 5_000,
  declaration: 5_000,
  codeLens: 5_000,
  /** Resolving a tsserver lens means fetching the symbol's references. */
  codeLensResolve: 15_000,
  hierarchy: 15_000
} as const
export type RequestKind = keyof typeof REQUEST_TIMEOUTS_MS

/** Code actions without an edit that we resolve on query (the others show up with no effect and are dropped). */
const CODE_ACTION_RESOLVE_LIMIT = 10

export interface ServerEntry {
  def: ResolvedServer
  signature: string
  server: LanguageServer
  state: LspServerState
  message?: string | undefined
}

/** Open document with a ready server. */
export interface Target {
  doc: ManagedDoc
  entry: ServerEntry
  caps: ServerCaps
}

/** What the normalizers need from the manager. */
export interface RequestHost {
  canon(): (path: string) => string
  editContext(): EditContext
  /** Stores the raw items of the last list (for `completionItem/resolve`) and returns its id. */
  storeCompletion(t: Target, raws: Record<string, unknown>[]): number
  /** Stores the raw items of the document's last lens list (for `codeLens/resolve`) and returns its id. */
  storeCodeLenses(t: Target, raws: Record<string, unknown>[]): number
  /** Stores a raw hierarchy item (to request its neighbors) and returns its id. */
  storeHierarchyItem(t: Target, kind: LspHierarchyKind, raw: Record<string, unknown>): number
  /** Auxiliary request to the target's server (e.g. `codeAction/resolve`), with the `kind` deadline. */
  requestRaw(t: Target, method: string, params: unknown, kind: RequestKind, label: string): Promise<unknown>
}

export interface RequestSpec<A extends unknown[], T> {
  kind: RequestKind
  method: string
  /** Resolved on every request: the language may change. */
  label(): string
  cap(caps: ServerCaps): boolean
  /** Key of the exclusive request: a new one cancels the previous one with the same key. */
  exclusive?: string
  params(t: Target, ...args: A): unknown
  /** An answer from another world (folder switched, server restarted) arrives here as `null`. */
  normalize(raw: unknown, t: Target, host: RequestHost, ...args: A): T | Promise<T>
  /** No ready document/server or no capability. */
  empty: T
  /** Answer that skips the server; `undefined` goes on to the request. */
  shortcut?(t: Target, ...args: A): T | undefined
  /** Server error that becomes an answer (rethrows anything else). */
  recover?(err: unknown): T
}

const spec = <A extends unknown[], T>(s: RequestSpec<A, T>): RequestSpec<A, T> => s

/** Normalizes and stores (or forgets) the base of the document's next deltas. */
function semanticTokensOf(
  raw: unknown,
  target: Target,
  previous: SemanticTokensCache | null
): LspSemanticTokens | null {
  const legend = target.caps.semanticTokens
  if (!legend) return null
  const { tokens, cache } = normalizeSemanticTokens(raw, legend, previous?.data ?? null)
  target.doc.semanticTokens = cache
    ? { ...cache, serverId: target.entry.def.id, runId: target.entry.server.runId }
    : undefined
  return tokens
}

const docParams = (target: Target): { textDocument: { uri: string } } => ({ textDocument: { uri: target.doc.uri } })

/** "Go to…" that returns `Location | Location[] | LocationLink[]` (implementation, type, declaration). */
const locationRequest = (
  kind: RequestKind,
  method: string,
  label: () => string,
  cap: (caps: ServerCaps) => boolean
): RequestSpec<[LspPosition], LspLocation[]> => ({
  kind,
  method,
  label,
  cap,
  params: (target, position) => ({ ...docParams(target), position }),
  normalize: (raw, _target, host) => normalizeLocations(raw, process.platform, host.canon()),
  empty: []
})

const prepareHierarchy = (
  kind: LspHierarchyKind,
  method: string,
  label: () => string,
  cap: (caps: ServerCaps) => boolean
): RequestSpec<[LspPosition], LspHierarchyItem[]> => ({
  kind: 'hierarchy',
  method,
  label,
  cap,
  params: (target, position) => ({ ...docParams(target), position }),
  normalize: (raw, target, host) =>
    normalizeHierarchyItems(raw, kind, process.platform, host.canon()).map(({ raw: item, item: shape }) => ({
      ...shape,
      id: host.storeHierarchyItem(target, kind, item)
    })),
  empty: []
})

async function resolveCodeActions(raw: unknown, target: Target, host: RequestHost): Promise<LspCodeAction[]> {
  if (!Array.isArray(raw)) return []
  const ctx = host.editContext()
  const entries: { raw: unknown; action: LspCodeAction }[] = []
  for (const item of raw.slice(0, CODE_ACTION_LIMIT)) {
    const action = normalizeCodeAction(item, ctx)
    if (action) entries.push({ raw: item, action })
  }
  if (target.caps.codeActionResolve) {
    const pending = entries.filter((e) => needsResolve(e.raw, e.action)).slice(0, CODE_ACTION_RESOLVE_LIMIT)
    await Promise.all(
      pending.map(async (e) => {
        try {
          const resolved = await host.requestRaw(
            target,
            'codeAction/resolve',
            e.raw,
            'codeActionResolve',
            t().lsp.requests.resolveCodeAction
          )
          const action = resolved ? normalizeCodeAction({ ...(e.raw as object), ...resolved }, ctx) : null
          if (action) e.action = action
        } catch {
          // Unresolved it has no effect and is dropped below; the other actions still count.
        }
      })
    )
  }
  return entries.map((e) => e.action).filter(isActionable)
}

/**
 * Per-document requests: the routing (document → ready server → capability), the deadline and the cancellation belong
 * to the manager; here only what changes from one request to another.
 */
export const requests = {
  completion: spec<[LspPosition, string?], LspCompletionList | null>({
    kind: 'completion',
    method: 'textDocument/completion',
    label: () => t().lsp.requests.completion,
    cap: (caps) => caps.completion,
    exclusive: 'completion',
    params: (target, position, triggerCharacter) => {
      // `TriggerCharacter` only holds if the server declared the character; otherwise it is a plain invocation.
      const triggered = triggerCharacter !== undefined && target.caps.completionTriggers.includes(triggerCharacter)
      return {
        ...docParams(target),
        position,
        context: triggered ? { triggerKind: 2, triggerCharacter } : { triggerKind: 1 }
      }
    },
    normalize: (raw, target, host) => {
      if (raw === null) return null
      const { isIncomplete, items, raws } = normalizeCompletion(raw, target.caps.completionResolve)
      return { resultId: host.storeCompletion(target, raws), isIncomplete, items }
    },
    empty: null
  }),

  hover: spec<[LspPosition], LspHover | null>({
    kind: 'hover',
    method: 'textDocument/hover',
    label: () => t().lsp.requests.hover,
    cap: (caps) => caps.hover,
    exclusive: 'hover',
    params: (target, position) => ({ ...docParams(target), position }),
    normalize: (raw) => normalizeHover(raw),
    empty: null
  }),

  signatureHelp: spec<[LspPosition, string?], LspSignatureHelp | null>({
    kind: 'signature',
    method: 'textDocument/signatureHelp',
    label: () => t().lsp.requests.signatureHelp,
    cap: (caps) => caps.signatureHelp,
    exclusive: 'signature',
    params: (target, position, triggerCharacter) => {
      const triggered =
        triggerCharacter !== undefined &&
        (target.caps.signatureTriggers.includes(triggerCharacter) ||
          target.caps.signatureRetriggers.includes(triggerCharacter))
      return {
        ...docParams(target),
        position,
        context: triggered
          ? { triggerKind: 2, triggerCharacter, isRetrigger: false }
          : { triggerKind: 1, isRetrigger: false }
      }
    },
    normalize: (raw) => normalizeSignatureHelp(raw),
    empty: null
  }),

  definition: spec<[LspPosition], LspLocation[]>({
    kind: 'definition',
    method: 'textDocument/definition',
    label: () => t().lsp.requests.definition,
    cap: (caps) => caps.definition,
    params: (target, position) => ({ ...docParams(target), position }),
    normalize: (raw, _target, host) => normalizeLocations(raw, process.platform, host.canon()),
    empty: []
  }),

  references: spec<[LspPosition], LspLocation[]>({
    kind: 'references',
    method: 'textDocument/references',
    label: () => t().lsp.requests.references,
    cap: (caps) => caps.references,
    params: (target, position) => ({ ...docParams(target), position, context: { includeDeclaration: true } }),
    normalize: (raw, _target, host) => normalizeLocations(raw, process.platform, host.canon()),
    empty: []
  }),

  prepareRename: spec<[LspPosition], { range: LspRange; placeholder: string } | null>({
    kind: 'prepareRename',
    method: 'textDocument/prepareRename',
    label: () => t().lsp.requests.rename,
    cap: (caps) => caps.rename,
    params: (target, position) => ({ ...docParams(target), position }),
    // Without `prepareRename` on the server, the word under the cursor is what gets renamed (as VS Code does).
    shortcut: (target, position) => {
      if (target.caps.prepareRename) return undefined
      const range = wordAt(target.doc.text, position)
      return range ? { range, placeholder: textInRange(target.doc.text, range) } : null
    },
    normalize: (raw, target, _host, position) => normalizePrepareRename(raw, target.doc.text, position),
    // tsserver refuses with an error ("You cannot rename this element") instead of `null`: same "cannot do it there".
    recover: (err) => {
      if (err instanceof ServerResponseError) return null
      throw err
    },
    empty: null
  }),

  rename: spec<[LspPosition, string], LspWorkspaceEdit | null>({
    kind: 'rename',
    method: 'textDocument/rename',
    label: () => t().lsp.requests.rename,
    cap: (caps) => caps.rename,
    params: (target, position, newName) => ({ ...docParams(target), position, newName }),
    normalize: (raw, _target, host) => {
      if (raw === null) return null
      const edit = normalizeWorkspaceEdit(raw, host.editContext())
      return edit.files.length > 0 ? edit : null
    },
    empty: null
  }),

  format: spec<[{ tabSize: number; insertSpaces: boolean }], LspTextEdit[]>({
    kind: 'format',
    method: 'textDocument/formatting',
    label: () => t().lsp.requests.format,
    cap: (caps) => caps.formatting,
    params: (target, options) => ({ ...docParams(target), options }),
    normalize: (raw) => asTextEdits(raw),
    empty: []
  }),

  /**
   * Code actions in the range. A server action without `edit`/`command` (the edit comes from `codeAction/resolve`) is
   * resolved BEFORE returning (the contract has no "resolve later"), in parallel and only for the first
   * `CODE_ACTION_RESOLVE_LIMIT`; those still left with nothing to run are dropped.
   */
  codeActions: spec<[LspRange], LspCodeAction[]>({
    kind: 'codeActions',
    method: 'textDocument/codeAction',
    label: () => t().lsp.requests.codeActions,
    cap: (caps) => caps.codeAction,
    params: (target, range) => ({
      ...docParams(target),
      range,
      context: { diagnostics: diagnosticsForRange(target.doc.diagnostics, range), triggerKind: 1 }
    }),
    normalize: (raw, target, host) => resolveCodeActions(raw, target, host),
    empty: []
  }),

  documentSymbols: spec<[], LspDocumentSymbol[]>({
    kind: 'documentSymbols',
    method: 'textDocument/documentSymbol',
    label: () => t().lsp.requests.documentSymbols,
    cap: (caps) => caps.documentSymbol,
    params: (target) => docParams(target),
    normalize: (raw) => normalizeDocumentSymbols(raw),
    empty: []
  }),

  inlayHints: spec<[LspRange], LspInlayHint[]>({
    kind: 'inlayHints',
    method: 'textDocument/inlayHint',
    label: () => t().lsp.requests.inlayHints,
    cap: (caps) => caps.inlayHint,
    params: (target, range) => ({ ...docParams(target), range }),
    normalize: (raw) => normalizeInlayHints(raw),
    empty: []
  }),

  documentHighlights: spec<[LspPosition], LspDocumentHighlight[]>({
    kind: 'documentHighlights',
    method: 'textDocument/documentHighlight',
    label: () => t().lsp.requests.documentHighlights,
    cap: (caps) => caps.documentHighlight,
    exclusive: 'documentHighlights',
    params: (target, position) => ({ ...docParams(target), position }),
    normalize: (raw) => normalizeDocumentHighlights(raw),
    empty: []
  }),

  semanticTokens: spec<[], LspSemanticTokens | null>({
    kind: 'semanticTokens',
    method: 'textDocument/semanticTokens/full',
    label: () => t().lsp.requests.semanticTokens,
    cap: (caps) => caps.semanticTokens !== null,
    params: (target) => docParams(target),
    shortcut: (target) => (target.doc.text.length > SEMANTIC_TOKENS_MAX_TEXT ? null : undefined),
    normalize: (raw, target) => semanticTokensOf(raw, target, null),
    empty: null
  }),

  /** Delta over `previous` (the document's last stored result, from the same server process). */
  semanticTokensDelta: spec<[SemanticTokensCache], LspSemanticTokens | null>({
    kind: 'semanticTokens',
    method: 'textDocument/semanticTokens/full/delta',
    label: () => t().lsp.requests.semanticTokens,
    cap: (caps) => caps.semanticTokens?.delta === true,
    params: (target, previous) => ({ ...docParams(target), previousResultId: previous.resultId }),
    shortcut: (target) => (target.doc.text.length > SEMANTIC_TOKENS_MAX_TEXT ? null : undefined),
    normalize: (raw, target, _host, previous) => semanticTokensOf(raw, target, previous),
    empty: null
  }),

  implementation: locationRequest(
    'implementation',
    'textDocument/implementation',
    () => t().lspNavigation.requests.implementation,
    (caps) => caps.implementation
  ),
  typeDefinition: locationRequest(
    'typeDefinition',
    'textDocument/typeDefinition',
    () => t().lspNavigation.requests.typeDefinition,
    (caps) => caps.typeDefinition
  ),
  declaration: locationRequest(
    'declaration',
    'textDocument/declaration',
    () => t().lspNavigation.requests.declaration,
    (caps) => caps.declaration
  ),

  codeLens: spec<[], LspCodeLensList | null>({
    kind: 'codeLens',
    method: 'textDocument/codeLens',
    label: () => t().lspNavigation.requests.codeLens,
    cap: (caps) => caps.codeLens,
    params: (target) => docParams(target),
    normalize: (raw, target, host) => {
      if (raw === null) return null
      const { lenses, raws } = normalizeCodeLenses(raw, process.platform, host.canon())
      return { resultId: host.storeCodeLenses(target, raws), resolvable: target.caps.codeLensResolve, lenses }
    },
    empty: null
  }),

  prepareCallHierarchy: prepareHierarchy(
    'call',
    'textDocument/prepareCallHierarchy',
    () => t().lspNavigation.requests.callHierarchy,
    (caps) => caps.callHierarchy
  ),
  prepareTypeHierarchy: prepareHierarchy(
    'type',
    'textDocument/prepareTypeHierarchy',
    () => t().lspNavigation.requests.typeHierarchy,
    (caps) => caps.typeHierarchy
  )
}

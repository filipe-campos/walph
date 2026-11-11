/** LSP position: 0-based line and character, character in UTF-16 units (the same as CodeMirror offsets). */
export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

/**
 * An incremental change (`TextDocumentContentChangeEvent` with `range`). The changes of one `change` are applied in
 * sequence, each on the result of the previous one (LSP semantics). Positions refer to the text with `\n` line breaks
 * (the CodeMirror document), never `\r\n`.
 */
export interface LspTextChange {
  range: LspRange
  text: string
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface Diagnostic {
  range: LspRange
  severity: DiagnosticSeverity
  message: string
  /** Who produced it (e.g. `ts`). */
  source?: string
  code?: string | number
}

/** Diagnostics published for a file; they replace its previous ones (empty list = clear). */
export interface FileDiagnostics {
  /** Absolute path (converted from the server `file://`). */
  path: string
  /** Document version the diagnostics refer to, when the server reports it. */
  version: number | null
  diagnostics: Diagnostic[]
}

/** `starting` also covers the automatic restart after a crash; `error` = gave up (needs a manual restart). */
export type LspServerState = 'starting' | 'ready' | 'error'

export interface LspServerStatus {
  /** Server id in `lsp.servers` (the built-in one is `typescript`). */
  id: string
  /** Display name (e.g. "TypeScript"). */
  name: string
  state: LspServerState
  /** Handled extensions, lowercase with a dot (`.ts`): the renderer finds the active file's server by them. */
  extensions: string[]
  /** State detail (translated, `t()`), e.g. the error reason or "restarting (attempt 2 of 5)". */
  message?: string
}

export type LspLogLevel = 'error' | 'warning' | 'info' | 'log'

/** Line of the "Output" panel: server stderr, `window/logMessage` and lifecycle events (start, crash…). */
export interface LspLogEntry {
  /** Epoch in ms. */
  time: number
  /** Server id. */
  server: string
  level: LspLogLevel
  message: string
}

/** LSP `TextEdit`: replaces `range` (in the document BEFORE any edit of the same list) with `newText`. */
export interface LspTextEdit {
  range: LspRange
  newText: string
}

/** Documentation text: markdown (rendered and sanitized in the renderer) or plain text. */
export interface LspMarkup {
  kind: 'markdown' | 'plaintext'
  value: string
}

export interface LspCompletionItem {
  label: string
  /** LSP `CompletionItemKind` (1 = Text … 25 = TypeParameter): the renderer picks the icon by it. */
  kind?: number
  detail?: string
  documentation?: LspMarkup
  sortText?: string
  filterText?: string
  /** Text to insert when there is no `textEdit` (falls back to `label` if the server did not send it). */
  insertText: string
  /** `snippet` = LSP snippet syntax (`${1:arg}`, `$0`). */
  insertTextFormat: 'plain' | 'snippet'
  /** Main edit; `InsertReplaceEdit` arrives as the `insert` range. */
  textEdit?: LspTextEdit
  /** Extra edits (e.g. the `import` of an auto-import), applied together. */
  additionalTextEdits?: LspTextEdit[]
  commitCharacters?: string[]
  /** `true` if the server offers `completionItem/resolve` and the item has not been resolved yet. */
  resolvable: boolean
}

export interface LspCompletionList {
  /** Identifies this list in main (for `resolveCompletion`); only the window's last list is kept. */
  resultId: number
  /** `true` = the list changes as the user types: request again instead of only filtering. */
  isIncomplete: boolean
  items: LspCompletionItem[]
}

export interface LspHover {
  contents: LspMarkup
  range?: LspRange
}

export interface LspParameterInformation {
  /** Parameter text, or `[start, end)` in UTF-16 within the signature `label`. */
  label: string | [number, number]
  documentation?: LspMarkup
}

export interface LspSignatureInformation {
  label: string
  documentation?: LspMarkup
  parameters: LspParameterInformation[]
  activeParameter?: number
}

export interface LspSignatureHelp {
  signatures: LspSignatureInformation[]
  activeSignature: number
  activeParameter: number
}

/** Location in a file (definition, reference, symbol). Absolute path converted from `file://`. */
export interface LspLocation {
  path: string
  range: LspRange
}

/** `WorkspaceEdit` normalized by main: text edits only, grouped by file, all inside the window folder. */
export interface LspWorkspaceEdit {
  files: {
    path: string
    edits: LspTextEdit[]
    /**
     * Document version in main's mirror (the same as `lsp.open`/`lsp.change`) when the file was open while the edit
     * was normalized. If the loaded tab has another `lspSync` version, the text changed after the computation: the
     * renderer must refuse the edit. Absent = file not open (the edit applies to the disk).
     */
    version?: number
  }[]
}

/** LSP `Command` (run by the server with `workspace/executeCommand`). */
export interface LspCommand {
  title: string
  command: string
  arguments?: unknown[]
}

export interface LspCodeAction {
  title: string
  /** `quickfix`, `refactor.extract`, `source.organizeImports`… */
  kind?: string
  isPreferred?: boolean
  /** Why it is disabled (shown dimmed, not applicable). */
  disabled?: string
  /** Applied first (by the renderer, with the same rules as rename). */
  edit?: LspWorkspaceEdit
  /** Run after the edit; the server may request edits back (`onApplyEdit`). */
  command?: LspCommand
}

/** LSP `SymbolKind` (1 = File … 26 = TypeParameter). */
export interface LspSymbol {
  name: string
  kind: number
  detail?: string
  /** Container (class, namespace…) to display; in the document it is the parents' path (`Class.method`). */
  containerName?: string
  location: LspLocation
}

/** Piece of an inlay hint label; `tooltip` as plain text (markdown arrives as the source text). */
export interface LspInlayHintPart {
  value: string
  tooltip?: string
}

/** Normalized `InlayHint`: the label always as a list of pieces, in display order. */
export interface LspInlayHint {
  position: LspPosition
  label: LspInlayHintPart[]
  kind?: 'type' | 'parameter'
  paddingLeft: boolean
  paddingRight: boolean
  tooltip?: string
}

export type LspDocumentHighlightKind = 'text' | 'read' | 'write'

export interface LspDocumentHighlight {
  range: LspRange
  kind: LspDocumentHighlightKind
}

/**
 * Semantic tokens of the whole document, already decoded by main (deltas too): 5 integers per token, in absolute
 * positions and document order: line, start character (UTF-16), length, index in `types` and the modifier bits
 * (bit `i` = `modifiers[i]`). Legend names outside `[A-Za-z][\w-]*` arrive as `''`.
 */
export interface LspSemanticTokens {
  types: string[]
  modifiers: string[]
  data: number[]
}

/** The server asked the client to request again (`workspace/…/refresh`). */
export interface LspRefresh {
  kind: LspRefreshKind
  serverId: string
}

/**
 * Node of a document's symbol tree (`DocumentSymbol`), children in document order. `range` covers the whole
 * declaration (with the body); `selectionRange`, the name. Servers that only send `SymbolInformation` get the tree
 * built from range containment.
 */
export interface LspDocumentSymbol {
  name: string
  kind: number
  detail?: string
  range: LspRange
  selectionRange: LspRange
  children: LspDocumentSymbol[]
}

/** Server request (`workspace/applyEdit`) forwarded to the renderer, which applies it and answers `applyEditResult`. */
export interface LspApplyEditRequest {
  id: number
  label?: string
  edit: LspWorkspaceEdit
}

/** Command of a code lens, normalized by main. */
export interface LspCodeLensCommand {
  title: string
  /**
   * Ready-made locations of an `editor.action.showReferences` (and the like): the renderer shows them without going to
   * the server, which would not even accept that command in `workspace/executeCommand`.
   */
  locations?: LspLocation[]
  /** Server command (`workspace/executeCommand`). Absent together with `locations` = text only. */
  command?: LspCommand
}

export interface LspCodeLens {
  range: LspRange
  /** Absent = not resolved yet: request `resolveCodeLens` (if the list is `resolvable`). */
  command?: LspCodeLensCommand
}

export interface LspCodeLensList {
  /** Identifies this list in main (for `resolveCodeLens`); only the last list of each document is kept. */
  resultId: number
  /** The server offers `codeLens/resolve`. */
  resolvable: boolean
  lenses: LspCodeLens[]
}

/** What a server `workspace/…/refresh` invalidates. */
export type LspRefreshKind = 'inlayHints' | 'semanticTokens' | 'codeLens'

/** Call (`call`) or type (`type`) hierarchy. */
export type LspHierarchyKind = 'call' | 'type'
/** `incoming`/`outgoing` apply to `call`; `supertypes`/`subtypes` to `type`. */
export type LspHierarchyDirection = 'incoming' | 'outgoing' | 'supertypes' | 'subtypes'

/** Normalized `CallHierarchyItem`/`TypeHierarchyItem`; the raw item (with the server `data`) stays in main. */
export interface LspHierarchyItem {
  /** Item id in main, to request its neighbors with `hierarchyRelated`. */
  id: number
  kind: LspHierarchyKind
  name: string
  /** LSP `SymbolKind` (1 = File … 26 = TypeParameter). */
  symbolKind: number
  detail?: string
  path: string
  /** Whole symbol body. */
  range: LspRange
  /** The symbol name (target when navigating). */
  selectionRange: LspRange
}

/** Neighbor of an item: `ranges` are the calls (in the caller's file for `incoming`; in the item's for `outgoing`). */
export interface LspHierarchyEdge {
  item: LspHierarchyItem
  ranges: LspRange[]
}

/**
 * LSP client. Servers belong to the window: one per configured server (`lsp.servers` + the built-in `typescript`),
 * started on demand on the first `open` of a file it handles, inside the window folder (main uses the window folder;
 * a file outside it, without a server or with a disabled server is ignored). Changing the folder, reloading or closing
 * the window shuts its servers down. Crashed on its own → restarts with backoff and reopens the documents. Document
 * notifications are `send` (no response), in the order the renderer sends them.
 */
export interface LspApi {
  /** `didOpen` with the full text (`\n` breaks). `version` starts at 1 and grows with each `change` of the tab. */
  open(path: string, text: string, version: number): void
  /** Incremental `didChange`; `version` is the document's after the changes. */
  change(path: string, version: number, changes: LspTextChange[]): void
  /** `didSave` (the file has already been written to disk). */
  save(path: string): void
  /** `didClose` (tab closed or renamed); main publishes empty diagnostics for the path. */
  close(path: string): void
  /** "Restart Language Server": restarts the window's servers (all, or only `id`) and resets the backoff. */
  restart(id?: string): Promise<void>
  /** Current state of the window's servers (the ones already started). */
  status(): Promise<LspServerStatus[]>
  /** History of the window's "Output" panel (the last lines; main caps the amount). */
  log(): Promise<LspLogEntry[]>
  /** `textDocument/publishDiagnostics` (`lsp:diagnostics`). Server shut down for good → empty for its files. */
  onDiagnostics(cb: (diagnostics: FileDiagnostics) => void): () => void
  /** The status list changed (`lsp:statusChanged`); always the window's whole list. */
  onStatus(cb: (statuses: LspServerStatus[]) => void): () => void
  /** New log lines (`lsp:logAppended`), batched by main every 100 ms; in emission order. */
  onLog(cb: (entries: LspLogEntry[]) => void): () => void

  // ---- Requests ----
  // All take the path of a document opened with `open` and positions on its current text (IPC delivers the `invoke`
  // after the `change`s sent before it, so the server has already seen that version). No server for the file,
  // server not ready yet or lacking the capability → `null` (or an empty list), never an error. Server error →
  // rejects with a translated message (`t()`). Returned locations outside `file://` are discarded.

  /** `textDocument/completion`. `triggerCharacter` = typed character that triggered it (e.g. `.`), if any. */
  completion(path: string, position: LspPosition, triggerCharacter?: string): Promise<LspCompletionList | null>
  /** `completionItem/resolve` of item `index` of list `resultId`; `null` if the list has been replaced. */
  resolveCompletion(resultId: number, index: number): Promise<LspCompletionItem | null>
  /** Characters that trigger completion / signature help in the file's server (empty without a ready server). */
  triggerCharacters(path: string): Promise<{ completion: string[]; signature: string[]; signatureRetrigger: string[] }>
  hover(path: string, position: LspPosition): Promise<LspHover | null>
  signatureHelp(path: string, position: LspPosition, triggerCharacter?: string): Promise<LspSignatureHelp | null>
  /** `textDocument/definition` (normalized `Location`, `Location[]` or `LocationLink[]`). */
  definition(path: string, position: LspPosition): Promise<LspLocation[]>
  /** `textDocument/references` with the declaration included. */
  references(path: string, position: LspPosition): Promise<LspLocation[]>
  /**
   * `textDocument/prepareRename`: range and text of the symbol to rename; `null` if renaming is not possible there
   * (also when the server refuses with an error; rejects only on a timeout or crash). Server without
   * `prepareRename` → the renderer uses the word.
   */
  prepareRename(path: string, position: LspPosition): Promise<{ range: LspRange; placeholder: string } | null>
  /** `textDocument/rename`. Edit in a file outside the window folder or with file create/rename/delete → rejects. */
  rename(path: string, position: LspPosition, newName: string): Promise<LspWorkspaceEdit | null>
  /** `textDocument/formatting` with the tab's indentation options. */
  format(path: string, options: { tabSize: number; insertSpaces: boolean }): Promise<LspTextEdit[]>
  /** `textDocument/codeAction` in the range, with the server diagnostics that touch it. */
  codeActions(path: string, range: LspRange): Promise<LspCodeAction[]>
  /** `workspace/executeCommand` (command of a code action). */
  executeCommand(path: string, command: LspCommand): Promise<void>
  /** `textDocument/documentSymbol` as a tree, in document order. */
  documentSymbols(path: string): Promise<LspDocumentSymbol[]>
  /** `workspace/symbol` on all of the window's ready servers (at most 500 results, inside the folder). */
  workspaceSymbols(query: string): Promise<LspSymbol[]>
  /** `textDocument/inlayHint` in the range (the visible one), at most 2000, in document order. */
  inlayHints(path: string, range: LspRange): Promise<LspInlayHint[]>
  /** `textDocument/documentHighlight`: occurrences of the symbol at the position, in the file itself. */
  documentHighlights(path: string, position: LspPosition): Promise<LspDocumentHighlight[]>
  /** `textDocument/semanticTokens/full` (or `/full/delta` over the document's last result); `null` = no tokens. */
  semanticTokens(path: string): Promise<LspSemanticTokens | null>
  /** Server `serverId` asked for the `kind` data of all its documents to be requested again (`lsp:refresh`). */
  onRefresh(cb: (refresh: LspRefresh) => void): () => void
  /** `textDocument/implementation` (same normalization as `definition`). */
  implementation(path: string, position: LspPosition): Promise<LspLocation[]>
  /** `textDocument/typeDefinition`. */
  typeDefinition(path: string, position: LspPosition): Promise<LspLocation[]>
  /** `textDocument/declaration`; server without the capability → empty list. */
  declaration(path: string, position: LspPosition): Promise<LspLocation[]>
  /** `textDocument/codeLens`; `null` without a ready server or the capability. */
  codeLens(path: string): Promise<LspCodeLensList | null>
  /** `codeLens/resolve` of lens `index` of list `resultId`; `null` if the list has been replaced. */
  resolveCodeLens(path: string, resultId: number, index: number): Promise<LspCodeLens | null>
  /** `textDocument/prepareCallHierarchy` or `prepareTypeHierarchy` at the position (up to 100 items). */
  prepareHierarchy(kind: LspHierarchyKind, path: string, position: LspPosition): Promise<LspHierarchyItem[]>
  /**
   * Neighbors of item `id` (from `prepareHierarchy` or a previous `hierarchyRelated`): incoming/outgoing calls or
   * supertypes/subtypes. Forgotten item (server restarted, folder changed) or a direction of the other kind →
   * empty list.
   */
  hierarchyRelated(id: number, direction: LspHierarchyDirection): Promise<LspHierarchyEdge[]>
  /** `workspace/applyEdit` from the server (`lsp:applyEdit`). The renderer MUST answer with `applyEditResult`. */
  onApplyEdit(cb: (request: LspApplyEditRequest) => void): () => void
  /**
   * Main gave up waiting for the answer to an `onApplyEdit` (10 s, folder/window changed) and already answered
   * `applied: false` to the server: the renderer must abort applying request `id` if it has not written anything yet.
   */
  onApplyEditCancelled(cb: (id: number) => void): () => void
  /** Answer to `onApplyEdit`; with no answer within 10 s main answers `applied: false` to the server. */
  applyEditResult(id: number, applied: boolean, failureReason?: string): void
}

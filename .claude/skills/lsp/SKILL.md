---
name: lsp
description: Language server patterns: servers owned per view (ipc/lsp.ts, lsp/registry.ts, lsp/manager.ts, lsp/server.ts), document mirror and versions, request deadlines and cancellation, normalization of untrusted server output, WorkspaceEdit application and the renderer LSP editor extensions. Use when creating or reviewing anything in src/main/lsp, ipc/lsp.ts, lspActions.ts, lspNavigationActions.ts, workspaceEditActions.ts or components/editor/lsp*.ts.
---

# Language servers (`src/main/lsp`, `editor/lsp*.ts`)

One `LspManager` per view webContents; `lsp/server.ts` (process + JSON-RPC + backoff) is stable:
change it only with a concrete reason.

## Modules

`ipc/lsp.ts` is wiring only: channels, argument validation and delegation. The manager of a view lives in
`lsp/registry.ts` (`createViewRegistry`; `lspManagerOf(wc)`, `ensureLspManager(wc)`, `syncLspActivity()`,
`killAllLsp()` for `will-quit`): import it from there, never from `ipc/lsp.ts`. `lsp/manager.ts` keeps only the server
lifecycle and the file → server routing; the rest has its own module:

| Module | Role |
|---|---|
| `lsp/documentMirror.ts` | `DocumentMirror`: open docs keyed by `pathKey`, versions, `applyChanges`, `editContext(root)` and `canon(root)` (the renderer's path spelling) |
| `lsp/applyEditBroker.ts` | `ApplyEditBroker`: the server's `workspace/applyEdit` round trip (seq, 10 s timeout, `resolve`, `dropAll`) |
| `lsp/requests.ts` | `requests` table of per-document requests (method, capability, params, normalize, `empty`, optional `exclusive` key, `shortcut`, `recover`), `REQUEST_TIMEOUTS_MS`, `RequestKind` |
| `lsp/exclusive.ts` | `ExclusiveRequests.withExclusive(key, fn)`: a new request of the same key cancels the previous one (read `token.isCancellationRequested` inside `fn`: disposing the source also cancels the token) |
| `lsp/logBuffer.ts` | `LogBuffer`: the "Output" panel lines (2000 cap) |
| `util/batcher.ts` | `createBatcher(ms, deliver)`: groups items and delivers them as one array (`push`, `flush`, `dispose`) |
| `lsp/codeLens.ts` | `normalizeCodeLens(es)`/`normalizeLensCommand` (show-locations commands become `locations`) and `CodeLensCache` (last list per document, by `pathKey`) |
| `lsp/hierarchy.ts` | call/type hierarchy normalizers (`normalizeHierarchyItem(s)`, `normalizeHierarchyEdges`), `HIERARCHY_METHODS` and `HierarchyStore` (raw items by id, capped) |

A new per-document request = one entry in `requests` + a one-line method in `LspManager` (`this.run(requests.x, path, …)`)
+ one `request(channel, parsers, call, missing)` line in `ipc/lsp.ts` (validation runs before the manager lookup;
`missing` is the answer when nothing is open and reuses `requests.x.empty`). Requests that do not fit the table
(`workspaceSymbols` over many servers, `executeCommand`, `resolveCompletion`, `resolveCodeLens`, `hierarchyRelated`)
stay in the manager. "Go to" requests that answer locations (`implementation`, `typeDefinition`, `declaration`) are
one `locationRequest(kind, method, label, cap)` line each; a new one advertises the client capability with
`linkSupport` in `clientCapabilities`.

## Lifecycle

- **LSP servers are owned per window** (`lsp/registry.ts`, one `LspManager` per `webContents`): started lazily on the first
  `lsp.open` of a file they serve, killed on folder change, reload, close and `will-quit` (global registry, also covers
  servers still in async shutdown).
- Servers spawn through `spawnGroup`, so `killAllSpawnedGroups` already covers them at `will-quit`. The `live` set in
  `lsp/server.ts` holds RUNS, removed only when the process exits: a server that is slow to die after `stopRun` stays
  there, so `markAllLanguageServersQuitting` still marks it `stopping`. At `will-quit` LSP only marks (`quitNow`) and never
  kills: `killAllSpawnedGroups` does, in one batched `taskkill` on Windows. `stopRun` marks the run not `ready` first, so requests during a restart answer empty at once.
- Events main → renderer are named apart from the invoke channels: `lsp:statusChanged` (whole status list) and
  `lsp:logAppended` (an ARRAY of `LspLogEntry`, batched per 100 ms by the manager's `logBatch`; `lsp:status`/`lsp:log` are
  only the invoke channels). `LogBuffer` (history) is updated at once; only the push to the renderer is batched.
  `shutdown()` flushes the batch before and after stopping the servers, `dispose()`/`killAll()` drop it and clear the
  timer. `log()` flushes the batch before returning the history, so the event reaches the renderer before the invoke
  reply and `mergeLog` can drop the overlap; never remove that flush. Server stderr is split with `createLineSplitter`; new log sources go through `pushLog`, never `emitLog` directly.
- Text sent to the server or back to the model (`applyEdit` failure reasons…) is English, not translated.
- POSIX servers run `detached` and are killed by process group (`kill(-pid)`) so tsserver children die too; never kill
  by bare pid after exit (pid reuse).

## Documents

- The renderer opens every loaded file tab (main keeps docs without a server too, so enabling one later reaches open
  tabs) and reports every document mutation once (`components/editor/lspSync.ts`, versions per tab; `changesToLsp` emits
  changes in descending order).

## Servers

- The built-in TS server runs `typescript-language-server` with `process.execPath` + `ELECTRON_RUN_AS_NODE=1` and always
  uses the bundled `tsserver-bundled`; a workspace `node_modules/typescript` is code from the repo and only runs with
  the user-only `lsp.servers.typescript.useWorkspaceTypeScript`.
- The editor uses `baseSetup` (`editor/setup.ts`, a copy of `basicSetup` without `lintKeymap`, whose Mod-Shift-M would
  swallow the Problems accelerator on Win/Linux): new CodeMirror extensions go there.
- Files rewritten on disk reach servers as `workspace/didChangeWatchedFiles` only if the server registered watchers
  dynamically (`lsp/watchers.ts` + `lsp/glob.ts`), fed by the window watcher's 150 ms batch (`onWorkspaceFiles`);
  `change` of a mirrored open doc is skipped, and `node_modules`/`.git` stay ignored by that watcher.

## Requests

- Requests (`ipc/lsp.ts` → `LspManager.completion/hover/…` → `lsp/requests.ts`) route path → mirrored doc → its server and answer
  `null`/`[]` when there is no ready server or capability (`ServerCaps` from the `initialize` result).
- Server output is normalized by pure modules in `lsp/` (untrusted): a `WorkspaceEdit` with create/rename/delete or a
  file outside the window folder **throws** (translated message) instead of being half-applied.
- Requests have deadlines (5 s; 15 s for references/rename/workspace symbols) and reject on timeout; a new
  completion/hover/signature cancels the previous one (it resolves `null`).
- Deadlines use `util/deadline.ts` (`withDeadline` → `TIMEOUT`); server lifecycle operations (`restart`/`stop`) run on a
  `util/serialQueue.ts` `SerialQueue`; server stderr is split with `util/lineSplitter.ts` (8 KiB cap). Never inline
  `setTimeout` + `Promise.race`, a `chain = chain.then(…)` or a `split('\n')` buffer.
- Only the **last completion list per window** is cached (`resultId` → raw items for `completionItem/resolve`).
- Results the renderer refers to later keep their raw server items in main, owned by `{ entry, runId }` (a restart
  invalidates them; `dropResults` on detach/sleep, `dropRequests` on shutdown): the **last code lens list per
  document** (`codeLens/resolve` merges the answer into the raw item) and the **hierarchy items** by id (each
  `hierarchyRelated` stores the children it returns, so recursion never reuses an id). The renderer only sees ids.
- Code lens commands of the "show locations" family (`editor.action.showReferences`, `peekLocations`, `goToLocations`,
  `rust-analyzer.showReferences`, args `[uri, position, Location[]]`) are normalized into `locations` and shown by the
  renderer (peek); servers never accept them in `workspace/executeCommand`. Other commands go through `executeCommand`
  (still checked against `executeCommandProvider.commands`).
- Server → client refresh requests (`workspace/codeLens/refresh`) are a table in `server.ts` (`REFRESH_METHODS`) →
  `host.onRefresh(kind)` → `lsp:refreshRequested` → `REFRESH[kind]` in `lspActions.ts`. A new refresh kind = one entry
  in each table plus `LspRefreshKind`.
- `ServerOptions.settings` is sent as `workspace/didChangeConfiguration` right after `initialized`
  (`workspaceSettings(def)` in `launch.ts`: the bundled TS server only offers references/implementations code lenses
  with them on).
- Code actions without edit/command are resolved inside `codeActions` (the contract has no lazy resolve).
- Inlay hints (`lsp/inlayHints.ts`), document highlights (`lsp/documentHighlights.ts`) and semantic tokens
  (`lsp/semanticTokens.ts`) are table entries too. Semantic tokens are decoded in main (relative → absolute, legend
  names checked in `capabilities.ts` because they become CSS classes, capped at 200k tokens; documents over 3 MB never
  ask). The last result with a `resultId` lives on the `ManagedDoc` (`semanticTokens`, tagged with server id and
  `runId`) and is the base of `full/delta`; a delta refused by the server falls back to `full` in
  `LspManager.semanticTokens`, and any malformed delta drops the cache instead of half-applying it.
- `workspace/inlayHint/refresh` and `workspace/semanticTokens/refresh` are answered in `server.ts` and pushed as
  `lsp:refresh {kind, serverId}`; new client capabilities go in `clientCapabilities()` next to their request.

- `documentSymbols` returns the TREE (`LspDocumentSymbol[]`, children in document order; a flat `SymbolInformation[]`
  is nested by range containment in `lsp/symbols.ts`). The `@` picker flattens it in the renderer
  (`fetchDocumentSymbols` → `flattenSymbols`); breadcrumbs, Outline and their Lezer fallback use the tree
  (`renderer-editor`, "Symbols, breadcrumbs, outline and sticky scroll").

## Edits from the server

- The server's `workspace/applyEdit` is a round trip: main emits `lsp:applyEdit {id}`, the renderer MUST answer
  `lsp.applyEditResult` (10 s timeout = `applied:false` plus `lsp:applyEditCancelled {id}`; shutdown also answers
  `false`).
- Paths from the server are re-spelled like the renderer's (`canonicalPath`: open doc path, else the window folder's
  spelling), a `WorkspaceEdit` is strict (any malformed part throws) and each file carries the mirror `version`.

## Renderer

- LSP editor extensions (`editor/lsp*.ts`) never import the store; they reach it through `lspHost` (injected by
  `lspActions.ts`) and know their tab by the `lspTabId` facet; completion is added via
  `EditorState.languageData` (never `override`, which would drop language completions).
- Data the editor asks for on its own (inlay hints, document highlights, semantic tokens) uses `lspFetch`
  (`editor/lspFetch.ts`): a ViewPlugin that debounces the trigger, skips the request when the feature is off
  (`lspHost().featureEnabled`, from `editor.inlayHints.enabled` / `editor.semanticHighlighting.enabled`) or the server
  is not ready, and drops a reply whose document or `lspDocVersion` changed. The result lives in a `StateField` (mapped
  through edits, survives hide/show). `emitLspRefresh` (`lspHost.ts`) re-asks: fired by `lsp:refresh`, by the set of
  ready servers changing and by the settings; requests errors are silent (opportunistic, like hover).
- Semantic marks (`cm-sem-<type>` + `cm-sem-mod-<modifier>`, colors in `styles/editor.css` over `--syn-*`) must stay
  in `lspExtensions`, ahead of the theme: higher-precedence decorations are the INNER DOM nodes, so their color beats
  the Lezer highlight. F7/Shift+F7 (`editor.next/previousSymbolHighlight`) walk the highlights, or the whole-word
  occurrences when there are none.
- Snippet items (`insertTextFormat: 'snippet'`) expand through `expandSnippet` (`renderer-editor` skill: variables,
  choices), never through CodeMirror's `snippet()` directly.
- Navigation that answers locations goes through ONE path (`queryLocations(kind)` in `lspNavigationActions.ts`):
  `goToLocations(kind)` (one result jumps, many go to the References view) and `peekLocations(kind)` (inline peek).
  A new "go to" kind = an entry in `FETCH` and its messages (`lspNavigation.locations`).
- The **peek** (`editor/lspPeek.ts`, `openPeek(view, { pos, title, locations })`) is a block widget below the line,
  provided by a `StateField`; its selection and loaded files live in a model object outside the state. The preview is
  static highlighted text (`highlightRange` from `lib/codeHighlight.ts` with the target file's language), never another
  `EditorView`. The widget's `ignoreEvent` is `true`: its keys (Esc, Enter, ↑/↓) and clicks are its own.
- **Code lenses** (`editor/lspCodeLens.ts`) live in `codeLensSlot`, toggled with the lightbulb by `refreshLspGutters`
  (server ready and `editor.codeLens`). Lists are requested 600 ms after edits and dropped if the doc changed while
  waiting; unresolved lenses are resolved only in the viewport, one attempt each. The mirror copy (no `historyField`)
  never requests lenses: both copies would fight over main's last list per document.
- The Hierarchy view (`hierarchyActions.ts`, `components/HierarchyPanel.tsx`, `lib/hierarchyTree.ts`) loads children
  lazily per node and drops answers of an older hierarchy or direction.
- Every edit from the server goes through ONE applier (`applyWorkspaceEdit` in `workspaceEditActions.ts`): plan everything, refuse
  stale versions/snapshots, write unloaded files to disk first (original EOL), then apply loaded tabs all-or-nothing
  (dirty, one undo per file).

---
name: renderer-store
description: State management patterns in the renderer (single zustand store in src/renderer/src/store.ts, actions as exported functions in the modules beside it, narrow selectors, async race guards). Use when creating or reviewing state, actions, or any component that reads from the store.
---

# Store (`src/renderer/src/store.ts` + action modules)

## Rules

- **One** zustand store. State is the `State` type in `store.ts`, an intersection of the per-domain interfaces in `types/` (initial values in `state/`); **actions are exported functions in modules
  beside it** (table below) using `get`/`set` — they do not live inside `create()`, and the store is never split into
  slices. Components import actions directly from the module that owns them.
- **`store.ts` imports no action module** and never re-exports one (import cycle). A module may import `store.ts` and
  the modules below it in the table; avoid cycles between modules. Module-level code must not touch the store
  (`useStore.subscribe`, `bindXxx(...)` go in a `start…Reactions()` called by `storeReactions.ts` or `ipcReactions.ts`),
  because a module can be evaluated while `store.ts` is still loading. Modules at the root of `src/renderer/src` never
  import components (`.tsx`); what both need lives in a non-React module (e.g. `components/editor/editorFocus.ts`).
  Enforced by `import-x/no-restricted-paths` in `eslint.config.mjs`.
- Module-level mutable state (maps, `createLatest`, timers) lives in the module that owns the actions using it; per-tab
  maps are pruned by that module through `onTabsClosed`, per-folder reactions through `onRootChange` (both in
  `store.ts`, registered in the module's `start…Reactions`).
- **Per-folder state** (tabs, references, `fileRevs` (per-path revision bumped by the watcher batch for diff, image and Markdown preview tabs; those components select `s.fileRevs[path]` and never subscribe to `workspace.onChange`), the `claude` slice keeping `starting`, `quickInput`, `themePreview`…)
  is reset ONLY by `workspaceScopedState(root, prev)` in the single `set` of `enterWorkspace`; `onRootChange` is for
  module-level state (maps, timers, processes). The `docker` slice is host-wide, not per folder.
- **Cross-field invariants are enforced by the writers**, not by a subscription that re-`set`s: opening a quick input
  clears `overlay` and `themePreview` (`quickInputActions.ts`), closing/hiding the panel clears `panelMaximized`.
- Async loads inside a component or hook (history, usage report, symbols, project files): `useAsync(fn, deps)` (`components/common/useAsync.ts`, see `renderer-components`) keys the result by `deps`, so a stale answer never renders; do not hand-write a `let cancelled` effect.
- Per-key async races (directory listings, tabs): `createLatestByKey` from `lib/latest.ts` (`next`, `isCurrent`,
  `forget`, `clear` on root change). Saves of one tab are chained in `saveActions.ts` (`saveTab` waits for the
  in-flight write of the same tab).
- Modules outside `store.ts`, `components/**` and tests read and write the store only through `get()`/`set()` from
  `store.ts` (never `useStore.getState()`/`setState()`, never a local `const get = useStore.getState` alias);
  `useStore.subscribe` stays. Enforced by lint (`no-restricted-syntax` in `eslint.config.mjs`). Tests that mock
  `./store` must provide `get`/`set`.
- Components select **narrow slices**. Never subscribe to the whole store.
- Async actions **guard against stale context** before writing (workspace switched, tab closed).
- State used by a single component that doesn't need to survive unmounting may stay in `useState`.
- User preferences come from settings — never from constants in components.

```typescript
// ✅ CORRECT — re-renders only when the branch changes
const branch = useStore((s) => s.git?.branch)

// ❌ WRONG — re-renders on every keystroke anywhere in the app
const { git } = useStore()
```

## Actions

```typescript
import { get, set } from './store'

export async function refreshGit(): Promise<void> {
  const { root } = get()
  if (!root) return
  await attempt(
    async () => {
      const git = await api.git.status(root)
      if (get().root === root) set({ git })     // ✅ ignore results from a previous workspace
    },
    { format: (message) => `Git: ${message}` }
  )
}
```

- **Errors shown to the user go through `attempt(fn, options)`** (`attempt.ts`, beside `toasts.ts`; never a hand-written
  `try { … } catch (err) { notify(errorMessage(err)) }`). It runs `fn` (sync or async), and on failure toasts the
  message (`errorMessage`) and returns `options.fallback` (`undefined` by default): `format(message)` builds the toast
  text (a `t()` template, resolved at call time), `quiet` (`true` or `(err) => boolean`, evaluated on failure, e.g.
  "the folder changed meanwhile") suppresses the toast, `onError(err)` runs first on failure (undo an optimistic
  patch, clear state). Success-only side effects and stale-context guards stay inside `fn`; a guard that returns early
  and a failure both yield "no result", so return a value that tells them apart when the caller must. Keep a plain
  `try/catch` when the catch does more than that (several ordered side effects around the toast, `catch` that turns the
  error into a result value, or logic that must run after the toast).

- Name actions as verbs: `openFile`, `closeTab`, `toggleDir`, `refreshGit`.
- Debounce bursts (watcher events) inside the action layer (`scheduleGitRefresh`), not in components.
- Cross-cutting reactions that are not UI (e.g. pruning editor states of closed tabs) use `useStore.subscribe` in the
  module that owns the data, always as `subscribe(selector, listener, { equalityFn })` (the store uses
  `subscribeWithSelector`): the selector covers every field the listener reads to decide (so streaming deltas or
  cursor moves don't wake it), `shallow` from `zustand/shallow` for tuple/object selectors. A bare `(s, prev)` listener
  runs on every `set`; only one-shot waiters (`workspaceReady`) use it.
- A reaction that compares with the previous value (`(next, prev)`) is ALWAYS written with `subscribeDiff(selector,
  listener, equalityFn?)` from `store.ts`, never with the `prev` argument of `useStore.subscribe`: zustand computes that
  `prev` from the outermost `set`, so when an earlier listener calls `set` synchronously, the listeners after it get
  inconsistent pairs (stale "next", a tab just opened looking closed). `subscribeDiff` keeps the last processed value
  in a closure (initialized from `get()`), reads the current one from `get()` and skips when unchanged.
- Every `start…Reactions()` builds a `createReactionScope()` (`lib/reactions.ts`): `scope.add(off)` for subscriptions,
  timers and listeners, `scope.bindGlobal(bind, unbind)` for module-level bindings (`unbind` must be a stable module
  function: an old `stop` never undoes the binding of a newer instance), and returns `scope.stop`. No hand-written
  `offs.forEach((off) => off())` or owner variables.

## One-shot requests (focus, reveal, scroll)

Never add a `…Nonce` field (a counter the component watches in an effect). Pick by asking: **can the request be issued
while the consumer is unmounted?**

| The consumer is | Mechanism | Examples |
|---|---|---|
| Mounted on demand (sidebar views, a group that a split is about to create) or the request carries data for a row that may not exist yet | `requestOnce(kind, payload)` (`requests.ts`) into `requests` (scoped, one pending request per kind in `types/requests.ts`); the consumer calls `useRequest(kind, handle, match?)` (`components/common/useRequest.ts`), which takes the request out of the store after the commit and calls `handle(payload)`. It survives a remount until served, and is served once | `searchFocus`, `commitFocus`, `historyScroll`, `historyReveal {hash}`, `explorerReveal {path}`, `groupFocus {groupId}`, `breadcrumbsFocus {groupId}` |
| Always mounted when the request makes sense, and it only needs to run something (focus a field, refocus the terminal) | bridge in `focusBridge.ts`: `useFocusTarget(target)` in the component, `requestFocus(target)` in the action (`false` = nobody registered, the component focuses itself on mount). The hook returns a counter that goes into the focusing effect, so it runs after the commit | `requestFocus('terminal')`, `terminalFind:<id>`, `claudeFind:<id>` |
| A DOM region an action must test or focus | `registerRegion` via `useFocusRegion(region)` (see `renderer-components`) | `hasFocus('tree')`, `focusRegion('claudeNewConversation')` |

State that stays true after the focus (a find bar being open) is real state (`terminalFindId`, `claudeFindId`), not a
request. A request that changes what a row renders (`historyReveal` opens the commit) is served by the `useRequest` handler of
the component that owns that state (`GitHistory` opens the commit through its `expansion.open`, a local `useState`
updated from the handler), never mirrored into the row during render. `takeRequest(kind, seq)` never removes a
newer request of the same kind. Actions never query the DOM by selector (`querySelector`, `closest`): the component
registers the element instead.

## Lists

In big lists (file tree, search results) **each item selects only what it needs**:

```typescript
function TreeItem({ entry }: { entry: DirEntry }) {
  const expanded = useStore((s) => !!s.expanded[entry.path])
  const isActive = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path === entry.path)
  …
}
```

## Shared selectors

Never write the lookup by hand (`conversations.find((c) => c.id === id)`, `tabs.find((t) => t.id === id)`,
`shortcutLabel(s.keybindings, id, platform)`); use the shared ones. They return the reference stored in the list, so
they are safe as zustand selectors.

| Need | Use |
|---|---|
| Conversation by id / active conversation | `selectConversation(id)(s)` / `selectActiveConversation(s)` from `lib/claudeSelectors.ts` (`useStore(selectConversation(id))` in a component, `selectConversation(id)(get())` in an action) |
| One field of a conversation in a component | `useConversationField(id, (c) => c.title, '')` / `useActiveConversationField(pick, fallback)` from `components/claude/useConversation.ts` (`pick` returns a reference already stored in the conversation, `fallback` is a constant) |
| Several fields of the active conversation | one `useStore(useShallow((s) => ({ … })))` over `selectActiveConversation(s)`, never one `useStore` per field |
| Tab by id | `selectTab(id)(s)` from `lib/tabSelectors.ts` (`id` may be `null`); the active tab stays `findActiveTab(s)`; `isForeignDiff(tab)` (commit/proposal diff) is in the same file. Finds by `path`/`kind`/`preview` are different queries and stay inline |
| Effective shortcut text | `useShortcutLabel(commandId)` from `components/common/useShortcutLabel.ts` (`''` when none) |

`claude.conversations` stays an array: a handful of conversations makes the `find` scan negligible, and the narrow
selectors above already stop streaming of one conversation from re-rendering the others.

## Modules (where the actions live)

| Module | Owns |
|---|---|
| `types/<domain>.ts` | Domain types and the `<Domain>State` interface of each domain (`tabs`, `explorer`, `git`, `panel`, `lsp`, `claude`, `quickInput`, `settings`, `toasts`, `layout`); types only, so `lib/` and components import them from here, never from `store.ts` |
| `state/<domain>.ts` | Initial values of each domain: `global…State()` (survives a folder switch) and `scoped…State(root?, prev?)` (reset by `workspaceScopedState`). A new field goes in the interface of its domain and in one of the two factories |
| `store.ts` | `State` (intersection of the `types/` interfaces, single store), `useStore`, `workspaceScopedState` (spreads the `scoped…State` factories), `get`/`set`, `onRootChange`, `onTabsClosed`, selectors (`selectThemeName`, `selectGitOperation`, `selectGitBusy`), `defaultIndent`, `enterSeq`, tab/group accessors (`findFileTab`, `patchTab`, `groupsState`, `commitGroups`, `forcedEncodingFor`) |
| `lib/errors.ts` | `errorMessage(err)`: message of a thrown value without Electron's `Error invoking remote method '…': Error:` prefix; import it from `./lib/errors` (never from `store.ts`) when the message is used as data (not toasted: use `attempt`) |
| `attempt.ts` | `attempt(fn, { format?, fallback?, quiet?, onError? })`: runs `fn`, toasts the failure with `notify(errorMessage(err))` and returns `fallback`; lives beside `toasts.ts` (not in `lib/`, which stays store-free) |
| `toasts.ts` | `notify`, `showToast`, `updateToastByKey`, `leaveToast`, `dismissToast*` |
| `settingsActions.ts` | settings sync/watch, settings modal open/close (`openSettingsModal`/`closeSettingsModal`; `startSettingsReactions` registers its `registerOverlayPolicy`), `setSettingValue`/`resetSettingValue`, `toggleBooleanSetting` (toggle commands; writes the layer that defines the key), `previewTheme`, `selectTheme` |
| `overlayActions.ts` | `showOverlay` (one modal at a time, clears `quickInput`/`themePreview`), open/close of `addWorkspace`, `mcp` and `usage`; `startOverlayReactions` registers their command policies with `registerOverlayPolicy` (`commands/registry.ts`, see `commands-settings`); the containers policy is registered by `startDockerReactions` |
| `quickInputActions.ts` | quick input open/close/query, `showPicker`/`togglePicker`, theme/recent/clone-url pickers |
| `layoutActions.ts` | `showView` (asks the search view for focus), `toggleSidebar`, `resizeSidebar`/`resizePanel`/`resizePanelWidth`/`resizeClaude`, Claude find |
| `requests.ts` | `requestOnce`, `takeRequest` (the `requests` slice; consumer hook `useRequest`) |
| `focusBridge.ts` | pure registry, no store: focus regions (`registerRegion`, `hasFocus`, `focusRegion`, `blurRegion`, `captureFocus`/`restoreFocus`) and focus targets (`registerFocusTarget`, `requestFocus`); used by `claude*.ts`, `dockerActions.ts`, `focusContext.ts`, `terminalActions.ts`, `layoutActions.ts` |
| `recentActions.ts` | recent files (`markRecentFile`, `setRecentFiles`) and recent folders (`watchRecents`…) |
| `diskSync.ts` | watcher/disk reconciliation of a tab (`syncTabWithDisk`, `reloadFromDisk`, `keepMyVersion`, `applyDiskText`); the per-tab format-dirty (EOL) and disk-read maps are private: `markFormatDirty`/`clearFormatDirty`/`formatDirtyEol`, `beginDiskRead` (tabs closing are pruned through `onTabsClosed`) |
| `saveActions.ts` | `saveTab`/`saveAllTabs`, `confirmAndSave`, `withAutoSaveSuspended`, `confirmDialog`, close requests, window dirty flag |
| `explorerActions.ts` | `loadDir` (latest read per dir wins), `startExplorerReactions`, `toggleDir`, `collapseAll`, `setExplorerEdit` (fires `onExplorerRenamed(path, path)` when a rename edit ends without renaming: cancel, empty, same name or error), `onExplorerRenamed` (listeners for the end of a rename/move, `to === from` when nothing was renamed), `setExplorerDrag`, `handleRenamed`/`handleRemoved`, `revealInExplorer` |
| `explorerFsActions.ts` | explorer disk operations (imports `tabActions`/`gitActions`, hence apart from `explorerActions.ts`): `activateExplorerEntry(entry)` (click/Enter on a row: folder toggles, file opens in preview), `deleteEntry`, `moveEntry`, `showExplorerContextMenu(entry, isRoot?)`, `importDroppedFiles`, `revealPath`/`copyPathToClipboard`, `submitEdit`; a successful rename/move announces `(from, to)` through `onExplorerRenamed` (`explorerActions.ts`) |
| `projectFiles.ts` | project file list shared by Quick Open (`loadFileList`, via `useProjectFiles`) and the Claude `@` mentions (`loadProjectFiles`, adds derived `folders`): one entry per root with a 5 s TTL, dropped on root change (`startProjectFilesReactions`) and by `invalidateProjectFiles()` when a watcher batch creates/removes files or edits an ignore file (`handleWorkspaceChange`, `lib/fileListChange.ts`); failures are not cached |
| `fileViewActions.ts` | disk reads of the image viewer and the Markdown preview: `readImage`, `readCachedImage`/`knownImage` (preview images, TTL + 60 entries max + stale-while-revalidate, cleared on root change), `readSourceText`, `openLinkedFile(path, previewTabId)` (link click: exists check, opens in the other group) |
| `tabActions.ts` | tabs and editor groups: `openFile`/`openDiff`/`openCommitDiff`, `activateTab`, close/move/split, `setDirty`, `setCursor`, `activeTab`/`activeLoadedFileTab`, `startTabReactions` |
| `tabFormatActions.ts` | format of the active tab (imports `tabActions`): `setTabFormat`, EOL (`setTabEol`, `toggleActiveEol`), indent (`setTabIndent`, `convertTabIndent`), `setTabLanguage`, `reopenWithEncoding`/`saveWithEncoding`, the language/encoding pickers |
| `gitActions.ts` | git status/stage/commit/network/branches/discard and the stash mutators (`stashSave`/`stashApply`/`stashPop`/`stashDrop`, built on `runGit`), `startGitReactions` (starts the two modules below) |
| `gitRepo.ts` | `requireRepo()`: open repository root or a notice (shared by `gitActions.ts` and `gitHistoryActions.ts`, which `gitActions.ts` imports, hence apart) |
| `gitHistoryActions.ts` | stash list/pickers (`refreshStashes`, `openStashPicker`, `openStashMessagePicker`) and history (`loadHistory`, `toggleHistory`, `showHistory`, `showCommitInHistory`, `syncHistory`, `loadCommitFiles(hash)`: commit files cached, max 100, cleared on root change by `startGitHistoryReactions`); imports no `gitActions` |
| `gitBaselineActions.ts` | gutter baselines: `refreshBaseline` (race-guarded per tab), `refreshBaselines` (visible tabs now, hidden ones when they show again), `startGitBaselineReactions`; imports no `gitActions` |
| `terminalActions.ts` | terminals and the bottom panel (`fetchCwd(id)`, `createTerminal`, `showPanel`, `togglePanelView`, maximize/position, terminal find) |
| `lspActions.ts` | LSP state (`subscribeLog`/`loadLspLog` for the Output panel, `fetchDocumentSymbols` (the tree flattened)/`fetchWorkspaceSymbols` for the symbol pickers, `setFileDiagnostics`, `watchLsp`, `clearReferences`, `openProblem`) and the editor LSP actions (rename, format, save with format, quick fix), `startLspReactions` |
| `lspNavigationActions.ts` | go to definition/references, `revealSymbol`, `revealDocumentSymbol` (Outline, breadcrumbs), `jumpToItem`, `navigate` (back/forward), the References list (`setReferences`) and `activeFile()`; imports `workspaceEditActions.ts` |
| `workspaceEditActions.ts` | `applyWorkspaceEdit` (the single `WorkspaceEdit` applier), `snapshotDocs`, `fileTabs`, `watchLspEdits`; imports no LSP action module |
| `sessionActions.ts` | session build/save (`flushSession`, `scheduleSessionSave`), `setRestoring` + `workspaceReady(root, timeoutMs)` (view in `root` with its session applied), `startSessionReactions` |
| `workspaceLifecycle.ts` | `openWorkspace`, `enterWorkspace`, `restoreWorkspace`, session restore, watcher batches (`handleWorkspaceChange`), `setWorkspaces` |
| `bootstrap.ts` | `bootstrap()`, the single startup entry (called once by `main.tsx` before the first render): locale (`bootLocale`, `locale` in the store starts from `getLocale()`), `registerBuiltinCommands`, `startStoreReactions`, `startAppearance`, `startAutoSave`, `startFocusContexts`, `startIpcListeners`, then `syncSettings(null).then(restoreWorkspace)`. Order matters: theme applied before the first render, listeners registered before the restore (no event lost), user settings before the restored folder's |
| `claude*.ts` (`claudeState`, `claudePromptBridge`, `claudeDrafts`, `claudeQueue`, `claudeVisibility`, `claudePermissions`, `claudeEvents`, `claudeLifecycle`, `claudeEditorContext`, `claudeSessionMeta`, `claudeMcpActions`, `claudeLogin`, `claudePromptActions`, `claudeRewind`, `claudeConversationSettings`, `claudeReactions`) | the Claude panel actions, one module per responsibility, listed in dependency order (each imports only modules before it in this list; only cycles are lint-enforced); map in the `claude-panel` skill ("Renderer modules"). `claudeReactions.ts` (`startClaudeReactions`) is the top, started by `ipcReactions.ts` |
| `storeReactions.ts` | `startStoreReactions` (calls each store-only module's `start…Reactions`, including `startProjectFilesReactions`, `startFileViewReactions`, `startSettingsReactions` and `startOverlayReactions`; a second call stops the first) |
| `ipcReactions.ts` | `startIpcListeners`: every event main pushes to this view (`onCommand`, workspace/close/terminal events, `watchRecents`, `watchClone`, `watchSettings`, `watchLsp`, `watchLspEdits`, `watchUpdates`) plus the modules that mix IPC with store subscriptions (`startClaudeReactions`, `startWorkspaceBarReactions`, `startDockerReactions`). `watch*` = IPC only; `start…Reactions` = also subscribes to the store |

## Quick Index — current state slices

| Slice | Owner actions |
|---|---|
| `root`, `dirs`, `expanded`, `explorerEdit`, `explorerSelected` (selected row, also the target of paste), `explorerClipboard` (`{ paths, mode: 'copy' \| 'cut' }`) | `openWorkspace`, `loadDir`, `toggleDir`, `collapseAll`, `setExplorerEdit`, `setExplorerSelected`, `handleRenamed`, `handleRemoved`; in `explorerFsActions.ts`: `copySelection`, `pasteIntoExplorer` (internal clipboard, else Finder files via `fs.clipboardFiles`), `duplicateEntry`, `importFiles` (Finder drop = copy) |
| `tabs` (tab ENTITIES: `FileTab` dirty/preview/deleted/conflict/eol/indent/indentFallback — fallback tabs follow `editor.tabSize`/`insertSpaces` via a store subscription + `setDocumentIndent(id, indent, tabSize)`; saving a fallback tab re-runs `resolveIndent` — `DiffTab`, `MarkdownPreviewTab` `{ kind: 'markdownPreview', path }` that renders the source tab's buffer, and `ImageTab` `{ kind: 'image', path }` opened by `openFile` for image extensions (`@shared/imageTypes`; persisted in the session as `{ kind: 'image', path }`)), `editorGroups` (`{ id, tabIds, activeTabId }`, 1 to `MAX_EDITOR_GROUPS`, in the grid's reading order; the tab bar order is `tabIds`; the same entity may be in several groups; pure model in `lib/editorGroups.ts`), `activeGroupId`, `editorLayout` (split tree, `shared/editorLayout.ts`), `compareSelection` (path marked by "Select for Compare"), `activeTabId` (**mirror** = active tab of the active group, written only by `commitGroups` — never `set({ activeTabId })`), `reveal`, `cursor` | `commitGroups(next)` is the only writer of groups: keeps `activeTabId` in sync and drops tabs that no group shows (the entity, its document, dirty prompt and LSP close only go away then). `openFile` (`{ preview }`; targets the ACTIVE group, preview slot is per group), `openDiff`, `showTabInActiveGroup(tab)`, `activateTab(id, groupId?)`, `activateGroup`, `pinTab`, `moveTab(id, toIndex, toGroupId?, fromGroupId?)`, `closeTab(s)(ids, groupId?)`/`closeOtherTabs`/`closeTabsToRight`/`closeSavedTabs` (close in ONE group; the dirty prompt only covers tabs that would disappear), `splitEditor(side)`, `focusOtherEditorGroup`, `focusEditorGroupAt`, `focusEditorGroupToward`, `moveActiveTabToAdjacentGroup`, `joinAllEditorGroups`, `dropTabOnGroup`, `closeEditorGroup` (closes the group's exclusive tabs with the dirty prompt), `resizeEditorGroups`, `openMarkdownPreview` (⇧⌘V: preview in the group to the right, creating the split; a second call focuses it), `compareActions.ts` (`openCompare`, `selectForCompare`, `compareWithSelected`, `compareActiveWithSaved`, `swapCompareSides`), `findMarkdownPreview`, `saveTab`, `saveAllTabs`, `confirmAndSave`, `handleCloseRequested`, `reloadFromDisk`, `keepMyVersion`, `setDirty`, `setTabFormat`, `clearReveal`, `setCursor` |
| `view`, `sidebarVisible` | `showView`, `toggleSidebar` |
| `git`, `gitBusy`, `gitOperation`+`gitOperationRoot` (`GitNetworkOp` in flight; read via `selectGitOperation`, which hides it from other folders), `commitMessage`/`commitAmend`, `gitBranches` (loaded when the branch picker opens), `stashes`, `gitHistory` (paged, `historyOpen`) | `refreshGit` (+ debounced `scheduleGitRefresh`; also refreshes stashes, history on HEAD change and editor baselines), `runGit`/`withGit` (local ops set `gitBusy`), `stageFiles`, `unstageFiles`, `commitChanges`, `setCommitAmend`, `startAmend`, `undoLastCommit`, `discardChanges`/`discardAll` (always confirm), `pullChanges`/`pushChanges`/`syncChanges`/`publishBranch` (`runNetwork` sets `gitOperation`), `openBranchPicker`/`openCreateBranchPicker`/`checkoutBranch`/`createBranch`, `stashSave`/`stashApply`/`stashPop`/`stashDrop`/`openStashPicker`, `loadHistory`/`toggleHistory`/`showHistory`, `openCommitDiff` (read-only `DiffTab.commit`, not persisted), `refreshBaseline` (gutter baseline per loaded tab, race-guarded) |
| `terminals`, `activeTerminalId`, `terminalVisible` (= bottom panel visible; persisted in the session), `panelView` (`'problems' \| 'output' \| 'terminal' \| 'references'`, not persisted) | `createTerminal` (also shows the panel on Terminal), `showPanel(view)`, `togglePanelView(view)` (hides if the panel is already on that view, else shows it), `hidePanel`, `toggleTerminal` (= `togglePanelView('terminal')`), `activateTerminal`, `killTerminal`, `removeTerminal` (hides the panel only if it was on Terminal) |
| `diagnostics` (`Record<path, Diagnostic[]>`, a file without problems has no key; cleared on folder change; counts cached by reference in `lib/problems.ts`), `lspStatuses` (`LspServerStatus[]`, find the active file's server with `serverForPath`) | `watchLsp` (started by `startIpcListeners`: `onDiagnostics` + `onStatus` + initial `refreshLspStatus`), `setFileDiagnostics` (ignores paths outside the root), `restartLanguageServer`, `openProblem(path, diagnostic)` (preview tab + reveal). Subscriptions in `startLspReactions` (`lspActions.ts`): diagnostics → `setDocumentDiagnostics` of loaded tabs (also re-applied when a tab's path changes, so a rename clears the old marks); tabs → `syncLspPaths` (rename = LSP close + open). Document sync (`didOpen/didChange/didSave/didClose`) lives in `components/editor/lspSync.ts`, fed by `documentStore.ts` |
| `quickInput` (`null` = closed, else `{ query, picker?, session }`; `session` keys the panel so each opening remounts it; `picker`: `'theme' | 'recent' | 'branch' | 'createBranch' | 'stashMessage' | 'stashPick'` (+ `stashAction`)) | `openQuickInput`, `closeQuickInput`, `setQuickInputQuery`, `toggleCommandPalette`, `openThemePicker` |
| `settings`, `workspaceKeys` (keys defined in `.walph/settings.json`), `keybindings`, `excludeMatcher`, `themePreview` (snapshot from main; `files.exclude` compiled once) | `syncSettings(root)`, `watchSettings`, `openSettingsFile`, `selectTheme` (writes via `api.settings.setValue`, to the `workspace` layer when the key is in `workspaceKeys`, else `user`), `previewTheme`; `selectThemeName` selector. Side effects live in `appearance.ts` (theme/editor settings) and `autoSave.ts` |
| `recentFiles` (MRU per root, persisted in localStorage) | `openFile`, `activateTab` (touch via `markRecentFile`), `handleRenamed`, `handleRemoved`, `openWorkspace` (load); writes skip unchanged lists |
| `confirmingSave` (auto save suspended while the unsaved-changes dialog is open) | `confirmAndSave` |
| `recentFolders` (`RecentFolder[]`: path + lastOpened + branch; from main, shared by windows), `clone` (`CloneState` of the clone in flight, `cloneActions.ts`: `cloneRepository(url, name)`, `cancelClone`, `watchClone`; progress toast key `git:clone` updated in place by `updateToastByKey`; `quickInput.picker: 'cloneUrl'` via `openCloneUrlPicker`), `sidebarWidth`, `panelHeight` | `watchRecents`, `removeRecentFolder`, `clearRecentFolders`, `resizeSidebar`, `resizePanel`; `quickInput.picker: 'recent'` via `openRecentPicker` |
| session (per root, saved by main) | `openWorkspace(root)` (focusIfOpen → confirmAndSave → flush → `workspace.open` → `enterWorkspace`), `restoreWorkspace` (uses `workspace.current()`), `flushSession`/`scheduleSessionSave` (400 ms; skipped while `restoring`); pure pieces in `lib/session.ts`; per-tab cursor/scroll in `groupViews.ts` (`tabViewState`) and `documentState.ts` (`setPendingView`) |
| `search` (`SearchState` in `lib/searchResults.ts`: query/replace/options incl. include+exclude, `answer` keyed by `searchKey`, `collapsed`, F4 `cursor`, `replacing`) | Actions in `searchActions.ts` (not store.ts): `setSearchQuery`/`toggleSearchOption`/`setSearchFilter` (debounced, stale + `cancelled` responses ignored), `showSearch(replace)` (seeds from editor selection), `stepSearchResult`, `openSearchMatch`, `replaceInResults({kind})` (dirty tabs via `applyTabEdits`, others via `api.search.replace`; prunes the result instead of re-searching), `clearSearch`, `collapseAllResults`/`expandAllResults`; selectors `selectSearchAnswer`/`selectSearchLoading` |
| `references` (`ReferencesResult`: title + items with line preview; the References tab only exists while non-null; cleared on folder change) | `setReferences`, `clearReferences`. Navigation history lives outside the store in `navigationState.ts` (`recordNavigation` before every jump, `stepNavigation`; pure logic in `lib/navigationHistory.ts`). LSP actions that need the store live in `lspActions.ts`, `lspNavigationActions.ts` and `workspaceEditActions.ts` (not store.ts): `applyWorkspaceEdit` (shared by rename, code actions and `workspace/applyEdit`; loaded tabs via `applyTabEdits`, others read/written on disk with their EOL; everything computed before committing; `snapshotDocs` guards against stale docs), `goToDefinition`/`goToReferences`/`navigate`, `renameSymbol`, `formatTab`/`formatDocument`, `saveTabManually`/`saveAllTabsManually` (`editor.formatOnSave`, manual saves only, 1.5 s budget), `quickFix`, `watchLspEdits` (started by `startIpcListeners`) |
| `toasts` (`Toast`: tone `done\|info\|attention\|error`, title, description, actions, optional `key`/`duration`; one stack) | `notify(text, kind)` (generic info 4 s / error 8 s), `showToast` (same `key` replaces in place), `dismissToast`, `dismissToastByKey`, `dismissToastsWhere`. Claude conversations also hold `agentStatus` + `unread` (from `sessionStatus`); `claudeVisibility.ts` owns visibility (active tab + panel visible + window focus) and `markRead`; the Claude toasts live in it and in `claudePermissions.ts` (keys `claude:<id>:done\|error\|permission:<requestId>`) |
| `workspaces` (`WorkspacesState` from main: `selfId` + tabs; `null` until `list()`; this view is active when its entry has `active`, `isViewActive` in `lib/workspaces.ts`) | `setWorkspaces`; `workspaceActions.ts`: `startWorkspaceBarReactions` (list + `onChange` + `notifications` → toasts with `origin`, keys `ws:*` pruned by `isNoticeStale`; reports the git branch via `reportBranch` on change, 150 ms), `addWorkspace`, `closeWorkspace`, `activateWorkspace`, `moveWorkspace`. `claudeVisibility.ts` also requires the view to be active |

| `settingsLayers` (valid values per file, no defaults), `overlay` (one modal at a time: `settings` / `addWorkspace` / `mcp` / `usage`; cleared when a quick input opens) | `openSettingsModal`, `closeSettingsModal`, `setSettingValue(layer, key, value)` / `resetSettingValue(layer, key)` (call main, toast on error, NO optimistic state: the modal redraws from the snapshot) |

| Claude sessions | `claude.renamingId` (tab being renamed); per conversation `favorite`, `userTitle` (wins over `autoTitle` from `title` events) | `toggleFavorite` (all in `claudeSessionMeta.ts`), `startRename`/`renameConversation`/`stopRename`/`renameActiveClaudeSession`, `duplicateConversation` (fork + resume), `exportConversation`, `reviewChangedFile` (git diff of a file). Agent timestamps live outside the store (`agentTimes` in `claudeEvents.ts`, first-seen `Date.now()`) |

Keep this table up to date when adding slices.

Export only what another module (or a test) imports; `pnpm knip` fails on the rest. Names in the tables above that are
not exported (`setDirty`, `setCursor`, `findMarkdownPreview`, `setReferences`, `setFileDiagnostics`,
`formatTab`, `applyDiskText`, `cancelClone`, `runGit`, `publishBranch`,
`duplicateEntry`, `selectSearchAnswer`) are internals of their module, listed to describe behavior, not as cross-module
API.

## Focus contexts

`src/renderer/src/focusContext.ts` (`startFocusContexts`, started by `bootstrap`) reports `terminalFocus` / `editorFocus` / `explorerFocus` (`.tree`, not the inline rename input) to main via
`api.window.setContext` — only on change, from document `focusin`/`focusout` (pure mapping in `lib/focusContext.ts`).
`editorFocus` means the **file editor only** (`.code-editor .cm-editor`); the DiffEditor's MergeView does not count. When
the terminal panel is hidden or its last terminal removed while focused, the browser drops focus silently: a store
subscription in `focusContext.ts` moves focus to the editor (`focusEditor()` from `components/editor/editorFocus.ts`, else blurs) and resends the contexts. The same happens when `panelView` leaves `terminal` while the terminal had focus, and when the panel is hidden with focus inside Problems/Output (`.panel-container`).
The regions it tests and focuses (`editorSlot`, `tree`, `panelContainer`, `panelTab`, `claudePanel`, `claudeNewConversation`) come from `focusBridge.ts`; the only selectors left are in `lib/focusContext.ts` `contextsOf`, which classifies the focused element by the classes of widgets that cannot register themselves (xterm, CodeMirror, the Markdown preview).
Window blur keeps the last value. Main uses them in keybinding `when` clauses; never add `keydown` handlers for this.

---
name: renderer-editor
description: CodeMirror 6 patterns in Walph (one EditorView per editor group, one document per tab with a mirror state for split views, language compartments, dirty tracking, reveal/selection, diff view with @codemirror/merge, position conventions). Use when creating or reviewing anything in src/renderer/src/components/editor or any editor extension (LSP, gutter, settings).
---

# Editor (`src/renderer/src/components/editor`)

## Architecture

- There is **one `EditorView` per editor group** (1 to `MAX_EDITOR_GROUPS` = 8, in a grid of splits), kept in a registry inside
  `components/editor/groupViews.ts` (`mountView(groupId, parent)`, `getView(groupId?)`, `shownTabId(groupId?)`,
  `showDocument(groupId, tabId)`, `hideDocument(groupId, tabId, keep)`, `unmountView(groupId, keep)`). Omitting the
  group id means the **active group** (`setActiveGroup`, fed by a store subscription), so LSP actions, search and
  Claude context keep using `getView()`/`shownTabId()` unchanged. `CodeEditor.tsx` mounts one view per `EditorGroup`.
  The document modules do not import the store (the store injects callbacks with `bindDocumentHandlers`), so store and
  commands can save/reload tabs without an import cycle. They are layered, each importing only the ones before it in
  this list: `documentState.ts` (shared maps `states`/`savedDocs`/`indents`/`topLines`/`pendingViews`, handlers, edit and
  doc listeners, compartments, current config/theme, `matchesSaved`, `hasDocument`), `groupViews.ts` (views, owners,
  mirrors, `promote`, `forwardToTwins`, `showDocument`/`hideDocument`, `currentState`, `tabViewState`, `dispatchEffects`),
  `documentConfig.ts` (live reconfiguration: `setEditorTheme`/`setEditorPhrases`/`setEditorConfig`, `reconfigureAll`,
  `applyLanguage`, indent, baseline, diagnostics, lightbulb gutter), `documentStore.ts` (`extensionsFor`,
  `loadDocument`/`forgetDocument`/`saveDocument`/`replaceDocument`/`applyTabEdits`). Import each symbol from its owner;
  there is no barrel.
- **One document per tab.** Its canonical `EditorState` (history, LSP extensions, dirty listener, `lspChange`) lives in
  the view of ONE group that shows it (the *owner*, `owners` map) or, hidden, in the `states` Map — this preserves
  document, selection and **undo history**. `currentState(tabId)` reads the owner view first, then `states`.
- **Same tab in several groups** = every view after the first gets a **mirror state** (`createMirror`): same
  doc/selection and the same language/theme/config/git baseline/diagnostics/lightbulb, but `mirrorSetup` (no
  `history()`) and no edit listener. Views sync with the CodeMirror split-view pattern: each view is created with
  `dispatchTransactions`, which forwards every transaction with changes to ALL the other views of the tab
  (`twinsOf`) annotated with `syncAnnotation` (no echo: forwarded transactions are never forwarded again; `userEvent`
  and `addToHistory: false` are copied). Edits from any group therefore pass through the owner's listener exactly
  once: one `lspChange` stream, one dirty update, one autosave signal. Undo/redo (Mod-z / Mod-y) in a mirror run
  `undo(ownerView)` (`runOnCanonical`) and then copy the selection back. When the owner stops showing the tab while
  mirrors still do, the first mirror is **promoted** (`promote`: it takes the canonical state, keeping its own
  selection and scroll) and the others stay mirrors of it; when the tab is closed, every view drops it.
- Effects that must reach every copy go through `dispatchEffects(tabId, effects)` / `reconfigureAll` (language,
  baseline, diagnostics, theme/config compartments, lightbulb, indent): visible views (owner and mirrors) by `dispatch`,
  hidden states by `states.set(...update...)`. Never touch `states` or one view directly for those.
- The doc is always `\n`-normalized; the file's EOL/indent are detected (`lib/textFormat.ts`), kept on the `FileTab`
  and re-applied on save (`serializeDoc`). External changes replace only the differing range (`lib/textDiff.ts`).
- Switching tabs in a group = `showDocument`/`hideDocument` from `CodeEditor`'s effect (per group). Loading from disk
  is shared (`ensureLoaded`: two groups showing the same unloaded tab read it once).
- Closed tabs are pruned (`forgetDocument`) by `startTabReactions` in `tabActions.ts` through `onTabsClosed` of `store.ts` (a tab entity
  disappears only when no group shows it); each module prunes its own per-tab maps the same way.
- `subscribeEdits` = user edits (autosave); `subscribeDocChanges` = any text change of a tab, incl. disk reloads (the
  Markdown preview follows the buffer through it).
- `DiffEditor` is a separate component (keyed by tab id) using `MergeView` from `@codemirror/merge`, read-only. A
  `DiffTab` is a git diff (working tree / staged), a commit diff (`commit`), a Claude proposal (`proposal`) or a
  comparison of two arbitrary files (`compare: { left, right }`, `compareActions.ts`; a side reads the open tab's buffer
  through `currentState`, or the disk with `saved`, and refreshes on `subscribeDocChanges`/`fileRevs`). Only plain git
  diffs go to the session and follow renames (`isForeignDiff`);
  `MarkdownPreview` renders the source tab's buffer (`currentState`), sanitized by `lib/markdownPreview.ts`.

## Editor groups

- `tabs` is the list of tab ENTITIES (one per file/diff/preview); `editorGroups` (`lib/editorGroups.ts`, pure) hold
  `tabIds` + the active tab per group, in the grid's reading order, and `editorLayout` is the split tree
  (`shared/editorLayout.ts`: leaves `{ group }`, nodes `{ direction: 'row' | 'column', children, sizes }` with fractions
  summing to 1). Both are written only by `commitGroups` in `store.ts` (which also reconciles the tree with the groups);
  `activeTabId` mirrors the active group's active tab. A tab entity dies (dirty prompt, LSP close) only when no group
  shows it.
- Group operations are pure functions over `GroupsState` (`{ groups, activeGroupId, layout }`): `splitGroup(side)`,
  `focusGroupAt`, `focusGroupToward` (geometry via `neighborGroup`), `moveTabToAdjacentGroup`, `joinAllGroups`,
  `resizeGroups`, `closeGroup`, `dropEmptyGroups`. Functions that add or remove groups keep the tree in sync; anything
  else may spread the state and leave `layout` alone.
- `EditorArea` renders the groups as a FLAT keyed list absolutely positioned from `layoutRects`, plus one `Resizer` per
  boundary (`layoutSashes`): changing the tree never remounts a group, so its `EditorView` survives splits and joins.
- The session stores `editorGroups` + `editorLayout` (leaves = group indices, validated by `parseLayout` in main and
  in the renderer); sessions from before the grid (`editorSplitRatio`, 2 groups) become a row with that ratio.
- Only the owner state has the dirty/LSP/autosave listener and publishes `topLines`. Typing events
  (`input.type`/`input.complete`) are NOT forwarded to the twin: they would open completion there and cancel the real
  request. Undo/redo (keys and the native menu's `beforeinput`) run on the owner.
- When a group disappears with focus inside, `focusContext.ts` refocuses (no `focusout` fires).
- The Markdown preview (`kind: 'markdownPreview'`) uses its own DOMPurify instance (`lib/markdownPreview.ts`); local
  images only through `fs.readImage` (via `fileViewActions.ts`) (main: window folder, realpath + dev/ino, ≤ 10 MB).
- On macOS the Edit menu is explicit (the `editMenu` role's "Paste and Match Style" owns ⇧⌘V).

## Symbols, breadcrumbs, outline and sticky scroll

- The symbol tree of a tab (`LspDocumentSymbol[]`: `range` = whole declaration, `selectionRange` = name) comes from
  `components/editor/documentSymbols.ts`: the language server when one is ready for the file (`lsp.documentSymbols`,
  a tree), else `lib/syntaxSymbols.ts` (generic Lezer fallback: definition nodes by the names the `@lezer/*`
  grammars use, Markdown headings nested by level). Only tabs someone watches (`watchDocumentSymbols`, through the
  `useDocumentSymbols(tabId)` hook) are computed, 350 ms after a text change (`subscribeDocChanges`) or a syntax tree
  change, and at once when a server changes state (`refreshDocumentSymbols`). Unchanged trees keep their reference.
- `components/editor/viewEvents.ts` is the only way for React to follow a view's selection, text or syntax tree
  (`viewEvents` lives in `editorConfigExtension`, so owner and mirror states both have it). `useSymbolPathAtCursor(groupId,
  tabId, tree)` snapshots the index path of the symbols around the group's cursor (`lib/symbolTree.ts`
  `symbolIndexPathAt`), so moving inside one symbol re-renders nothing.
- Breadcrumbs (`editor/Breadcrumbs.tsx`, `breadcrumbs.enabled`) render inside `CodeEditor`, one per group: path
  segments from the workspace folder (`lib/breadcrumbs.ts`; menu = the folder listing from `dirs`/`loadDir`, folders
  navigate inside the same menu) then the symbol path (menu = sibling symbols). `editor.focusBreadcrumbs` (⌘⇧. /
  Ctrl+Shift+.) is a `breadcrumbsFocus` request for the active group: focuses the last segment and opens its menu;
  ←/→ move, Enter/Space/↓ open, Esc returns to the editor. Jumps go through `revealDocumentSymbol` (records navigation).
- Sticky scroll (`editor/stickyScroll.ts`, `editor.stickyScroll.enabled` + `maxLineCount`, in `editorConfigExtension`
  as `EditorViewConfig.stickyScroll` = max lines or 0): per-view `ViewPlugin`; scopes from the syntax tree
  (`foldNodeProp`) plus `foldable()` when the language folds by `foldService` (Markdown); the pure choice of lines is
  `lib/stickyScroll.ts`. It provides `EditorView.scrollMargins`, so the cursor is never scrolled under the strip.

## Rules

- Per-tab extensions go into `extensionsFor(tabId)`. Theme/visual extensions go into `setup.ts` (`editorTheme`).
- Anything reconfigurable at runtime (language, settings, LSP) uses a **`Compartment`** and
  `view.dispatch({ effects: compartment.reconfigure(…) })` — never recreate the state.
- **Adding an editor option**: declare the setting in `shared/settings.ts`, put its extension in a compartment
  in `setup.ts` (`editorConfigExtension`, `themeCompartment`), expose a setter in `documentConfig.ts`
  (`setEditorConfig` / `setEditorTheme`) that reconfigures the visible view **and** the stored states of hidden tabs
  (`reconfigureAll`), and call it from `appearance.ts`. New tabs get the current value from `extensionsFor` (`documentStore.ts`). Font
  size/family are CSS variables (`--editor-font-*`) plus `remeasureEditor()`, not compartments.
- Async work started for a tab (file load, language load) must check that the tab is still the one shown in that
  group (`shownTabId(groupId) === tabId`) before touching the view; `applyLanguage`/`setDocumentBaseline` already reach
  every copy, so prefer them over touching a view.
- Dirty = current doc differs from `savedDocs.get(tabId)` (`doc.eq`) — undoing back to the saved text makes the tab clean.
- Read the current text with `currentState(tabId)` (handles both visible and hidden tabs).
- Options that depend on the tab AND the settings (rulers: `editor.rulers` + EditorConfig `max_line_length`) live in
  the per-tab `tabOptions` compartment (`tabOptionsExtension(tabId)` in `documentState.ts`, per-tab values in
  `tabRulers`, setter `setDocumentRulers`); `createMirror` must build it too. Global view options (`renderWhitespace`)
  stay in `editorConfigExtension`. Rulers are a `layer` (`rulers.ts`), whitespace a viewport-only decoration plugin
  (`renderWhitespace.ts`); colors only via CSS tokens in `styles/editor.css`.
- `Indent` of tabs may carry its own `width` (EditorConfig `tab_width`); `indentExtension`/`formatOptions` use it
  before `editor.tabSize`.

## Save pipeline and EditorConfig

- Every save (`writeTab` in `saveActions.ts`) first runs `applySaveTransforms` (`saveTransformActions.ts`, pure part in
  `lib/saveTransforms.ts`): trim trailing whitespace, insert final newline, trim final newlines, from the settings with
  the tab's EditorConfig on top. It runs BEFORE `saveDocument` sets the baseline, so the watcher echo matches. Auto save
  passes `auto: true` (lines with a cursor are spared). "Format on save" hands its edits to `applySaveTransforms`
  (`formatTab`'s `apply`), which composes both `ChangeSet`s into ONE `applyTabEdits` call: one undo step. The transforms
  are idempotent, so the second pass inside `writeTab` is a no-op.
- EditorConfig (`editorConfigActions.ts`, parser/globs/resolution in `lib/editorConfig.ts`): `ensureLoaded` awaits
  `prepareTabEditorConfig` before reading the file (it may force `latin1` via `readEncodingFor`, sets the rulers), and
  every indent decision for a tab goes through `resolveTabIndent` (load, disk reload, after save), never a bare
  `resolveIndent`. EOL and charset apply at save (`saveFormatFor`); an EOL the user toggled in the status bar and a
  user-chosen encoding win. `.editorconfig` files are cached per folder and dropped when the watcher reports them.

## Positions

| System | Convention |
|---|---|
| CodeMirror offsets | 0-based, in UTF-16 code units |
| `doc.line(n)` | 1-based line numbers |
| `Reveal` in the store | `line` 1-based, `column` 0-based (chars), `length` in chars |
| ripgrep | UTF-8 bytes (converted in main) |
| LSP | 0-based line, UTF-16 `character` — write a tested converter, don't inline the math |

```typescript
// ✅ CORRECT — clamp before building a position
const line = doc.line(Math.min(Math.max(reveal.line, 1), doc.lines))
const from = Math.min(line.from + reveal.column, line.to)
```

## Debugger gutter

- `breakpointGutter(owner)` goes in BOTH `extensionsFor` (`true`) and `createMirror` (`false`): only the canonical
  state carries the `reporter` plugin that tells the store which breakpoint lines an edit moved (`debugHost().moved`, out
  of the update cycle); a mirror reporting too would apply the same move twice. Marks map through edits until the store
  answers with `setBreakpointMarks`.
- The field seeds itself from `debugHost()` in `create` (tab id from the `lspTabId` facet), so tabs loaded after a
  breakpoint change, and mirrors, are born with the current marks and stopped line; never seed them by hand.

## Languages

`lib/language.ts` → `loadLanguage(path)` (lazy, `@codemirror/language-data`) and `languageName(path)` for the status bar.

## Snippets and Emmet

- **One snippet engine** for LSP items, user snippets and Emmet: `lib/snippetSyntax.ts` parses the VS Code syntax
  (tabstops, placeholders, choices, mirrors, variables, `${VAR/regex/format/flags}`), `lib/snippetVariables.ts` gives the
  variable values from a context, and `components/editor/snippetExpand.ts` (`expandSnippet(view, body, from, to)`)
  resolves them for the tab and inserts with CodeMirror's `snippet()`. Never call `snippet()` directly with server or
  user text.
- CodeMirror fields have no choices nor nested placeholders: a choice becomes its first option and its field ranges are
  kept in `snippetChoices.ts` (`choiceField`), found by simulating `nextSnippetField` on the inserted state; selecting the
  field opens the completion with the options and the other sources (LSP, user snippets, Emmet) return `null` there
  (`choiceAt`). Tabstop transforms are plain mirrors; nested placeholders flatten into the outer one.
- User snippets come from main (`src/main/snippets/`: `<userData>/snippets/<languageId>.json`, `*.code-snippets` with
  `scope`, and the view folder's `.vscode/*.code-snippets`; parsed as untrusted JSONC, watched, pushed as
  `snippets:changed`) into the store (`snippets` slice, `snippetActions.ts`). Editor extensions read them through
  `snippetHost` (bound by `snippetActions.ts`, like `lspHost`); the tab's VS Code `languageId` is `lib/languageId.ts`.
- Snippet/Emmet extensions are per tab (`snippetExtensions(tabId)` in both the canonical and the mirror state).
  `editor.snippetSuggestions` is a boost (`top`/`bottom`) or `none` (no source).
- Emmet (`lib/emmet.ts` pure, `components/editor/emmet.ts` editor): the syntax comes from the `languageId`
  (+ `emmet.includeLanguages`), the context from the syntax tree (`regionAt`: markup text, JSX content, a CSS `Block`;
  never strings, comments, tags or attributes; JS code of a JSX file only where an element fits). The Tab binding is
  `Prec.high` and gives way to an open completion and to an active snippet field (whose keymap is `Prec.highest`).

## Don'ts

- Don't create an `EditorView` outside `mountView(groupId, …)` (one per editor group) and never put one `EditorState`
  in two views: a tab shown twice uses the mirror state. Don't give a mirror its own history or a `lspChange`/dirty
  listener — that would duplicate `didChange` and the undo stack.
- Don't dispatch effects or changes to a single view when the tab may be shown in several groups: use `dispatchEffects`,
  `applyTabEdits`, `replaceDocument` (they reach the twin).
- Don't use React state for document content — the source of truth is the `EditorState`.
- Don't wrap the app in `StrictMode` (double mount breaks the imperative view).

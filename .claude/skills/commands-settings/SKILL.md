---
name: commands-settings
description: Commands, keybindings, menus and settings: CommandId + defaultKeybindings, chords and when clauses evaluated in main, effective keybindings and menu accelerators, settings owned by main (layers, user-only keys, JSONC writes) and the Settings modal. Use when adding a command or shortcut, a menu item, a when context, or a setting.
---

# Commands, keybindings and settings

Every app action is a command (`shared/commands.ts` → menu in `main/menu.ts` → `registerCommand` in
`commands/builtin.ts`); settings and effective keybindings are owned by main.

## Chord shortcuts

- **Chord shortcuts** (`Ctrl+K S`, space-separated in `defaultKeys`) can't be menu accelerators: main handles them in
  `before-input-event` (`keybindings/chordShortcuts.ts` over `chords.ts`, installed per view by `index.ts` on the `viewCreated` workspace
  event); the menu only shows them as a label hint.
- The native menu is `menu/template.ts` (pure `buildTemplate(input)`, `menuCommandIds`, `MENU_RECENT_LIMIT`, unit
  tested) plus `menu.ts` (the Electron wiring that feeds it and rebuilds on settings/locale/recent changes).
- The same handler fires single-stroke bindings of commands **without a menu item** (user `keybindings.json`); a command
  missing on the platform/build (`isCommandAvailable`) must stay out of those tables or its key is swallowed (e.g.
  Ctrl+R in the terminal).

- Menu, chord and `workspace:openRequested` deliveries use `deliverCommand`/`deliverOpenRequest` (`workspaces` skill): a
  command fired while the view loads is queued, not dropped.

## `when` clauses

- **`when` clauses** (`keybindings/when.ts`) are evaluated in main against contexts the renderer reports via
  `window.setContext` (`focusContext.ts`, only on change; hiding a focused panel must move focus or the context gets
  stuck).
- A binding with `when` is never a menu accelerator (menus fire regardless of focus): it goes through
  `before-input-event` and the menu shows a label hint. A `roleItem` whose binding has a `when` becomes a plain item
  (`view.toggleFullScreen` on Win/Linux is `!inDebugMode`): a `role` without accelerator would grab the native key.
- Non-focus contexts (`inDebugMode`, reported by the debugger reactions) are in `CONTEXT_KEYS` but not in
  `FOCUS_CONTEXT_KEYS`; `focusContext.ts` reports only the focus ones (`FocusContexts` is keyed by `FocusContextKey`).

## Effective keybindings

- **Effective keybindings live in main** (default ← `keybindings.json`, `keybindings/effective.ts`); the menu is rebuilt
  on change and the renderer only displays `SettingsSnapshot.keybindings`; never read `defaultKeybindings` for labels.

### Binding lists and conflicts

- A command has a LIST of bindings (`string[]` in the snapshot; UI and menu show the first).
- Only the first binding of a menu command, without `when` and not a chord, is a menu accelerator (`isMenuAccelerator`);
  everything else goes through `before-input-event`.
- Two commands may share a key only with disjoint `when`s (`whenDisjoint`;
  `terminalFocus`/`editorFocus`/`claudeFocus`/`markdownPreviewFocus` are mutually exclusive; `FOCUS_CONTEXT_KEYS`),
  checked for the defaults by `commands.test.ts` (e.g. ⌘W: `workbench.closeTab` `!claudeFocus` vs `claude.closeSession`
  `claudeFocus`).
- A user entry steals a key only from non-disjoint bindings.
- On Win/Linux the Window menu is explicit (no `windowMenu` role: its native Ctrl+W `close` would fire whenever no ⌘W
  binding is active).
- Menu label hints are formatted with `shared/keybindingLabel.ts`.
- The unified palette (⌘K, `quickInput.unified`) only matches workspaces by name/branch, never by path.

## Settings

- **Settings are owned by main** (`ipc/settings.ts` only registers the channels; `settings/service.ts` implements them and
  `startSettings`/`stopSettings`; state/watchers/writes in `settings/state.ts`, `watchers.ts`, `writeSetting.ts`; other
  modules import `getEffectiveSettings`/`onSettingsChange` from `settings/state`, never from `ipc/settings`): the renderer applies `SettingsSnapshot`s and notifies their `errors`.
- **The view ↔ workspace-layer binding is main's** (`settings/binding.ts` `bindView`, fired by `onWindowRootChange`; it
  releases the previous folder's layer, reads the new one and re-announces the snapshot). `settings:setWorkspace` only
  validates the folder and returns the snapshot. Anything that derives state from the layer at start (the tree watcher,
  `workspace:open`) awaits `bindView(wc, root)` first.
- Settings files under `userData` aren't seen by the workspace watcher; open settings tabs are resynced on each
  snapshot.
- Every setting declares `scope: 'user' | 'any'` in its rule (`SETTING_RULES` in `shared/settings.ts`; required, the
  compiler fails without it). `USER_ONLY_SETTINGS` is derived from the `user` rules, never edited by hand. Keys that
  execute things or set app-wide policy (`terminal.shell`, executables, `claude.env`, `lsp.servers`, `debug.adapters`) are `user`: a cloned
  repo's `.walph/settings.json` must never choose an executable. `settings.scope.test.ts` fails if a rule validated by
  `isValidShellSetting`/`isValidEnvMap` is not `user`.
- There are no per-language overrides (`"[markdown]": {…}`): the only per-file layer is EditorConfig, applied in the
  renderer on top of the effective settings (`editorConfigActions.ts`; `renderer-editor` skill).
- Model settings (`claude.model`, `claude.fallbackModel`) validate with `isModelId` (`shared/claudeModel.ts`), the same
  guard as `claude:setModel` and `start` options.

### Settings modal

- The Settings modal (`components/settings/`, ⌘, = `workbench.openSettings`; the JSON file is
  `workbench.openSettingsJson`) never writes files nor keeps optimistic state: it calls `setValue`/`resetValue(layer,
  key)` and redraws from the snapshot (`layers.user`/`layers.workspace` = raw valid values per layer).
- Every new setting needs an entry in `shared/settingsUi.ts` (`Record<SettingKey, SettingMeta>`; `json-only` if no
  control).
- `removeSettingFromText` cuts the property manually (jsonc-parser's `modify(…, undefined)` eats the previous line's
  trailing comment) and removes every duplicate.
- `Modal` makes `#root` inert; toasts move to a body portal above it (their clock lives in a `WeakMap` per toast, so the
  remount keeps the deadline).
- With the modal open, `executeCommand` closes it first (⌘W only closes it; global commands like zoom/quit/reload keep
  it). This is table-driven: `registerOverlayPolicy({ priority, active(state), keeps?(id), close(id), consumes(id) })`
  in `commands/registry.ts`. The registry imports no action module; each owner registers its policy in its
  `start…Reactions` (settings: `startSettingsReactions`; `addWorkspace`/`mcp`/`usage`: `startOverlayReactions`; the
  Containers screen: `startDockerReactions`), never at module load; `overlayPolicies.test.ts` exercises the real ones. `executeCommand` skips the table for `GLOBAL_COMMANDS`, then walks the policies by ascending
  `priority`: an active policy that doesn't `keeps` the command runs `close`, and stops the command when `consumes` is
  true (else the next active policy still acts). A new overlay or takeover screen registers a policy; never add a
  `leaveX` branch to the registry.

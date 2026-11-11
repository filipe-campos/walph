---
name: app-testing
description: How to launch the real Walph app in dev mode and drive its UI (click, type, fire menu commands, read the DOM, take screenshots, read logs) through the Chrome DevTools Protocol, using the scripts bundled in this skill. Use to verify a feature in the running app, reproduce a visual bug, or validate acceptance criteria.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/*) Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

# Running and Driving Walph

Scripts live in `${CLAUDE_SKILL_DIR}/scripts/` (macOS and Linux). Temporary files go to `$WALPH_TEST_DIR`
(default `${TMPDIR:-/tmp}/walph-test`): `dev.log`, fixtures, screenshots.

```bash
S=${CLAUDE_SKILL_DIR}/scripts
FIX=$($S/make-fixture.sh)            # git repo with pending changes
$S/launch.sh "$FIX"                  # start the app (dev) and open the folder
node $S/cdp.mjs eval "document.title"
$S/stop.sh                           # ALWAYS at the end
```

## Quick Index

| Script | Purpose |
|---|---|
| `make-fixture.sh [dir]` | Repo with `src/index.ts`, `src/utils/math.ts` (modified), `README.md`, `notas.txt` (untracked) |
| `launch.sh [dir]` | Kills the previous instance, runs `electron-vite dev -- [dir]` without `ELECTRON_RUN_AS_NODE`, CDP on port 9333, main inspector on 9334. Set `WALPH_USER_DATA_DIR=<dir>` for an isolated `--user-data-dir` (settings, keybindings, localStorage) |
| `cdp.mjs eval\|wait\|open\|add\|type\|key\|shot\|logs\|pages` | Renderer: evaluate JS, wait for a condition, open a folder in the target workspace, add a folder as a new workspace tab, type, keys, screenshot, console errors, list views |
| `main.mjs command <id>` | Fires a registry command id (`editor.save`, `workbench.closeTab`, `workbench.openFolder`, `workbench.showCommandPalette`, `workbench.quickOpen`, `editor.goToLine`, `view.explorer`, `view.search`, `view.git`, `view.toggleSidebar`, `terminal.toggle`, `terminal.new`, `workspace.add`, `workspace.select1…9`, `workspace.next`, `workspace.close`…; full list: `CommandId` in `src/shared/commands.ts`) |
| `main.mjs views` | Lists the workspace views of every window: index, window id, active/inactive, title, url |
| `WALPH_PAGE=<sel>` (env, both scripts) | **Picks the target workspace view** (one `WebContentsView` per workspace, several per window). Unset = the ACTIVE (visible) view — of the focused window for `main.mjs`, of the first window that has one for `cdp.mjs`. `ws:<n>` = n-th tab of the WorkspaceBar (1-based, like ⌘n), `ws:<name>` = tab by folder name, a number = index (`cdp.mjs pages` for cdp, `main.mjs views` for main — the two lists are ordered differently), `=text` = exact title, anything else = title substring (titles are `<folder> — Walph`). A dormant workspace has no view: select it with `main.mjs command workspace.select<n>` first. |
| `main.mjs eval "<expr>"` | Evaluates in the main process (`electron` already in scope) |
| `stop.sh` | Stops the app |

## Recipes

**Click an explorer item / open a file**
```bash
node $S/cdp.mjs eval "[...document.querySelectorAll('.tree .tree-row')].find(r => r.querySelector('.tree-label')?.textContent === 'src').click()"
node $S/cdp.mjs wait "[...document.querySelectorAll('.tree-label')].some(l => l.textContent === 'math.ts')"
```

**Edit and save:** open the file (focus goes to CodeMirror) → `cdp.mjs type "text"` → `main.mjs command editor.save` →
check the file on disk with `cat`.

**Fill a React-controlled input** (`type` needs focus; to set it directly):
```js
const el = document.querySelector('.commit-box textarea')
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'message')
el.dispatchEvent(new Event('input', { bubbles: true }))
```

**Terminal:** `main.mjs command terminal.toggle` → wait for the prompt → `type "command"` → `key Enter`. Read output:
`eval "[...document.querySelectorAll('.xterm-rows > div')].map(d => d.textContent.trimEnd()).filter(Boolean)"`.

**Screenshot:** `cdp.mjs shot $WALPH_TEST_DIR/s1.png`, then open it with the Read tool to see it.

## Gotchas (all of them happened)

- **Menu shortcuts (⌘S, ⌘W, Ctrl+`…) don't fire with synthetic CDP keys**, and macOS blocks `osascript` keystrokes
  without accessibility permission. Use `main.mjs command <id>`.
- **WebGL hides the terminal text from the DOM**: `.xterm-rows` is empty with the default
  `terminal.gpuAcceleration: "auto"`. Write `{"terminal.gpuAcceleration": "off"}` to the isolated `settings.json` before
  reading the buffer from the DOM (or use screenshots / the find widget count).
- **`type` doesn't send Enter to xterm** (`\n` from `insertText` is ignored). Use `key Enter`.
- **Text typed before the shell prompt** shows up twice. Wait for the prompt.
- **Claude panel without network:** export `WALPH_FAKE_CLAUDE=<script.json>` before `launch.sh` (format at the top of
  `src/main/claude/fake/script.ts`); never drive the real Claude. Hidden windows report `document.hasFocus()` per the
  page emulation — override it and dispatch `focus`/`blur` to simulate the OS focus.
- **Several workspaces per window:** the host window is a `BaseWindow` with NO webContents; each workspace is
  a `WebContentsView` running the whole renderer, so `BrowserWindow.getAllWindows()` is empty and `eval` in main must use
  `electron.BaseWindow` / `electron.webContents`. Only the active view is visible, the others keep running (CDP and
  `main.mjs` reach them via `WALPH_PAGE`). Restored workspaces are *dormant* (tab only) until activated. Add tabs with
  `node $S/cdp.mjs add <dir>` (the new one becomes active, and the default target moves with it), switch with
  `main.mjs command workspace.select2`, list with `cdp.mjs pages` / `main.mjs views`. The default
  `cdp.mjs` target is the active workspace view; `main.mjs command` with a window index/title
  means a view (a title is the view's, i.e. the folder name).
- **Windows are hidden by default** (`WALPH_HIDDEN_WINDOWS=1`, set by `launch.sh`; no Dock icon, never steals focus).
  CDP, screenshots and `main.mjs` work the same. Consequences: `BaseWindow.isFocused()`/`getFocusedWindow()` are
  always false/null — to check "focuses the other window", spy on `BaseWindow.prototype.focus` via `main.mjs eval`;
  native dialogs (`dialog.showMessageBox`) still pop up on screen — stub them via `main.mjs eval`. Run
  `WALPH_HIDDEN_WINDOWS=0 launch.sh …` only when a real on-screen check is needed (then the user may click on it).
- Changes in `src/renderer` arrive via HMR; changes in `src/main`/`src/preload` restart the app (the last folder is
  reopened — wait for `.tree-row` again).
- `launch.sh <dir>` opens the folder through argv (`electron-vite dev -- <dir>` → `workspace:initial`, delivered only
  once per main process). `cdp.mjs open` replaces the folder of the target workspace through main (`main.mjs open <dir>` →
  `workspace:openRequested`, the Abrir Recente path; a dirty buffer makes the renderer ask first); `cdp.mjs add` opens it
  as a new workspace tab instead. If a change alters how the app opens folders, **update these scripts**.
- Command ids are the registry ids (`CommandId` in `src/shared/commands.ts`); the old names (`save`, `showExplorer`…) no longer exist.
- **userData:** unpackaged runs without `--user-data-dir` use `<appData>/Walph-dev` (the installed app keeps
  `Walph`). The app is single-instance per userData: a second launch with the same dir forwards its argv (folder) to the
  running one and exits — so `launch.sh` kills the previous instance first, and parallel instances need distinct dirs.
- **Settings:** write `<userData>/settings.json`, `<userData>/keybindings.json` or `<repo>/.walph/settings.json`
  directly (JSONC) — main watches them and pushes the change within ~100 ms, no reload needed. Launch with an isolated
  `--user-data-dir` so the user's real settings/theme don't leak into the test. Commands: `workbench.openSettings` (the
  Settings modal, `[data-testid="settings-modal"]`, rows `[data-setting-key]`, controls `[data-testid="setting-<key>"]`,
  scope `[data-scope]`, sections `[data-section]`), `workbench.openSettingsJson` (the user JSON file),
  `workbench.openWorkspaceSettings`, `workbench.openKeybindings`, `workbench.selectTheme`. The active theme is also
  cached in `localStorage` (`walph.theme`) for the first paint.
- Native dialogs (`dialog.showMessageBox`, open folder) can't be automated through CDP. Test the logic behind them or
  mark the item as manual verification.

## Unit tests that run real git or compare real paths (Windows-safe)

- **`src/main/testing/testEnv.ts`** is the one helper for tests (never imported by product code): `isolatedGitConfigEnv()`
  (`GIT_CONFIG_NOSYSTEM`, `GIT_TERMINAL_PROMPT` and `GIT_CONFIG_GLOBAL` pointing to an empty file) and
  `makeRealTempDir(prefix)` (`mkdtemp` + `realpathSync.native`). Never use `os.devNull` / `/dev/null` as `GIT_CONFIG_GLOBAL`:
  on Windows it is `\\.\nul` and git fails with `unable to access`. Never use the JS `realpathSync` for a temp dir: it
  keeps the 8.3 name (`RUNNER~1`) while `fs/promises` `realpath` (used by product code) returns the long one.
- Pure functions that depend on the OS take `platform` explicitly (`parseFileUrlList(text, platform)`,
  `pathKey(path, platform)`) and the tests cover `'win32'` inputs on every host. `node:path` parity tests pin the cwd
  (`vi.spyOn(process, 'cwd')`) and compare with `posix.resolve(cwd, input)` / `win32.resolve(cwd, input)`, because the
  bare `posix.resolve` uses the host cwd (Windows: `D:\x` → `/x`).

## Test typecheck projects

`tsconfig.node.json`/`tsconfig.web.json` exclude test files and the testing helper dirs, and enable `exactOptionalPropertyTypes`
and `noUncheckedIndexedAccess`. `tsconfig.node.test.json`/`tsconfig.web.test.json` include everything and keep only
`exactOptionalPropertyTypes` (tests index fixtures freely; no `!` churn). In a test, an explicit `undefined` on an optional
prop that the code treats as a real value needs `| undefined` on the fixture type, not a cast. `pnpm typecheck` runs all
five projects. The `no-unnecessary-condition`/`prefer-nullish-coalescing` lint rules do not apply to tests.

## Shared unit test helpers (use them; never hand-roll a copy)

- **Renderer `window.api`**: `src/renderer/src/test/fakeApi.ts` `installFakeApi(overrides)` installs a typed fake
  (every method a `vi.fn`, idle defaults, overrides as `DeepPartial<WalphApi>`) and returns `{ api, emit, reset }`;
  `emit.<ns>.on<Event>(...)` fires a subscribed channel. A new `WalphApi` namespace fails typecheck until it is listed
  there. `src/renderer/src/test/resetStore.ts` `resetStore()` restores the initial store state; import the store
  dynamically after `installFakeApi` (the store reads `window.api` at load). Never stub `window.api` with a `Proxy`
  or an `unknown` cast in a test. The default `platform` is `'linux'` (case-sensitive paths); pass `'darwin'` only
  when the test needs it. `emit` with no subscriber throws, and sync methods return neutral values, not promises.
  Type local spies with the real signature (`vi.fn<GitApi['branches']>()`) and build complete fixtures
  (`src/renderer/src/test/gitFixtures.ts`) instead of `as never`.
- **Renderer setup**: `src/renderer/src/test/setup.ts` (stubs `ResizeObserver`, sets `IS_REACT_ACT_ENVIRONMENT`) runs
  for every renderer test, in the `vmThreads` pool. `restoreMocks`, `unstubGlobals` and `unstubEnvs` are global in
  `vitest.config.mts`: no manual restore in `afterEach`, and no test may rely on state leaking from another.
- **Renderer fixtures and waits** (`src/renderer/src/test/`): `tabFixtures.ts` `fileTab(patch)` builds a complete clean
  `FileTab`; `toastTitles()` (`toastTitles.ts`) lists the visible toast titles; `deferred<T>()` (`deferred.ts`) is a
  promise the test resolves or rejects to order async answers (stale-response guards). Action-module tests drive the real
  store, `documentStore` and `lspSync` (`loadDocument`, `applyTabEdits`) instead of mocking the editor; module-level
  state of the action (read failures, format-dirty) is cleared by closing the tabs with the module's `start…Reactions`
  running. `vi.resetModules()` does not clear `vi.mock` factories: a test that reloads the module under test imports
  `@shared/i18n` again to change its locale.
- **CodeMirror extensions and hooks** (`src/renderer/src/test/`): `editorHarness.ts` `mountEditor({ doc, extensions,
  tabId, path, host, selection })` mounts a real `EditorView` with `lspTabId` set, the tab opened in `lspSync` (`path:
  null` = a tab with no LSP path, never opened in `lspSync`) and an `LspHost` of spies (`serverFor` ready by default);
  `unmountEditors()` in `afterEach` also restores what the harness patched. Each mounted editor needs its own `tabId`.
  It stubs the jsdom gaps CodeMirror hits (text measure, `scrollIntoView`); a test of canvas code also stubs
  `matchMedia` (with `vi.stubGlobal`) and
  `getContext`. LSP calls go through `installFakeApi({ lsp: { completion, ... } })`; timer-driven extensions use
  `vi.useFakeTimers()` with `await vi.advanceTimersByTimeAsync(ms)`. `renderHook.tsx` `renderHook(hook, props)` runs a
  hook with `current`/`rerender` (no `@testing-library`); hooks that need rendered elements (refs, DOM events, scroll
  containers) mount a small component with `mount` from `dom.ts`, render the elements the hook attaches to and read the
  result from the DOM or from a `useEffect` callback.
- **Main IPC handlers**: `src/main/testing/fakeIpc.ts` `createIpcHarness()` gives `electronMock` (spread into
  `vi.mock('electron', ...)`), `invoke(channel, sender, ...args)`, `emit(channel, sender, ...args)` and `registered()`;
  create it with `await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())`.
  `fakeWebContents()` is an `EventEmitter` with spied `on`/`once`/`emit` and `send`/`isDestroyed` mocks, enough to
  drive `onViewReset`.
- **Channel registry**: `IPC_CHANNELS` in `src/shared/ipc.ts` is derived from `ipcSpec` (nothing to maintain by hand);
  `src/main/ipc/registry.test.ts` checks every `register*Handlers` registers exactly that set. A new channel only needs
  its spec entry; a new `register*Handlers` goes into that test. `src/preload/buildApi.test.ts` drives the bridge with a
  fake `ipcRenderer`.
- **Git repos**: `src/main/testing/gitRepo.ts` `makeTempRepo(files, { commit, message })` (branch `main`, real temp
  path, caller removes it), `git(cwd, ...args)` (isolated config, `GIT_TERMINAL_PROMPT=0`, test identity, mirrors
  `e2e/helpers.ts`) and `useGitTestEnv()` for product code that runs git itself (returns the restore function).
- **Async ordering (main)**: `src/main/testing/deferred.ts` `deferred<T = void>()` is a promise the test resolves or
  rejects (the main-side twin of the renderer one). Slow git children (clone cancel tests) need a hook set in a file
  pointed to by `GIT_CONFIG_GLOBAL`: `GIT_CONFIG_COUNT` is ignored for `uploadpack.packObjectsHook`, and the hook must
  be a script file, not an inline `sleep 30 #`.
- **Claude conversations**: `src/main/claude/testing/fakeQuery.ts` (`FakeQuery`, `setup`, `useTempRoot`, `of`,
  `canUse`, `toolOpts`, `lastRequest`, `promptInput`, `flush`) is the harness of the `conversation.*.test.ts` files; its `FakeQuery` is also the query double of the
  `McpController` and `PermissionBroker` tests (`mcpList` holds the server rows). A new conversation test goes into the
  file of its behavior group.

## Coverage thresholds

- `pnpm test:coverage` (run by the CI `check` job) fails below the `coverage.thresholds` of `vitest.config.mts`: a
  global floor plus per-glob floors (`src/main/**`, `src/main/claude/**`, `src/main/lsp/**`, `src/shared/*.ts`,
  `src/renderer/**`, `src/renderer/src/lib/**`). They are the measured values rounded down minus 1 point (CI measures
  on Linux, which skips the darwin-only tests) and only go up: new code comes with its tests, and when coverage rises,
  raise the floors in the same change.

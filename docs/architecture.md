# Architecture

Walph is an Electron app with three processes and one shared contract:

- **main** (Node.js): owns every window, workspace, file, external process and setting.
- **preload**: exposes a typed `window.api` through `contextBridge`. It only forwards calls, with zero logic.
- **renderer** (React 19): the UI. It never touches Node directly; everything goes through `window.api`.

Stack: Electron 45, electron-vite 6, React 19, TypeScript 7, zustand, CodeMirror 6, xterm.js, node-pty,
`@parcel/watcher`, `@vscode/ripgrep`, `typescript-language-server`, the Claude Agent SDK and `electron-updater`.

## Source tree

```
src/
  shared/              Contract between main and renderer (no runtime dependencies on Electron)
    types/             One file per domain (fs, git, lsp, claude, docker, ...) with its types and <Domain>Api;
                       index.ts composes WalphApi
    ipcSpec.ts         Runtime IPC spec: per method of WalphApi its kind (invoke / send / event) and channel
    ipc.ts             Typed channel maps (channel → args → result) and IPC_CHANNELS, derived from ipcSpec + <Domain>Api
    commands.ts        CommandId, default keybindings and `when` clauses, per-platform availability
    settings.ts        Settings schema, defaults, user-only keys and mergeSettings (default ← user ← workspace)
    pathCompare.ts     The single path comparison used across the repo
  main/
    index.ts           App lifecycle, single instance lock, startup
    menu.ts            Native menu; items send `app:command` to the active view
    window/            BaseWindow per window, one WebContentsView per workspace, windows.json persistence,
                       close/quit guard, dormant and hibernated views
    ipc/<domain>.ts    One file per domain registering its handlers, wiring only (channels, validation, delegation):
                       fs, workspace, workspaces, session, recent, search, files, git, terminal, settings, lsp,
                       debug, claude, docker, update, cli, window, dialog, tabs…
    <domain>/          Pure, unit tested logic for each domain: git/ parsers, search/ ripgrep parsing and replace,
                       lsp/ server manager and normalization, debug/ DAP client, sessions and launch.json,
                       claude/ conversations, permissions and the IDE MCP
                       server, docker/ parsers and validation, settings/ JSONC parsing and editing, keybindings/
                       effective bindings, chords and `when` evaluation, fs/ atomic writes, encodings and path guards,
                       terminal/, session/, recent/, cli/, update/, env/ (login shell PATH), process/ (process groups)
  preload/             index.ts exposes window.api via contextBridge; buildApi.ts generates it from shared/ipcSpec.ts
  renderer/src/
    store.ts           Single zustand store (state only); State = intersection of the per-domain interfaces in types/,
                       initial values in state/ (global part + per-folder part reset by workspaceScopedState)
    *Actions.ts        Actions as exported functions beside the store (tabActions, gitActions, the claude*.ts modules,
                       dockerActions, searchActions, workspaceLifecycle, ...); bootstrap.ts starts the store reactions and IPC listeners
    commands/          Command registry (registerCommand / executeCommand) and the built-in commands
    components/        editor/ (CodeMirror 6, diff, Markdown preview, image viewer, LSP extensions), sidebar/
                       (explorer, search, git), quickInput/ (Quick Open, palettes), claude/ (Claude panel),
                       containers/, settings/, bottom panel with Problems, Output, References and the terminal
    lib/               Pure utilities (fuzzy matching, paths, terminal bus, LSP formatting, ...) with tests
    themes/            Built-in themes (CSS tokens + CodeMirror + xterm): Walph Dark and Walph Light
    styles.css, styles/  CSS split by area; design tokens in styles/tokens.css
e2e/                   Playwright specs that launch the built app with a temp repo and an isolated user data dir
scripts/               Build helpers (doc path checker, dmg icon, Electron name patch)
build/                 Icons and macOS entitlements used by electron-builder
```

## How a capability is added

Every capability starts in the shared contract and flows through the same five steps:

1. **Contract:** types and the `<Domain>Api` interface in `src/shared/types/<domain>.ts`.
2. **Spec entry:** the method's kind and channel (`invoke` / `send` / `event`, named `domain:action`) in
   `src/shared/ipcSpec.ts`. The typed channel maps in `src/shared/ipc.ts` and the preload bridge are derived from it.
3. **Handler:** `src/main/ipc/<domain>.ts`, registered with the typed `handle` / `on` helpers from
   `ipc/typed.ts` (main to renderer events go through `send` in `window/send.ts`). Handlers receive `unknown` and validate their input at the boundary.
4. **Usage:** a store action in the renderer calls `window.api.<domain>.<method>`.

The compiler checks channel names, arity and return types end to end.

## Commands and keybindings

Each user action is a `CommandId` in `shared/commands.ts` with its default keys and optional `when` clause. The main
process computes the effective keybindings (defaults merged with the user's `keybindings.json`) and uses them for
native menu accelerators; chords and context-dependent keys are handled in `before-input-event` using the focus
context reported by the renderer. Menu items, palettes and shortcuts all end up calling `executeCommand(id)` in the
renderer, so there are no ad hoc keydown handlers for app shortcuts.

## Ownership per workspace view

Each workspace in a window is its own `WebContentsView`. Everything a workspace starts is keyed by that view's
`webContents` and dies with it: the file watcher, terminals (node-pty), language servers, Claude conversations, Docker
processes, workspace settings and the session file. Inactive workspaces can hibernate back to a dormant state to free
memory, unless something would be lost (unsaved files, a running Claude turn, and so on).

## Main process highlights

- **Files:** every user or state file is written atomically (`fs/atomicWrite.ts`). Explorer mutations are restricted
  to the workspace folder, and deletes go to the trash.
- **Watcher:** one `@parcel/watcher` subscription per workspace, with batched and classified events that invalidate
  the Quick Open file list and keep editor tabs in sync with the disk.
- **Git:** the git CLI through `execFile` with argument arrays, `--` before user input and `GIT_TERMINAL_PROMPT=0` so
  it never hangs on credentials.
- **Search:** ripgrep (`@vscode/ripgrep`) with JSON output parsed in `search/`, plus a shared replace engine.
- **LSP:** a manager per view spawns servers, mirrors open documents, enforces request deadlines and normalizes server
  output (treated as untrusted). The TypeScript server is bundled.
- **Debugger:** a Debug Adapter Protocol client per view (`debug/`): adapters from `debug.adapters` (Python's debugpy
  built in) run in process groups over stdio or local TCP, requests have deadlines, adapter output is normalized, and
  `runInTerminal` opens a Walph terminal through a one-shot ticket. Configurations come from `.vscode/launch.json`.
- **Claude:** conversations run through the Claude Agent SDK, which spawns the Claude Code binary shipped with it (or
  `claude.executable`). An in-process MCP server named `walph` exposes IDE tools (diagnostics, selection, open editors,
  `openDiff`). Permission requests, questions and edit proposals become cards in the panel.
- **Docker:** the docker CLI runs in process groups owned by the view; ids and compose arguments are validated, and
  secrets are masked before container output is sent to Claude.
- **Updates and packaging:** electron-builder produces dmg/zip (macOS), NSIS (Windows) and AppImage/deb (Linux);
  `electron-updater` updates installed builds from GitHub Releases. Native binaries (node-pty, the watcher, ripgrep,
  the language server and the Claude binary) are unpacked from the asar.

## Renderer highlights

- **State:** one zustand store with narrow selectors; actions live in modules beside it and are never re-exported from
  `store.ts`, which avoids import cycles.
- **Editor:** one CodeMirror `EditorView` per editor group (up to eight, in a grid of splits) and one canonical
  `EditorState` per tab, so the same tab in several groups shares a single document and undo history.
- **Terminal:** xterm.js instances receive output only through `lib/terminalBus.ts`, which buffers data until the
  terminal is mounted.
- **Styling:** CSS tokens only, codicons and bundled Geist and JetBrains Mono fonts.

## Security baseline

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on every view.
- No `shell: true` and no command strings for external processes; names coming from the UI are validated.
- Settings that run programs (shell, terminal profiles, language servers, Claude executable and env, Docker path) are
  user-only: a repository's `.walph/settings.json` cannot set them.
- External links open in the system browser, no remote content loads in the window, and a CSP is set in `index.html`.

## Testing

- **Unit:** Vitest with two projects: `node` for main, preload and shared, and `renderer` on jsdom.
- **End to end:** Playwright launches the built app (`out/main/index.js`) with a temporary repository and an isolated
  `--user-data-dir`, with hidden windows. Claude and Docker are replaced by fakes in these runs.
- **CI:** `ci.yml` runs typecheck, lint, knip, docs:check, unit tests with coverage and the E2E suite on Linux (Xvfb), plus unit tests on
  macOS and Windows. `release.yml` builds and publishes installers for all three platforms when a `v<version>` tag is
  pushed.

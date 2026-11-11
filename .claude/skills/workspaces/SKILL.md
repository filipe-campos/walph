---
name: workspaces
description: Window and workspace patterns: BaseWindow + one WebContentsView per workspace (src/main/window), the folder owned by main per view, sessions and windows.json, the close/quit guard, dormant and hibernated views, viewActive gating and the welcome screen (recent folders, open many, open with prompt). Use when creating or reviewing code in src/main/window, ipc/workspaces.ts, ipc/window.ts, ipc/session.ts, workspaceLifecycle.ts or anything owned per view.
---

# Windows and workspaces (`src/main/window`)

The VIEW webContents is the unit of ownership: every per-view resource (watcher, ptys, LSP, Claude, docker, settings,
session) dies with it. Disposable resources (processes, ptys, managers, conversations) live in a
`createViewRegistry` from `window/viewResources.ts` (owner-checked `get`, automatic reset, `has(wc)` for eviction guards,
`guardEpoch` after an `await`); see `main-processes`.

## The folder lives in main

- **Each window's (= each workspace view's) folder lives in main** (`window/windows.ts`): assigned at creation
  (argv, `windows.json` restore, Abrir Recente) or by `workspace.open`; `workspace.current()` returns it on every call
  (a reload keeps the folder).
- The same folder is never in two windows (`samePath` from `shared/pathCompare.ts`; the single path comparison of the
  repo, string-only (no `node:path`): `pathKey`/`samePath`/`isInside(root, path, { strict, caseSensitive, nfc… })`,
  case-insensitive on macOS/Windows and NFC on macOS by default; the renderer's `lib/path.ts` wraps it with a required
  platform, and its `isInside` is exact in case/Unicode because callers slice by `root.length`); opening it focuses the
  owner.
- Watchers, terminals and `files:list` are scoped to the sender `webContents`; ptys die on reload/close of their window.
- The renderer serializes `workspace.open` calls (`openChain`) so main and renderer agree on the folder.

## Sessions

- **Sessions** (`<userData>/sessions/<sha256>.json`) are written by main (atomic; async normally, sync on destroy/quit);
  the renderer sends the last one from `beforeunload`.
- **Pruning**: the file name is a hash, so the folder cannot be recovered from it. `session/pruneRun.ts` `schedulePruneSessions()` runs
  `pruneSessions()` ~30 s after startup (unref'd timer, so `walph <dir>` and second-instance forwards are bound first;
  errors logged, never fatal). It lists the directory and deletes, through the pure `session/prune.ts`
  `planSessionPrune(files, recent, windows, live, now)`, the `<sha256>.json` files older than 90 days
  (`SESSION_MAX_AGE_MS`) whose `sessionFileName(root)` is not produced by any `recent.json` folder, saved `windows.json`
  workspace or live workspace (`allHosts()` workspaces, dormant ones included). Each file is `stat`ed again right before
  the `rm` and skipped if a `session:save` made it young meanwhile. Other names in the directory are never touched. These are app state files,
  not user files, so a plain `rm` is used (the trash rule is for user content).
- Scroll is stored as `topLine`, never px (CodeMirror estimates unmeasured heights).
- "Reopen Closed Tab" (`closedTabs` in the store, pure stack in `lib/closedTabs.ts`, action `closedTabActions.ts`) is
  part of the session (`closedTabs`, at most 20, group as an index into `editorGroups`). Only user closes push to it
  (`closeTabs`, `closeEditorGroup` via `rememberClosed`, read before the commit so cursor/scroll are still live); tabs
  the session never keeps (commit diffs, Claude proposals) are skipped. A session tab is rebuilt with `tabFromSession`
  (`tabActions.ts`), shared with the session restore.
- `windows.json` keeps the last window when it closes alone; it is frozen during a quit.

## Closing and quitting

- **Closing/quitting is guarded in main**: `window/closeCoordinator.ts` is the pure state machine
  (`createCloseCoordinator(deps)`), `window/closeController.ts` its Electron-bound instance (`requestCloseWorkspace`,
  `onQuitCancelled`, `isViewResponsive`, `setDirty`, `confirmClose`, `cancelClose`, `installCloseCoordinator`) and
  `window/closeGuard.ts` the per-view guard; `ipc/window.ts` only wires channels. While the renderer reports
  `window.setDirty(true)`, `close` is prevented and becomes `window:closeRequested`; the renderer answers
  `confirmClose()` or `cancelClose()`.
- A quit is vetoed in `before-quit` (before any window closes), asking one dirty window at a time; cancelling reverts
  the windows already confirmed in that chain (`window:closeAborted`).
- Process cleanup lives in `will-quit` (not `before-quit`, which fires even when the quit is then cancelled).
- Main frame navigation is blocked (`will-navigate`), except same-URL reloads in dev.

## Workspaces

- The host window is a `BaseWindow` (no own webContents) and each workspace is a `WebContentsView` running the whole
  renderer (`window/windows.ts` is the entry point; state in `windowState.ts`, ready queues in `viewDelivery.ts`,
  close/hibernate in `viewClose.ts`, `windowsPersistence.ts`, `openFolder.ts`, `restoreWindows.ts`; plus
  `window/workspaceViews.ts`, `ipc/workspaces.ts` wiring, `window/openMany.ts` for "open many").
- The VIEW webContents is today's "window": every per-`webContents` owner (watcher, ptys, LSP, Claude, settings,
  session, `setDirty`, `when` contexts, chords) is per view.
- Anything sent to a view that may still be loading (`app:command`, `workspace:openRequested`) goes through
  `deliverCommand` / `deliverOpenRequest` (`window/viewDelivery.ts`): sent when the renderer is ready
  (`workspace:current`), otherwise queued and flushed then. Never `send(wc, 'app:command', …)` directly.
- Never use `BrowserWindow.fromWebContents`/`getAllWindows`; use `windowOf(wc)` (dialog parents, menus).
- Menu `app:command` goes to the active view of the focused window; when that view is crashed/unresponsive,
  `workspace.*` commands run in main (`window/workspaceCommands.ts`: `runWorkspaceCommandInMain`,
  `runWorkspaceCommandWhenUnresponsive`).
- Automatic reloads of a crashed renderer are capped by `window/reloadPolicy.ts` (`createReloadLimiter`: 3 per 30 s per
  view, then it stays dead). Chord shortcuts are installed per view by `index.ts` on the `viewCreated` workspace event
  (`installChordShortcuts(wc)`); `windows.ts` knows nothing about menus or keybindings.
- Restored workspaces are dormant (no view) until activated.
- View webContents aren't destroyed with the window: they're closed with `close({ waitForBeforeUnload: true })` (the
  renderer's final `session:save`) and force-closed after 3 s.
- The close guard is per view with target `workspace | window | quit` (chains ask one dirty view at a time, activating
  it silently; silent activation doesn't `markAllRead`).
- Activating a workspace marks all its Claude sessions read; main ignores `claude:markRead` from inactive views and
  sends `notifications:show` (key `ws:<id>:<session>`) to the active view for sessions of inactive workspaces.
- `windows.json` v2 = per window `{ workspaces: [{root, branch}], active }` (v1 migrated).
- The `WorkspaceBar` is the title bar on macOS (`titleBarStyle: 'hidden'`, `--titlebar-inset`); Windows/Linux keep the
  native frame.
- A folder is unique across all workspaces of all windows (dormant included).

## Many workspaces (performance pass)

- A hidden `WebContentsView` still reports `visibilityState === 'visible'` (no Chromium background throttling); the
  renderer gates work on `viewActive` (store, from `isViewActive`), never on `visibilitychange`: inactive views
  accumulate watcher changes in `lib/staleWork.ts` and flush on activation (dirty-tab disk sync and a slow 3 s git
  refresh still run).
- Inactive views **hibernate** back to dormant (`window/hibernation*.ts`, `workspaces.maxLiveViews` /
  `workspaces.hibernateAfterMinutes`) unless an eviction guard (`window/evictionGuards.ts`: dirty, Claude
  running/attention/unread, terminal foreground process; any pty on Windows, clone/network git, pending start) keeps
  them; guards are rechecked right before closing. A guard returns a code (`'unsaved' | 'closing' | 'unresponsive' |
  'pendingRequest' | …`, type in `evictionGuards.ts`) or `null`; the code is for diagnostics and tests, never shown to
  the user.
- Claude tabs + drafts persist in the workspace session and come back as `dormant:` conversations woken with `resume`
  (never send a `dormant:` id to `api.claude.*`; React keys use the stable `tabKey`).
- Main also idles out LSP servers (`lsp/idlePolicy.ts`) and the Claude CLI (`claude/conversation/idlePolicy.ts` + `run.ts` sleep/`ensureRun`,
  user-only `claude.idleSleepMinutes`, default 0 = never: a relaunch drops the session's MCP servers; `send` keeps its
  ack ahead of CLI events).
- The first `send` of every CLI process waits (≤ 15 s) until no MCP server is `pending` (`waitMcpConnected`, `notice`
  for the ones still connecting).
- The workspace tree watcher (`workspace/treeWatcher.ts`, injectable `subscribe`; real wiring in
  `workspace/viewWatchers.ts`; opening a folder goes through `workspace/openRoot.ts`) is `@parcel/watcher` (chokidar 5
  opens one fd per file on macOS). A second consecutive failure sets `WorkspaceChange.watchError` (translated
  `app.errors.watchFailed`, the renderer notifies) and the next activation retries. It honors only
  `files.watcherExclude` + a fixed floor, never `files.exclude`; events come back in the window folder's spelling and
  `WorkspaceChange.full` asks the renderer to reload everything.
- Terminal output is batched with ack flow control (`terminal.ack`, pause only for the active view + 2 s watchdog).
- Production renderer loads from `app://walph/` (`window/appProtocol.ts`, V8 code cache) and is minified; heavy
  screens/libs are `React.lazy`/dynamic `import()`.
- Session writes are async (`session/asyncWriter.ts`, sync flush on destroy/quit).

## Welcome screen

- The recent list lives in `recent/store.ts` (`getRecent`, `addRecent`, `removeRecentFolder`, `assertFolderOrForget`,
  `onRecentChange`); `ipc/recent.ts` only forwards changes as `recent:changed`. `recent.json` v2 = `{ folders: [{ path, lastOpened, branch }] }` (v1 strings still read); `workspaces.reportBranch`
  also updates the recent entry.
- `workspaces.openMany` reuses the empty active view for the first root (guarded per host); the window's "Abrir todos"
  memory (`window/folderMemory.ts`) only changes when the window gains a folder.
- `workspaces.openWithPrompt` queues `claude:startRequested` per view and delivers it only after that view's
  `workspace:open` of `root` finished (dropped on folder change/failure); the renderer still waits for `root` + end of
  session restore before `askClaude(prompt, { reuseStart: true })`.

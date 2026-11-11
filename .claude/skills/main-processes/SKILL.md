---
name: main-processes
description: Patterns for external processes and native dependencies in the main process (git CLI, ripgrep, node-pty, language servers, file watchers) — spawning safely, lifecycle and cleanup, bundling ESM-only deps and unpacking native binaries. Use when creating or reviewing code in src/main that spawns a process, watches files, or adds a dependency to main.
---

# External Processes & Native Dependencies (`src/main`)

## Rules

- **Always** `execFile`/`spawn` with an **argument array**. Never `shell: true`, never a command built from a string.
- Put `--` before paths and user-provided queries: `git add -- <paths>`, `rg -- <query> .`.
- Processes that may spawn children (git network, docker, clone, language servers, the Claude CLI) use `spawnGroup()` from `process/spawnGroup.ts`: own
  process group on POSIX, global registry swept by `killAllSpawnedGroups()` at `will-quit`, `kill()` takes the whole tree
  (`process/tree.ts`; on Windows `killAllSpawnedGroups` sends every non-graceful tree in ONE `taskkill /pid a /pid b /T /F`
  via `killLiveTreesSync`). Never `proc.kill()` such a process: it orphans `ssh`/helpers. `proc.closed` resolves when it
  exits (or never started). LSP (`lsp/server.ts`), debug adapters (`debug/transport.ts`) and Claude (`claude/spawn.ts`)
  spawn through `spawnGroup` too; what is their own is only the policy on top (LSP restart/backoff/shutdown handshake,
  the DAP `terminate`/`disconnect` grace, Claude stderr tail and the SDK abort).
- A command that runs to the end and whose output is read (git, docker one-shots, `claude mcp`/`auth`, `rg`, `lsof`,
  `osascript`) goes through `runCollect` (`process/runCollect.ts`), never a hand-rolled `spawn`/`execFile` with its own
  timer, `timedOut` flag, buffers and kill. It never rejects: it returns `{ code, stdout, stderr, timedOut, cancelled,
  spawnError, overflow }` and the caller only classifies it into translated errors. Options: `timeout`; `maxBuffer` +
  `onOverflow` (`'kill'` default = failure, or `'truncate'`: the stdout never goes past the cap, `overflow` says it
  did); `maxStderr` + `stderrKeep` (`'tail'` default or `'head'`; never a failure); `group: true` (a `spawnGroup`, tree
  killed by timeout/cancel/`will-quit`; default is a plain process) and `graceful`; `binary` (stdout as `Buffer`);
  `onStdout(chunk, stop)` to stream text instead of collecting it; cancellation by `signal` (`AbortSignal`) and/or
  `owner` (`registry.scope(wc)` of a `createViewRegistry<GroupProcess>`: the process is tracked in the view, a reset
  kills it and `cancelled` tells it apart from a timeout). Exceptions that stay on `spawnGroup`: streaming processes
  (docker `stats`/`logs -f`, LSP, Claude SDK) and `env/loginShell.ts` (injectable spawner, stdin closed by hand).
- Native binaries run by another process (`rg`, the Claude CLI, language-server scripts) get their path through
  `unpackedPath` (`util/unpackedPath.ts`; only a real `app.asar` path segment is rewritten, never `my-app.asar`). The
  login-shell PATH (`env/loginShell.ts`) is spawned through `spawnGroup`, cached per shell only on success (after a failure
  callers get `null` at once and one background retry runs with exponential backoff).
- A pty (`terminal/create.ts`, held in `terminal/registry.ts`; `ipc/terminal.ts` only wires channels) disposes its `onData`/`onExit` listeners with the terminal. Closing a terminal or resetting
  its view is a plain `kill()` (SIGHUP): the shell resends HUP to its jobs, and `nohup`/`disown` jobs survive on purpose,
  like in VS Code. Only the app quit sweeps: `killPtysSyncAndSweep(terms)` (`process/ptySession.ts`, POSIX only, no-op on
  Windows) snapshots the shell sessions BEFORE the HUP (Linux: `/proc` session id; macOS: `ps -t`-style tty of the pty
  `ptsName`), sends HUP, waits up to 1 s only when members exist, then SIGKILLs the survivors whose start time still
  matches (PID reuse). Never SIGKILL the shell right after HUP (jobs would be orphaned). Daemons that `setsid`/drop the
  tty are excluded on purpose. Every `ps` runs with `LC_ALL=C` (`lstart` is localized otherwise).
- Every long-lived process is **owned** by something (a window, a workspace) and **killed** when its owner goes away.
- Every process a user action can restart (search, LSP request) must be **killable**: keep the reference, `kill()` the
  previous one when a new request arrives.
- Shared primitives (use them, never write them inline):
  - Deadline on a promise: `util/deadline.ts` `withDeadline(p, ms, { signal? })` (resolves `TIMEOUT` on expiry, a rejection of `p`
    is passed through) or `rejectAfter(p, ms, makeError, { signal? })`; the timer is always cleared. No hand-rolled
    `setTimeout` + `Promise.race`. The timeout of a child process is the `timeout` option of `runCollect`, not a
    promise deadline.
  - Serial work: `util/serialQueue.ts` (`SerialQueue`, `KeyedSerialQueue`); never chain `tail = tail.then(...)` by hand.
  - Lines from a stream: `util/lineSplitter.ts` `createLineSplitter(maxLine?)` (CRLF aware, an endless line is emitted at
    the cap, `flush()` at the end); never `(tail + chunk).split('\n')`.
  - Child environment: `env/childEnv.ts` `buildChildEnv(base, extra, pathVar, { stripPrefixes })` (always drops
    `ELECTRON_RUN_AS_NODE`) and `findInPath`; the PATH comes from `env/loginShell.ts` `effectivePath()`.
  - User-configured executable: `env/executable.ts` `resolveExecutable(value, pathVar, { messages })` (absolute path must
    exist, name is looked up on the PATH, `.cmd`/`.bat` refused on Windows, errors carry `code: 'ENOENT'`) and
    `assertRunnableBinary(file, message)` (refuses `.js`/`.mjs`/`.cjs`). `docker/**` must not import from `claude/**`.

```typescript
// ✅ CORRECT
execFile('git', ['commit', '-m', message], { cwd: root })

// ❌ WRONG — shell injection through the commit message
exec(`git commit -m "${message}"`, { cwd: root })
```

## Quick Index

| Tool | Where | Notes |
|---|---|---|
| git | `src/main/git/run.ts` → `git(cwd, args)` | Sets `GIT_TERMINAL_PROMPT=0` (never hangs waiting for a password) and `GIT_OPTIONAL_LOCKS=0`. Porcelain paths are relative to the **repo root**, not the workspace: the root comes from `rev-parse --show-cdup` resolved against the window folder, never `--show-toplevel` (details in the `files-git-search` skill). Decide by exit code (`check-ignore`: 0/1/128) with `gitStatusCode(cwd, args, { timeoutMs })`, never a second `execFile('git')`. |
| ripgrep | `src/main/search/rg.ts` (used by `ipc/search.ts` and `files/fileListCache.ts`) | `runRg(args, { cwd, owner, onStdout })` prepends `--no-config --hidden --glob=!.git`, keeps the head of stderr (8 KiB) and returns an `outcome` (`ok`: exit 0/1 or stopped by the caller; `error`: exit 2; `interrupted`: killed by signal; `cancelled`; `spawnError`); `describeRgSpawnError(err, messages)` picks ENOENT/EACCES text. Binary from `@vscode/ripgrep` (`rgPath.ts`). Offsets in `--json` output are **UTF-8 bytes**: convert to chars. |
| node-pty | `src/main/terminal/create.ts` (+ `registry.ts`, `shellCwd.ts`, `links.ts`) | Login shell (`-l`) on macOS/Linux so the user's PATH loads; `powershell.exe` on Windows. Removes `ELECTRON_RUN_AS_NODE` from the child env. |
| @parcel/watcher | `src/main/workspace/treeWatcher.ts` (per-view controller with injectable `subscribe`; `viewWatchers.ts` wires the real deps) | Native recursive watcher (FSEvents/inotify/ReadDirectoryChangesW) on the **realpath** of the folder (paths mapped back to the window spelling); ignore globs = floor + `files.watcherExclude` only, never `files.exclude` (`workspace/watchFilter.ts`); batches 150 ms (2 s for inactive views), `workspace/eventBatch.ts` classifies file/dir with `lstat`. The settings files use `fs.watch` on their directory (`settings/dirWatch.ts`). |

## Process output and text

- Output of `docker`, `git`, the Claude CLI or a pty is untrusted text: `stripAnsi` removes CSI and OSC escapes,
  `stripControl(text, { keepNewlines })` keeps multi-line text (`\n` and `\t` survive, `\r` becomes `\n`),
  `flattenControl` turns control runs into one space (callers `trim()`/collapse themselves) and `hasControl` validates
  (all in `shared/controlChars.ts`). Never write these regexes inline. Guards for `unknown` values: `shared/guards.ts`.

## Lifecycle

```typescript
// window/viewResources.ts: every process/session/manager owned by a view lives in a registry, never in a hand-rolled Map
const terminals = createViewRegistry<Terminal>({
  key: 'terminal',                       // onViewReset key; the reset hook is armed by add/track/guardEpoch
  dispose: (t) => t.term.kill(),         // reset, dispose(), disposeAll(); the item is already out and wasCancelled()
  disposeSync: (all) => killAll(all)     // optional batch for will-quit; defaults to dispose per item
})
terminals.add(sender, id, t)             // get(wc, id) is owner-checked: a foreign view finds nothing
```

- `createViewRegistry` API: `add(wc, id, item)` / `track(wc, item)` (no id, returns the untrack), `get`, `values(wc)`,
  `entries()` (all views), `has(wc)` (eviction guards), `delete(wc, id, expected?)` (finished by itself, no dispose),
  `dispose(wc, id)`, `disposeAll(wc)`, `disposeAllSync()` (call it from the domain's `killAll…` for `will-quit`),
  `markCancelled` / `wasCancelled` (owner reset vs timeout/failure, picks the error message) and `guardEpoch(wc)`:
  call it BEFORE an `await` that precedes registering the item, then `assertAlive(() => new UserError(t()…))` after it.
  One item per view (clone, LSP manager) = a fixed id; a search is one item per request, tracked through `searches.scope(owner)` (`runRg`'s `owner`). Never keep a `Map<WebContents, …>` or a cancelled
  `WeakSet` by hand. Exception: state that is not a disposable resource (watchers/generations in `workspace/treeWatcher.ts`,
  `WeakMap` caches) and the docker `ViewState` (stats/logs runs, last `ps`) stay as they are.
- Reset vs destroyed: `onViewReset` for resources that die with a reload or renderer crash too (processes, watchers);
  `onViewDestroyed(wc, key, cb)` for what only makes sense until the view is gone. Both from `window/viewLifecycle.ts`.
- `will-quit` in `src/main/index.ts` stops everything global (never `before-quit`: it fires even when the dirty guard
  then cancels the quit).
- Per-view state: key it by the view's `webContents` (see the `workspaces` skill).

## Dependencies in main

- main is bundled as **CommonJS** with dependencies externalized (`electron-vite` default).
- **ESM-only** package that breaks with `require` → add it to `main.build.externalizeDeps.exclude` in
  `electron.vite.config.ts` so it gets bundled (none today). `@vscode/ripgrep` is ESM but works
  externalized thanks to Node 24's `require(esm)`.
- **Native binaries** (node-pty, ripgrep, anything with a `.node` or executable) must be listed in `asarUnpack` in
  `electron-builder.yml`, and their path rewritten with `.replace('app.asar', 'app.asar.unpacked')`.
- Native modules are rebuilt for Electron by the `postinstall` (`electron-builder install-app-deps`). Never skip it.

## Cross-platform

- Paths: always `node:path` (`join`, `dirname`, `relative`) in main. The renderer gets paths already in native format.
- Shells and executables differ per OS (`rg.exe`, `powershell.exe`): never hardcode POSIX-only commands.
- macOS apps opened from Finder get a minimal PATH (resolved by `src/main/env/loginPath.ts`).

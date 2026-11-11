---
name: debugger
description: Debugger patterns (Debug Adapter Protocol): the DAP client owned per view (src/main/debug, ipc/debug.ts), adapters from debug.adapters (stdio or local TCP), session lifecycle and timeouts, launch.json parsing and variable substitution, runInTerminal tickets, startDebugging child sessions, breakpoints, and the renderer side (Run and Debug view, toolbar, Debug Console, breakpoint gutter). Use when creating or reviewing anything in src/main/debug, ipc/debug.ts, debugActions.ts, components/debug or components/editor/breakpointGutter.ts.
---

# Debugger (`src/main/debug`, `ipc/debug.ts`)

Generic over the Debug Adapter Protocol, built like LSP (`lsp` skill): adapters are external processes owned per
workspace view, their output is untrusted and normalized at the boundary, every request has a deadline.

## Modules

`ipc/debug.ts` is wiring only (channels, argument validation, delegation); the manager of a view lives in
`debug/registry.ts` (`debugManagerOf(wc)`, `ensureDebugManager(wc)`, `killAllDebug()` for `will-quit`,
`debugRunCommand` for the terminal source).

| Module | Role |
|---|---|
| `debug/framing.ts` | `Content-Length` framing (`createDapParser`, `encodeDapMessage`). DAP is not JSON-RPC, so `vscode-jsonrpc` is not used; caps: 64 MiB message, 8 KiB header, a framing error closes the channel |
| `debug/connection.ts` | `DapConnection` over a `DapStreams` pair: `request(command, args, timeoutMs)` (seq, `rejectAfter`), events, reverse requests (`onRequest` resolves the body, a rejection becomes `success: false` with the English message), `DapResponseError` (translated prefix + adapter text) |
| `debug/normalize.ts` | Pure normalization of every adapter body (capabilities, threads, frames, scopes, variables, evaluate, breakpoint statuses, stopped/continued/output/exited) with text and list caps; `responseErrorMessage` prefers `body.error.format` |
| `debug/session.ts` | `DebugSession`: `initialize` → `launch`/`attach` (not awaited) → `initialized` event → breakpoints + `setExceptionBreakpoints` (default filters only) + `configurationDone` → launch response. `control`, `threads`, `stackTrace`, `scopes`, `variables`, `evaluate`, `stop` (`terminate` if supported and `launch`, then `disconnect`; a second `stop` closes at once), `finish(error)` |
| `debug/manager.ts` | `DebugManager` (no Electron): configurations, start/restart/stop of session trees, the breakpoint map (keyed by `pathKey`), output batch (50 ms), `runInTerminal` tickets, `startDebugging` children. Dependencies are injected (`resolveLaunch`, `startAdapter`, `createFile`, `readText`) so `manager.test.ts` drives it with a fake adapter over `PassThrough` streams |
| `debug/transport.ts` | `startAdapter` (`spawnGroup`, stderr through `createLineSplitter`) and the channel: stdio (one connection) or `tcp` (`freePort` → `${port}` in the args, `connectTcp` retries for 10 s, one socket per session) |
| `debug/adapters.ts` | `resolveAdapter(type, setting)`: `debug.adapters[type]` → alias (`pwa-node` → `node`, `debugpy` → `python`…) → built-in (`python` = `python3 -m debugpy.adapter`, `python` on Windows) |
| `debug/launchConfig.ts` | `.vscode/launch.json` (JSONC via `settings/parseJsonc.ts`), `windows`/`osx`/`linux` overrides, `builtinConfigs` (shown when the file is missing or has no configuration), `launchFileTemplate`, `substituteVariables` |
| `debug/runInTerminal.ts`, `debug/validate.ts` | Validation of the reverse `runInTerminal` arguments and of the renderer arguments |

## Rules

- **Ownership:** one manager per view (`createViewRegistry`, key `debug`); a view reset disposes it (short graceful stop,
  then kill), a folder change calls `resetForFolder` (stops the sessions, forgets the breakpoints), `will-quit` calls
  `killAllDebug` (the adapters are `spawnGroup` processes, so `killAllSpawnedGroups` also sweeps them).
- **`debug.adapters` is user-only** (it runs programs): validated by `isValidDebugAdapter` in `shared/settings.ts`
  (`command` like `terminal.shell`, `tcp` requires `${port}` in `args`, `env` like `claude.env`). The executable is
  resolved with `resolveExecutable` on the login-shell PATH (`effectivePath`), env through `buildChildEnv`.
- **Timeouts** (`DAP_TIMEOUTS`): initialize 15 s, launch/attach 60 s, requests 10 s, evaluate 15 s, terminate/
  disconnect 3 s. Never `await` a DAP request without one.
- **The launch response is not awaited before `initialized`:** debugpy answers `launch` only after `configurationDone`.
  Some adapters send `initialized` after the launch response: wait `lateInitialized` (2 s) for it before configuring.
- **Breakpoints:** the renderer is the source of truth (persisted in the workspace session) and sends the whole list of
  a file with `debug.setBreakpoints` (only enabled ones). The manager keeps the map, sends it in `configure` and to every
  live session on change (`initializedSeen`, so a change during `configure` is not lost). Statuses go back as the
  `breakpoints` event aligned with the request order; `breakpoint` events are mapped by the ids of the last response.
  Conditions/hit counts/log messages are dropped when the adapter did not announce support.
- **Synthetic `continued`:** adapters do not send `continued` for client requests, so `control` emits one after a
  successful continue/next/stepIn/stepOut (and `restartInAdapter` too). The renderer handles `continued` uniformly.
- **Failure surfaces:** a failure during `start` rejects the `debug:start` invoke (the adapter's spawn error or crash,
  with the last stderr line, wins over the generic communication error) and emits no `error` event; after start, an
  adapter crash or a broken channel emits `{ kind: 'error' }` (translated) and the sessions vanish from the list.
- **`runInTerminal`:** the manager stores a one-shot ticket (15 s) and emits `{ kind: 'runInTerminal', ticket }`; the
  renderer calls `terminal.create({ debugRun: ticket })`; `terminal/create.ts` asks the `debugRun` terminal source
  (registered by `ipc/debug.ts`), which takes the ticket and runs `args[0]` with the rest (no shell), the adapter's
  `cwd` and env; `onSpawned(pid)` answers the adapter with `processId`. The command never comes from the renderer.
- **`startDebugging`** (js-debug): only over `tcp` (a new socket to the same server per child); the child gets
  `parentId`, ends with its root, and `stop` of any session stops the whole tree (children first).
- Text sent to the adapter (reverse request refusals) is English; everything shown to the user goes through
  `t().debug` (main) or `t().debugUi` (renderer).
- `preLaunchTask`/`postDebugTask` are not run: a note goes to the Debug Console. `${command:…}`, `${input:…}` and
  `${config:…}` throw a translated error.

## Testing

- `manager.test.ts` uses a `FakeAdapter` (two `PassThrough` streams + `createDapParser`) that answers like debugpy
  (`initialized` right after `launch`, launch response after `configurationDone`); `tcp: true` gives a new adapter per
  `connect` for child sessions. Real adapters are not part of the suite (debugpy/js-debug are not dependencies).

## Renderer

- State: `types/debug.ts` / `state/debug.ts` (scoped per folder). Actions: `debugActions.ts` (sessions, events from
  `api.debug.onEvent`, focused session/frame, watches, console, the `inDebugMode` context) and
  `debugBreakpointActions.ts` (breakpoints per path, pushed with `debug.setBreakpoints` and saved in the session).
  Pure logic in `lib/debugBreakpoints.ts`, `lib/debugConsole.ts`, `lib/debugSessions.ts`.
- UI: `components/debug/` (`DebugView` + `DebugSections` in the sidebar, `DebugToolbar` floating in `.main`,
  `DebugConsole` as the `debugConsole` bottom-panel view), styles in `styles/debug.css`.
- Editor: `components/editor/breakpointGutter.ts` (gutter marks that follow edits, inline condition widget, stopped
  line highlight), added to both `extensionsFor` and `createMirror`; it reaches the store only through
  `components/editor/debugHost.ts` (`bindDebugHost`), like `lspHost.ts`.
- Commands act on the focused session: the one of the last `stopped` event, else the newest live leaf session.

---
name: main-ipc
description: IPC patterns between the Electron main process and the renderer (typed contract in src/shared/types/<domain>.ts, runtime channel spec in src/shared/ipcSpec.ts, ipcMain handlers in src/main/ipc, generated contextBridge in src/preload, consumption in the store). Use when creating or reviewing any capability that crosses main ↔ renderer, a new IPC channel, or an event sent from main to the window.
---

# Main ↔ Renderer IPC

The renderer runs with `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`. Everything that needs Node
goes through `window.api`, typed as `WalphApi` in `src/shared/types/index.ts` (composed of each domain's `<Domain>Api`). **Never relax these options.**

## Rules

- Every new capability crosses **4 steps, in this order**: contract → spec entry → handler → usage. The preload is never
  edited by hand: it is generated from the spec.
- Channel names are `domain:action` (`fs:readDir`, `git:stage`, `terminal:data`).
- The preload **only forwards** calls (`buildApi(ipcSpec, ipcRenderer)`). Zero logic.
- Errors are thrown in main with a **translated message** (`throw new UserError(t().<domain>.<key>(…))`, `i18n` skill)
  and shown in the UI with `attempt(fn, { format })` (`renderer/src/attempt.ts`, built on `notify(errorMessage(err))`).
- Non-trivial logic (parsers, mappers) lives in a pure module next to the handler, with tests.

## 1. Contract — `src/shared/types/<domain>.ts`

Add data types and the method to the domain file's `<Domain>Api` interface (`types/git.ts` → `GitApi`); `types/index.ts`
re-exports every type and composes `WalphApi`, so imports stay `@shared/types`. A new domain = new file + a member in
`WalphApi` + a re-export in `index.ts`. Document units and conventions in comments
(absolute path, 1-based line, UTF-16 offset…).

```typescript
export interface GitBranch {
  name: string
  /** true for the branch currently checked out */
  current: boolean
  remote: boolean
}

// types/git.ts
export interface GitApi {
  branches(root: string): Promise<GitBranch[]>
}

// types/index.ts
export interface WalphApi {
  git: GitApi
}
```

## 2. Spec entry — `src/shared/ipcSpec.ts`

`ipcSpec` is the ONE runtime description of the IPC: it mirrors the `WalphApi` tree (`git: { branches: invoke('git:branches') }`)
and each method declares its kind and channel. Kinds: `invoke(channel)` (renderer → main with a reply; the contract
method returns a `Promise`), `send(channel)` (renderer → main, fire-and-forget; returns `void`) and `event(channel)`
(main → renderer; the contract method is `onXxx(cb)` returning the unsubscribe). Channel names are `domain:action` and may
differ from the method name (`window.run` → `window:action`, `showContextMenu` → `*:contextMenu`, `onChange` →
`*:changed`): the spec just records them.

```typescript
// shared/ipcSpec.ts
git: { branches: invoke('git:branches'), cancelClone: send('git:cancelClone'), onCloneProgress: event('git:cloneProgress') }
```

Everything else is derived, nothing is retyped:

- `IpcSpec` (mapped type over `WalphApi`) is the shape the spec must satisfy (`satisfies IpcSpec`): a contract method
  missing from the spec, an extra entry, or the wrong kind for the signature (`invoke` on a method that returns `void`,
  `send` on an `onXxx`…) fails `pnpm typecheck`.
- `src/shared/ipc.ts` derives `IpcInvoke` (`{ args, result }`), `IpcSend` (args) and `IpcEvents` (listener args) from the
  spec + the `<Domain>Api` signatures, plus `IPC_CHANNELS` (`invoke`/`send`/`event` lists, used by
  `main/ipc/registry.test.ts`). Handlers get them through `handle`/`on` (`ipc/typed.ts`) and `send` (`window/send.ts`).
  Handler args stay `unknown` (validate with `assert*`/`parse*`); the helpers only check channel name, arity and return type.
- Not in the spec (assembled by hand in `preload/index.ts` because they are not channels): `platform`, `isPackaged`,
  `homeDir`, `locale` (from `process`/argv) and `files.pathForFile` (`webUtils`). Another member like these needs the
  name added to `PreloadOnly` in `ipcSpec.ts` and the code in the preload.
- `ipcSpec.test.ts` fails on a channel declared twice or not shaped `domain:action`. `ipcSpec.ts` imports no `electron`.

## 3. Handler — `src/main/ipc/<domain>.ts`

One file per domain exporting `register<Domain>Handlers()`, called from `src/main/index.ts`. The file is **wiring
only**: channel names, argument validation and delegation. State, services and processes live in `src/main/<domain>/`
(`git/ops/*.ts`, `settings/service.ts`, `recent/store.ts`, `terminal/create.ts`, `window/closeController.ts`…) so they
are testable without `ipcMain`. Domain modules import each other directly (`settings/state`, never `ipc/settings`);
nothing outside `ipc/**`, `index.ts` and `menu.ts` imports `ipc/*`, and an `ipc/<domain>.ts` imports no sibling
`ipc/*.ts` except `./typed` (`no-restricted-imports` in `eslint.config.mjs`, tests exempt). What two domains share
(`claude/registry.ts`, `lsp/registry.ts`…) lives in the domain; a domain that pushes an event to a view imports `send`
from `window/send.ts`, never from `ipc/`.

```typescript
import { handle, on } from './typed'      // typed wrappers over ipcMain.handle / ipcMain.on
import { send } from '../window/send'     // typed webContents.send (IpcEvents)

export function registerGitHandlers(): void {
  handle('git:branches', (e, root: unknown) => branches(ownRoot(e.sender, root)))
}
```

Never call `ipcMain.handle/on` or `wc.send('…')` directly: use `handle` / `on` from `ipc/typed.ts` and `send(wc, channel, …payload)` from
`window/send.ts` (`handle`/`on` call `ipcMain` underneath and `send` calls `wc.send`, so tests that mock `electron` keep working).

| Pattern | Use for | main | spec (preload is generated) |
|---|---|---|---|
| Request/response | Anything that returns a value or can fail | `handle` | `invoke('d:a')` |
| Fire-and-forget | High-frequency input (terminal keystrokes, resize) | `on` | `send('d:a')` |
| Event main → renderer | Streams (pty output, watcher changes) | `send(e.sender, channel, …)` | `event('d:a')` |

- Send events **to the requesting `webContents`** (`e.sender`), never broadcast to every window. `send` already returns
  early on a destroyed view: never wrap it in `if (!wc.isDestroyed())` (keep a guard only when it also protects other
  work, such as reading per-view state).
- Per-view resources (pty, watchers, LSP servers, git/docker processes) are released with
  `onViewReset(sender, '<key>', cb)` from `window/viewLifecycle.ts` (fires on `did-navigate`, `render-process-gone` and
  `destroyed`; idempotent per key; `viewEpoch(wc)` lets an async handler detect a reset in the middle). Anything that
  only dies with the view (a per-view map entry, an unsubscribe, a last flush) uses `onViewDestroyed(wc, '<key>', cb)`
  from the same module: runs once on `destroyed` only (not on reload or renderer crash), idempotent per key, errors
  isolated. Never write `wc.once('destroyed', …)` by hand.
- Listener sets of the main process (`onSettingsChange`, `onRecentChange`, `onWorkspaceEvent`…) are
  `createEmitter<[Args]>('scope')` from `util/emitter.ts`: `on` returns the unsubscribe and `emit` isolates listener
  errors. Never keep a `new Set<(…) => void>()` of callbacks by hand.
- Main logs through `createLog('scope')` from `log.ts` (`warn`/`error`); `console` is lint-banned in `src/main` outside
  `log.ts` and tests.
- Native dialogs go through `window/nativeUi.ts`: `showMessageBoxFor`, `showOpenDialogFor`, `showSaveDialogFor`,
  `confirmDestructive` (Enter/Esc cancel), `pickFolder`, `popupChoice`; never `dialog.show*` or `windowOf` in a handler.
  A dialog on behalf of a view without a window is not shown (resolves as cancelled); only `wc` null (app-level, macOS
  without a window) shows a parentless dialog.

## 4. Bridge — generated, `src/preload/buildApi.ts`

`buildApi(ipcSpec, ipcRenderer)` walks the spec and turns each entry into `ipcRenderer.invoke` / `send` / `on` (the
event wrapper drops the Electron event, passes only the payload and returns the unsubscribe). `preload/index.ts` spreads
its result, adds the hand-made members above and calls `contextBridge.exposeInMainWorld`. Nothing to write here for a new
capability. It forwards ALL arguments (no fixed arity): never pass an API method point-free (`onClick={api.x}`), the
SyntheticEvent would cross IPC. The preload imports only `electron`, `./buildApi` and `@shared` (types, plus the `@shared/ipcSpec` runtime
value): the lint rule is in `eslint.config.mjs`, and electron-vite bundles the shared code into `out/preload/index.js`,
whose only `require` must stay `electron` (a sandboxed preload cannot require anything else). `buildApi.ts` takes the
ipc object as a parameter (`RendererIpc`) so `buildApi.test.ts` can use a fake.

## 5. Usage — renderer

Calls live in **actions exported from the modules beside `store.ts`** (`gitActions.ts`, `tabActions.ts`…) (or in the component that owns the feature), always handling errors:

```typescript
// ✅ CORRECT
export async function loadBranches(): Promise<void> {
  const { root } = get()
  if (!root) return
  try {
    const branches = await api.git.branches(root)
    if (get().root === root) set({ branches })   // workspace may have changed meanwhile
  } catch (err) {
    notify(`Git: ${errorMessage(err)}`)
  }
}

// ❌ WRONG — unhandled rejection, no user feedback, stale write after workspace switch
useEffect(() => { window.api.git.branches(root).then((b) => setBranches(b)) }, [])
```

Event subscriptions inside `useEffect` must return the unsubscribe in the cleanup.

## Validating untrusted values

Anything from the renderer, disk, a language server or the Claude SDK is `unknown` until checked. Use the shared guards
(`@shared/guards`), never a local copy: `isRecord` (plain object, arrays and `null` rejected), `isNonEmptyString`,
`isFiniteNumber` (no `NaN`/`Infinity`). Single-line display text from those sources goes through `@shared/controlChars`
(`flattenControl`, `stripControl`, `stripAnsi`, `hasControl`); a regex with control characters is never written inline
(`no-control-regex` is disabled only inside that module).

Arguments: absolute paths are validated with `isAbsolutePathInput` (silent drop) or `parseAbsolutePath(value, message?)`
(`fs/validate.ts`; NUL check, returns `resolve`d), the rest with the combinators in `validate/args.ts` (`int`, `oneOf`,
`bool`, `record`), which throw the translated message the caller passes. Never write
`typeof x !== 'string' || !isAbsolute(x)` or `Number.isInteger` checks inline.

## Error convention

Four shapes coexist on purpose. Pick by what the renderer must do with the failure:

| Shape | When | Example |
|---|---|---|
| **`throw new UserError(t().<domain>.<key>)`** (default) | The operation failed and the user only needs to read why. The renderer shows it with `attempt` (`notify(errorMessage(err))`) and never parses the text. | `git.commit`, `fs.rename`, `docker.list` |
| **Result union `{ ok: true; … } \| { ok: false; reason?; message/error }`** | The failure is an **expected state** the UI renders or branches on (not a toast), or the renderer needs a **code**. Put the code in a literal union field (`reason`), never make the renderer match the message. | `DockerInfo` (`reason: 'notInstalled' \| 'daemonDown' \| 'error'`), `CloneUrlCheck` |
| **`null` / `[]`** | "Nothing to answer" is normal, not an error: no server/capability, user cancelled a dialog, stale request superseded. | `lsp.hover`, `cli.install` (cancelled), `fs.showContextMenu` |
| **`boolean` ack** | A request/response protocol where `false` means "main refused, keep your pending UI" and the renderer must recover state. Document what `false` means on the contract. | `claude.respond` |

Rules:
- **`UserError`** (`src/main/errors.ts`) is the only error class whose message is meant for the user: every translated
  message (validators in `validate/args.ts`, `fs/validate.ts`, domain errors, `GitCommandError`, `DockerError`,
  `AlreadyExistsError`, `ServerResponseError`…) is a `UserError`; a plain `new Error(t()…)` is a bug. Any error that
  can cross IPC and carries text for the user (classified git/docker output, a `message()` callback) must be a
  `UserError` too. Lint enforces the common case: `no-restricted-syntax` in `eslint.config.mjs` (`USER_ERROR_SYNTAX`,
  `src/main/**` outside tests) rejects `new Error(...)` whose arguments call `t()`; text held in a variable is on you. Its `name` stays `Error` on purpose
  (Electron serializes `${name}: ${message}` and the renderer's `errorMessage` (`lib/errors.ts`) strips that prefix).
- **The error boundary is `handle` in `ipc/typed.ts`**: a `UserError` crosses as is; anything else (a raw `ENOENT`, a
  bug) is logged with `log.error(channel, err)` and replaced by `UserError(t().common.unexpectedError(message))`. A
  rejected promise is rewritten in place and the handler's own promise is returned: never chain (`.catch`/`await`) in
  the boundary, the extra tick makes events the handler sent arrive before the reply, and the renderer relies on reply
  first (e.g. a Claude question card focus). So
  raw fs errors must be translated before they leave the handler: `describeFsError(err, path)` (`fs/describeFsError.ts`:
  ENOENT/EEXIST/ENOTEMPTY/EACCES/EPERM/ENOTDIR/EISDIR, unknown codes keep the message) for reads, listings and
  creation, `describeWriteError` for writes (a `UserError` passes through both; unknown writes errno become
  `files.errors.writeFailed` with the original detail, never a raw error; `shell.trashItem` goes through `fs/trashPath.ts`). The renderer never inspects the text
  or the error name; when it needs a code use a result union.
- Main may throw a coded error internally (e.g. `DockerError` with `info`), but it crosses IPC only as a message
  (Electron serializes only `message`). If the renderer needs the code, convert to a result union at the handler.
- Never change an existing channel between shapes without migrating every caller in the same change.
- Fire-and-forget channels (`IpcSend`) don't report errors: invalid input is ignored (validated, then dropped).

## Which folder a channel acts on

- Channels that mutate or read **inside the view folder** with no folder argument (`fs:createFile`, `fs:rename`, the
  Claude conversation…) take the folder from main: `requireViewRoot(e.sender, message?)` (`window/ownRoot.ts`; throws a
  `UserError`, default "no folder open", the domain passes its own translated message). Never trust or echo a root
  from the renderer there.
- Channels where the renderer names a `root` (git, search, settings `setWorkspace`, Claude writes that must not land in
  a folder the view just left) accept it only through `assertOwnRoot(wc, root, message)` / `ownRoot` (same view
  folder, returns main's spelling, `UserError` otherwise). A request that sends no folder uses `requireViewRoot`;
  `getSenderRoot` (`windows.ts`) is only for the `beforeunload` messages that arrive while the view is closing.

## Security

- **Trusted sender:** `handle` rejects (and `on` drops, with a `log.warn`) any message whose `event.senderFrame` is not
  the `mainFrame` of a workspace view. Every workspace `WebContentsView` is registered by `createWorkspaceView`
  (`trustSender` in `window/trustedSenders.ts`) before it loads the renderer, so its preload's first message is trusted;
  there is no other webContents in the app that talks to main (no settings/about window, no `<webview>`). `senderFrame`
  is `null` after a navigation or a dead frame: untrusted. Tests that call handlers through `testing/fakeIpc.ts`
  get trusted events automatically; to test the rejection build the event by hand (`ipc/typed.test.ts`).
- Names coming from the UI (create/rename) go through `assertValidName` (no `/`, `\`, `.`, `..`).
- Deleting always uses `shell.trashItem` (reversible) — never `fs.rm`.
- `shell.openExternal` only for `http:`, `https:` and `mailto:` URLs (parsed with `new URL`).
- Never load remote content in the window. The CSP lives in `src/renderer/index.html`.
- **`fs:writeFile` is gated per view** (`assertWritable`, `fs/writeAccess.ts`). It writes a path only if it is (1) inside
  the view folder (`resolveInsideRoot`, so a symlink or a dangling link that leaves the folder does not count) or (2) a
  file main itself read for that view: `fs:readText` registers the path after a successful read, and every file tab
  loads through it. The list is a `PathAllowlist` (`fs/pathAllowlist.ts`) per view (`createViewPathAllowlist`,
  `window/viewPathAllowlist.ts`): keyed by `pathKey` (`shared/pathCompare.ts`), pinned to the canonical path
  (`canonicalPath` in `fs/paths.ts`: nearest existing ancestor by `realpath`, dangling links followed), so a link
  re-pointed after the read is rejected (`writeTargetChanged`); no TTL, capped at 10 000 entries, dropped on view reset
  and on a folder change (`onWindowRootChange`). A rejected path throws `files.errors.writeNotAllowed`. Rules for new code:
  a native dialog that picks a path the editor will save to (a future Save As) calls `allowWrite(wc, path)` in main right
  after the dialog; a channel that hands a path to the renderer to open in a tab needs no registration (the tab's
  `readText` does it); the renderer can never register a path itself (`readFile`/`readImage` do not). Known limit: the
  renderer chooses what to `readText`, so a compromised renderer can still overwrite any existing text file it can read
  (not create new files, write binaries or write unreadable ones); a compromised renderer already has `terminal:create`.
  Claude edits never use this channel (the CLI writes after the permission card).
- `session:load` reads the session file of **any** folder on purpose, without the `matchOwnRoot` check that
  `session:save` applies: it is read-only, the argument is only hashed into a file name under `<userData>/sessions/`
  (no path escapes) and the content goes through `sanitizeSession`. The renderer asks for it while entering a
  workspace, concurrently with the folder registration, so requiring ownership there would only add a race.
- External processes: see the `main-processes` skill.

## Checklist

- [ ] Type in `shared/types/<domain>.ts`, entry in `shared/ipcSpec.ts`, handler registered (and its `register*Handlers` in `registry.test.ts` if new), `pnpm typecheck` green
- [ ] Errors reach the user with a translated message (`t()`, all three languages), in the shape of the "Error convention" table
- [ ] Per-window resources released when the window closes
- [ ] Inputs from the renderer validated in main (a write channel outside the view folder goes through `assertWritable`)
- [ ] Pure logic extracted and tested

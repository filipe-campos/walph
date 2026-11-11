# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Detailed patterns live in the **skills** (`.claude/skills/`). Layers: `main-ipc`, `main-processes`, `renderer-store`,
> `renderer-components`, `renderer-styles`, `renderer-editor`, `renderer-terminal`, `app-testing`, `i18n`. Domains:
> `workspaces`, `commands-settings`, `files-git-search`, `lsp`, `debugger`, `claude-panel`, `containers`,
> `packaging-release`.
> Load the relevant skills before writing code in those areas; this file only covers the global rules.
>
> **Language:** the whole project is in English (code, comments, test names, logs, docs, commits, PRs, `.claude/`);
> **always respond to the user in Portuguese (pt-BR)**.
> The app UI is translated into **pt-BR (reference), English and Spanish**: no UI text is written in code, it always goes
> through the catalogs in `src/shared/i18n/` (`i18n` skill).

## Overview

**Walph** is a personal IDE built from scratch: **Electron 45 + electron-vite 6 + React 19 + TypeScript 7**, cross-platform
(macOS, Windows, Linux).

- **src/shared/**: `types/` (`index.ts` composes `WalphApi`; one file per domain with its types and its `<Domain>Api`
  interface) is the contract between main and renderer, and `ipcSpec.ts` (runtime `invoke`/`send`/`event` + channel per
  method; `ipc.ts` derives the typed channel maps and `IPC_CHANNELS` from it). **Every capability starts here.** `i18n/` (locale, `t()`, one
  message catalog per domain in `i18n/messages/`, each with pt-BR, en and es). `commands.ts` (`CommandId`,
  `defaultKeybindings`, `isCommandAvailable`), `settings.ts` (schema, defaults, `mergeSettings`: default ← user ←
  workspace), `pathCompare.ts` (the single path comparison of the repo).
- **src/main/**: `index.ts` (lifecycle), `window/` (BaseWindow + one WebContentsView per workspace), `menu.ts` (native
  menu → `app:command`), `ipc/<domain>.ts` (one file per domain: `fs`, `workspace`, `session`, `recent`, `search`,
  `files`, `git`, `terminal`, `settings`, `docker`, `lsp`, `debug`, `claude`, `update`, `cli`…). An `ipc/<domain>.ts` is wiring
  only (channels, validation, delegation); services, state and pure logic live in `<domain>/` (`git/ops/`,
  `settings/service.ts`, `recent/store.ts`, `terminal/create.ts`, `window/closeController.ts`,
  `search/parseRipgrep.ts`…). Nothing outside `ipc/**`, `index.ts` and `menu.ts` imports `ipc/*` (lint-enforced, no
  exceptions) and an `ipc/<domain>.ts` imports no sibling `ipc/*.ts` but `./typed`: what two domains share lives in the
  domain (`<domain>/registry.ts`), the event push `send` in `window/send.ts` and the argument validators in
  `validate/args.ts`.
- **src/preload/**: `index.ts` exposes `window.api` via `contextBridge`, built by `buildApi(ipcSpec, ipcRenderer)`
  (`buildApi.ts`) from the spec in `shared/ipcSpec.ts`, plus the few members that are not channels (`platform`,
  `isPackaged`, `homeDir`, `locale`, `files.pathForFile`). Forwards only; zero logic; never edited per capability.
- **src/renderer/**: `store.ts` (zustand base; imports no action module; `State` composes the per-domain interfaces of `types/`, whose initial values live in `state/`) plus the action modules beside it
  (`<domain>Actions.ts`, `diskSync.ts`, `workspaceLifecycle.ts`…), `commands/` (`registry.ts` + `builtin.ts`: menu and
  palette call `executeCommand(id)`), `components/` (`editor/` CodeMirror 6, `sidebar/`, `quickInput/`, `claude/`,
  terminal panel with xterm.js), `lib/` (pure utilities), `styles.css` + `styles/*.css` (tokens in `styles/tokens.css`).
- **e2e/**: Playwright specs launching the built app with a temp repo as argv and an isolated `--user-data-dir`.

## Development Commands

```bash
pnpm install      # installs deps, downloads the Electron binary, rebuilds node-pty
pnpm dev          # app in dev mode (renderer HMR; main/preload changes restart the app)
pnpm dev <dir>    # same, opening a folder (argv → `workspace:initial`)
pnpm typecheck    # tsc 7 for node, web, e2e and the node/web test projects (tsconfig.{node,web}.test.json)
pnpm lint         # eslint --max-warnings 0 + prettier --check
pnpm format       # prettier --write + eslint --fix
pnpm test         # vitest run (project `node`: main/preload/shared; project `renderer`: jsdom)
pnpm test:e2e     # electron-vite build + Playwright (_electron.launch on out/main/index.js)
pnpm knip         # unused files, exports and dependencies (knip.json)
pnpm check        # typecheck + lint + knip + docs:check + test — must be green with zero warnings
pnpm docs:check   # paths cited in every doc (CLAUDE.md, README, docs/, skills, agents, commands) still exist (used by `/audit claude-setup`)
pnpm build        # production build into out/
pnpm dist         # installer for the current OS into dist/
```

## Key Conventions

### Files

| Kind | Pattern | Example |
|---|---|---|
| Main IPC domain | `src/main/ipc/<domain>.ts` exporting `register<Domain>Handlers()` | `ipc/git.ts` |
| Main pure logic | `src/main/<domain>/<camelCase>.ts` + `.test.ts` | `git/parseStatus.ts` |
| React component | `PascalCase.tsx`, one main component per file | `GitView.tsx` |
| Renderer utility | `src/renderer/src/lib/<camelCase>.ts` + `.test.ts` | `lib/path.ts` |
| E2E test | `e2e/<feature>.spec.ts` | `e2e/smoke.spec.ts` |

### Code

- Strict flags in production code (`tsconfig.node.json`/`tsconfig.web.json`): `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`; tests only get the first (`*.test.json` projects). Write `x?: T | undefined` only where
  `undefined` is a real value; otherwise omit the key (`omitUndefined` from `@shared/omitUndefined`, or a conditional
  spread). Indexed access gets a real guard (`?? default`, `.at()`, `charAt`), not `!`. `prefer-nullish-coalescing` keeps a
  `||` only with `eslint-disable-next-line … -- <why>` when `''`/`0` must count as missing. Data from IPC, disk or servers
  is typed `unknown` at the boundary, so `no-unnecessary-condition` never tempts anyone to delete its checks.
- Prettier style: no semicolons, single quotes, 120 columns, 2-space indent.
- New action = `CommandId` + `defaultKeys`/`defaultWhen` entry in `defaultKeybindings` (shared) → menu item if it belongs to a menu (main) →
  `registerCommand` in `commands/builtin.ts`. No keydown handlers for app shortcuts — native accelerators fire them.
- `import type` for type-only imports; `@shared/*` alias for the contract; relative imports inside each process.
- Short code comments in **English** explaining *why*, not *what*.
- IPC channels named `domain:action`; errors thrown in main with translated messages (`t()`), shown in the renderer with
  `attempt(fn, { format, fallback, quiet })` (`renderer/src/attempt.ts`: `notify(errorMessage(err))` + fallback; `errorMessage` is in
  `lib/errors.ts`).
- **Every user-visible string** (JSX, attributes, toasts, errors, dialogs, menus, quick picks, settings metadata) comes
  from `src/shared/i18n/messages/<domain>.ts` with the three languages: `useT()` in components, `t()` elsewhere, resolved
  at call time (never in a module constant). Numbers and dates via `i18n/format.ts`. Details: `i18n` skill.
- Commits follow `.claude/git/commit.md`; PRs use `.claude/git/pr.md`.
- **Enforced by `pnpm lint`** (`eslint.config.mjs`): layer boundaries (`shared` imports no Node/Electron/main/renderer/preload;
  `renderer` imports no Node/Electron/main/preload; `store.ts` imports no action module; `preload` imports only
  `electron`, `./buildApi` and `@shared`, runtime only `@shared/ipcSpec`), no bare `writeFile`/`appendFile` in main outside `fs/atomicWrite.ts`, no import
  cycles, the `ipc/*` layering above (`no-restricted-imports`), no `useStore.getState`/`setState` outside `store.ts` and components, no literal UI text in
  `.tsx`, `no-console` (only `error`/`warn`) and the type-aware promise/`any` rules. Unused exports fail `pnpm knip`:
  export only what another module imports.

### Main patterns (details in `main-ipc` / `main-processes`)

- New capability = contract (`shared/types/<domain>.ts`) → spec entry (`shared/ipcSpec.ts`: `invoke`/`send`/`event` + channel;
  `IpcInvoke`/`IpcSend`/`IpcEvents`/`IPC_CHANNELS` in `shared/ipc.ts` and the preload bridge are derived) → handler
  (`main/ipc`, via `handle`/`on` from `ipc/typed.ts`, `send` from `window/send.ts`) → usage (store action).
- External processes with `execFile`/`spawn` + argument arrays; `--` before user input; owned and killed with their view.

### Renderer patterns (details in the `renderer-*` skills)

- Single zustand store (`store.ts`); actions are exported functions in the modules beside it (`<domain>Actions.ts`), never re-exported from `store.ts` (import cycle); startup lives in `bootstrap.ts` (`bootstrap()`, called once by `main.tsx`: locale, built-in commands, `startStoreReactions`, appearance, auto save, focus contexts, `startIpcListeners`, then settings sync and workspace restore; App.tsx keeps only DOM concerns); each module exposes its own `start…Reactions`, composed with `createReactionScope` (`lib/reactions.ts`); store subscriptions use `useStore.subscribe(selector, listener, { equalityFn })` (`subscribeWithSelector`), never a bare `(s, prev)` listener; modules at the root of `src/renderer/src` never import `.tsx` components (lint); narrow selectors.
- One CodeMirror `EditorView` per editor group (max `MAX_EDITOR_GROUPS` = 8, laid out by the split tree in `shared/editorLayout.ts`) and one canonical `EditorState` per tab; xterm output only through `lib/terminalBus.ts`.
- Visual language = the **Walph design system** (reference copy in `docs/design-system/`: `components/<Name>/README.md`, `components/bundle.css`; tokens named as in its `tokens.json`, with a Dark and a Light value each, kept in sync with `themes/` by a test: `bg-000…400`, `ink*`, `accent*`;
  light/neon only for AI, focus and the primary action). Colors via CSS tokens only; icons: design-system `Icon` →
  `FileIcon` for files/folders → codicons for the rest; fonts Geist + JetBrains Mono bundled; UI copy
  translated (pt-BR, en, es) through the `i18n` catalogs.

## Security Baseline

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — never change them.
- No `shell: true`, no command strings; names from the UI validated (`assertValidName`); deletes go to the trash.
- Explorer mutations (`fs:createFile`/`createDir`/`rename`/`trash`/`move`) only inside the view folder
  (`resolveInsideRoot`/`resolveEntryInsideRoot` in `fs/paths.ts`); `readFile`/`exists`/`readDir` stay free; `fs:writeFile` writes only inside the view folder or a file main read for that view (`fs/writeAccess.ts`).
- External links open in the browser (`setWindowOpenHandler`); no remote content in the window; CSP in `index.html`.
- `GIT_TERMINAL_PROMPT=0` for every git call (never hangs on credentials).

## Known Pitfalls

- **`ELECTRON_RUN_AS_NODE=1`** inherited from VS Code / Claude Code makes `require('electron')` plain Node (`app` is
  undefined). Run the app with `env -u ELECTRON_RUN_AS_NODE`.
- **pnpm only** (`nodeLinker: hoisted`, `allowBuilds` in `pnpm-workspace.yaml`); never commit a `package-lock.json`.
  Install quirks, ESM-only deps and native binaries (`asarUnpack`): `packaging-release` skill.
- **TypeScript 7 has no JS API** and `typescript-eslint` needs `typescript <6.1`: `typescript` is aliased to
  `@typescript/typescript6` (linter/editor tooling only) and TS 7 is installed as `typescript7`. Both register a `tsc`
  bin, so `pnpm exec tsc` is TS 6: always typecheck with `pnpm typecheck`.
- **`window.prompt()` doesn't exist in Electron**: use inline inputs or native dialogs through main.
- **No `StrictMode`** on purpose: the double mount breaks CodeMirror/xterm and loses the terminal's initial output.
- **react-hooks v7 rules** reject synchronous `setState` in effects: derive the value (e.g. "which query this result
  answers") or key the state by the entity it belongs to, instead of resetting it in the effect.
- **Ownership is per workspace view**, not per window: every watcher, pty, LSP server, Claude conversation, docker
  process, setting layer and session is keyed by the view `webContents` and dies with it. Never use
  `BrowserWindow.fromWebContents`/`getAllWindows` (use `windowOf(wc)`); process cleanup lives in `will-quit`, never
  `before-quit`.
- **Every disk write goes through `fs/atomicWrite.ts`** (`writeFileAtomic`/`writeFileAtomicSync`/`writeJsonAtomicSync`);
  never write a user/state file with a bare `writeFile`.
- **Tests run with hidden windows** (`WALPH_HIDDEN_WINDOWS=1`): the OS focus never changes (spy
  `BaseWindow.prototype.focus`), and native menu accelerators don't fire from synthetic keys (send `app:command` with
  `e2e/helpers.ts` `sendCommand`). Details in the `app-testing` skill.

## Domain guides

Each domain's rules and traps live in its skill; load it before touching that area. New pitfalls go to the domain
skill, never here (a new domain gets a skill and a row in this table).

| Domain | Skill | Never forget |
|---|---|---|
| Windows, workspaces, sessions, close/quit guard, hibernation, welcome screen | `workspaces` | the folder lives in main and is unique across all workspaces; gate work on `viewActive`, never `visibilitychange` |
| Commands, keybindings, `when` clauses, menus, settings and the Settings modal | `commands-settings` | effective keybindings and settings are owned by main; keys that execute things are user-only |
| Atomic writes, watcher echoes, git paths, network git, clone, search replace, encodings | `files-git-search` | repo root via `--show-cdup`, never `--show-toplevel`; `GIT_TERMINAL_PROMPT=0` |
| Language servers (main + editor extensions) | `lsp` | server output is untrusted; one applier for every `WorkspaceEdit` |
| Debugger (DAP client, launch.json, Run and Debug view, breakpoints) | `debugger` | adapter output is untrusted; every DAP request has a deadline; `debug.adapters` is user-only |
| Claude panel (SDK, permissions, questions, sessions, prompt, `/mcp`, status) | `claude-panel` | always pass `permissionMode`; never send a `dormant:` id to `api.claude.*` |
| Containers screen (docker CLI) | `containers` | every docker process is a process group owned by a view |
| Packaging, auto update, `walph` launcher, release | `packaging-release` | single instance per userData; native binaries in `asarUnpack` |
| UI text, languages, `workbench.language`, number/date formatting | `i18n` | pt-BR, en and es in the same catalog entry; `t()` at call time, never at module load |
| Editor groups, Markdown preview, themes, terminal links | `renderer-editor`, `renderer-styles`, `renderer-terminal` | one `EditorView` per group, one canonical state per tab |

## Claude Code Workflow

| Need | Command | Agents |
|---|---|---|
| Feature or fix (main, renderer or both) | `/task` | developer of each layer touched → reviewers → app-tester |
| Tests | `/create-tests` | test-creator |
| Review the diff | `/review-changes [base branch]` | reviewers of each layer touched |
| Audit the whole repo | `/audit [all\|architecture\|ipc\|store\|claude-setup]` (writes `AUDIT.html`) | Explore + reviewers |
| Ship | `/commit-and-push` · `/create-pr` · `/release [patch\|minor\|major]` (decides the bump from the commits when empty; check + `dist/` + tag, push only after confirmation) | — |
| UI/UX design or audit | — | uiux-expert |

Repository: private GitHub `filipe-campos/walph`.

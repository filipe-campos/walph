# Contributing to Walph

Thanks for your interest in Walph! This guide covers everything you need to build the app, make a change and get it
merged. By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

- Questions and ideas: [GitHub Discussions](https://github.com/filipe-campos/walph/discussions)
- Bugs and feature requests: [GitHub Issues](https://github.com/filipe-campos/walph/issues)
- Security issues: never open a public issue, follow the [security policy](SECURITY.md)

## Prerequisites

- **Node.js 24** (the version used by CI).
- **pnpm only.** The repository uses `nodeLinker: hoisted` and an `allowBuilds` list in `pnpm-workspace.yaml`. Never
  install with npm or yarn and never commit a `package-lock.json` or `yarn.lock`. The pnpm version is pinned in
  `package.json` (`packageManager`), so `corepack enable` picks the right one.
- **git** on the `PATH`.
- A C/C++ toolchain for native modules (`node-pty`): Xcode Command Line Tools on macOS, the "Desktop development with
  C++" workload on Windows, `build-essential` and `python3` on Linux.
- Optional: Docker (for the Containers screen) and the Claude Code CLI login (for the Claude panel).

## Setup

```bash
pnpm install      # installs deps, downloads the Electron binary, rebuilds node-pty
pnpm dev          # runs the app in dev mode (renderer HMR; main/preload changes restart the app)
pnpm dev <dir>    # same, opening a folder
```

`pnpm dev` uses its own data folder (`Walph-dev`), separate from an installed Walph.

> **Pitfall: `ELECTRON_RUN_AS_NODE`.** If you run commands from a terminal inside VS Code or Claude Code, the
> environment may contain `ELECTRON_RUN_AS_NODE=1`. Electron then starts as plain Node and the app crashes (`app` is
> undefined). Run the app with the variable removed:
>
> ```bash
> env -u ELECTRON_RUN_AS_NODE pnpm dev
> ```

## Project layout

Walph is an Electron app with three processes sharing one typed contract:

| Path            | What lives there                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `src/shared/`   | The contract between main and renderer (`types/`, one file per domain), commands and settings  |
| `src/main/`     | Main process: windows, native menu, IPC handlers (`ipc/<domain>.ts`) and pure logic per domain |
| `src/preload/`  | Exposes `window.api` through `contextBridge`. Forwards only, no logic                          |
| `src/renderer/` | React UI: zustand store and actions, commands, CodeMirror editor, xterm terminal, Claude panel |
| `e2e/`          | Playwright specs that launch the built app against a temporary repository                      |

A new capability always starts in `src/shared/types/<domain>.ts`, then gets an entry in the IPC spec (`src/shared/ipcSpec.ts`, from
which the typed channel maps and the preload bridge are generated), a main handler and finally a renderer action. See [docs/architecture.md](docs/architecture.md) for the full picture.

### The `.claude/` folder

Walph is developed with [Claude Code](https://claude.com/claude-code). The `.claude/` folder holds the project's
skills (detailed patterns per layer and domain), agents (developers, reviewers, test creator, app tester) and slash
commands. If you use Claude Code in this repository you get all of them automatically, and `CLAUDE.md` is loaded as
project instructions. If you don't, the skills under `.claude/skills/` are still the most detailed written reference of
the conventions and pitfalls of each area, so they are worth reading before touching one.

## Quality gate

```bash
pnpm check        # typecheck + lint + knip + docs:check + unit tests. Must be green with zero warnings
pnpm test:e2e     # builds the app and runs the Playwright suite
```

- `pnpm check` runs `pnpm typecheck` (TypeScript 7 for the node, web and e2e projects), `pnpm lint` (ESLint with
  `--max-warnings 0`, including the layer-boundary and import-cycle rules, plus `prettier --check`), `pnpm knip`
  (unused files, exports and dependencies), `pnpm docs:check` (paths cited in the docs) and `pnpm test` (Vitest).
- Always typecheck with `pnpm typecheck`. `pnpm exec tsc` resolves to TypeScript 6, which is installed only for the
  linter and editor tooling.
- Run `pnpm test:e2e` when your change touches behavior the E2E suite covers (windows, workspaces, editor, explorer,
  git, Claude panel and so on). On Linux, run it under Xvfb (`xvfb-run pnpm test:e2e`), as CI does.
- CI runs the full gate plus E2E on Linux and the unit tests on macOS and Windows for every pull request.
- New pure logic comes with a `.test.ts` next to it. New user flows should get an E2E spec in `e2e/<feature>.spec.ts`.

## Code style

- Prettier: no semicolons, single quotes, 120 columns, 2-space indent, no trailing commas. Run `pnpm format` to apply
  Prettier and the ESLint autofixes.
- Use `import type` for type-only imports, the `@shared/*` alias for the contract and relative imports inside each
  process.
- The whole codebase is in English: comments, test names, logs, docs and commit messages. Comments explain _why_, not
  _what_.
- **The app UI is translated into Brazilian Portuguese (the reference language), English and Spanish.** Every
  user-visible string (labels, menus, notifications, error messages thrown by main) lives in the catalogs in
  `src/shared/i18n/messages/`, with the three languages in the same entry. If you are not comfortable writing one of
  them, write your best attempt and mention it in the pull request so a maintainer can polish it.
- Colors come from CSS tokens only (`src/renderer/src/styles/tokens.css`); never hardcode a color.

## Commit messages

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <summary>
```

- **Types:** `feat`, `fix`, `hotfix`, `refactor`, `perf`, `test`, `chore`, `docs`.
- **Scope:** the area touched, for example `explorer`, `editor`, `search`, `git`, `terminal`, `ipc`, `ui`, `claude`,
  `build`.
- **Summary:** lower case, imperative mood, no trailing period.

Write the summary in English (older history is in Portuguese). Examples:

```
feat(explorer): add duplicate file action
fix(terminal): keep the cursor position after resize
fix(git): show the correct branch after checkout
```

## Pull requests

1. Fork the repository and create a branch from `main` (for example `feat/explorer-duplicate`).
2. Keep each pull request focused on one change. Open an issue or a discussion first for large features or architectural
   changes, so we can agree on the approach before you invest time in it.
3. Make sure `pnpm check` is green and, when relevant, `pnpm test:e2e` too.
4. Open the pull request against `main` and fill in the template: what changed, why, and how you tested it. Screenshots
   or a short recording help a lot for UI changes.
5. A maintainer will review it. Please keep the branch up to date with `main` and answer review comments in the thread.

## Security baseline

Walph runs untrusted content (repositories, language server output, docker output, Claude Code tool calls), so these
rules are not negotiable. Pull requests that break them will not be merged:

- `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false` on every web contents. Never change them.
- The preload only forwards calls through `contextBridge`. No logic and no raw Node or Electron APIs in the renderer.
- External processes run with `execFile`/`spawn` and an argument array. Never `shell: true`, never a command string,
  and `--` before any user input.
- Names coming from the UI are validated (`assertValidName`). Deletes go to the OS trash.
- Explorer mutations (create, rename, move, trash) only happen inside the workspace folder (`resolveInsideRoot` in
  `src/main/fs/paths.ts`).
- Every disk write goes through `src/main/fs/atomicWrite.ts`.
- Every git call runs with `GIT_TERMINAL_PROMPT=0`, so it never hangs waiting for credentials.
- External links open in the system browser. No remote content is loaded in the app window, and the CSP in
  `index.html` stays strict.
- Output from language servers, docker and the Claude SDK is untrusted and must be validated before use.
- Claude Code conversations always pass an explicit `permissionMode`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

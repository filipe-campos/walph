---
name: packaging-release
description: Packaging and release patterns: pnpm/Electron install quirks, native binaries and asarUnpack, single instance per userData, the generated walph launcher, auto update with electron-updater and the per-OS release workflow. Use when changing package.json dependencies, electron-builder.yml, electron.vite.config.ts, src/main/index.ts startup, ipc/cli.ts, ipc/update.ts or the release pipeline.
---

# Packaging and release

Run `/release` to ship; `pnpm dist` builds the installer for the current OS into `dist/`.

## Install and dependencies

- Electron 45 doesn't download its binary on install: `postinstall` runs `install-electron`.
- pnpm (`packageManager` pinned): `pnpm-workspace.yaml` sets `nodeLinker: hoisted` (flat `node_modules` like npm;
  electron-builder and `asarUnpack` expect it) and `allowBuilds`. A new dependency with install scripts is ignored until
  it's approved there (`pnpm approve-builds`). Never commit a `package-lock.json`.
- ESM-only deps in main that break with `require` must be bundled via `main.build.externalizeDeps.exclude` in
  `electron.vite.config.ts` (none today).
- Renderer-only packages (CodeMirror, `emmet`, `@emmetio/html-matcher`) are bundled by Vite and live in
  `devDependencies`; only what main loads at runtime goes in `dependencies`. `emmet`'s `exports` has no `types`, so
  `tsconfig.web.json` maps it in `paths` to `node_modules/emmet/dist/index.d.ts`.
- `@types/node` follows the Node bundled by Electron (Electron 45 = Node 24.x, so the `^24` major), not the latest major.
- Bumping `@codemirror/*` can leave nested copies of `@codemirror/view` (typecheck fails with "separate declarations of a
  private property"): run `pnpm dedupe`, then reinstall and delete the `*.tsbuildinfo` files.
- Native binaries (node-pty, ripgrep, the Claude CLI) must be listed in `asarUnpack` in `electron-builder.yml`.
- electron-builder always drops `*.d.ts` (and other `excludedExts`) from `node_modules`; a `files` pattern can't bring
  them back, only the `onNodeModuleFile` hook (`scripts/keep-tsserver-libs.mjs` keeps the tsserver `lib.*.d.ts`;
  without them every built-in type is missing). `e2e/packaged.spec.ts` checks they are packaged.

## Packaging

- The app is **single-instance per userData** (`requestSingleInstanceLock` in `index.ts`): a second launch forwards its
  argv to `second-instance` (Chromium injects flags BEFORE the script path in unpackaged runs; `folderFromArgv` drops
  flags, then skips the entry) and exits; this is what makes `walph .` open the folder in the running app.
- Unpackaged runs without `--user-data-dir` use `<appData>/Walph-dev` (the installed app keeps `Walph`).
- The packaged app (macOS/Linux) merges the login-shell PATH into `process.env.PATH` before restoring windows
  (`env/loginPath.ts`, 2 s cap, applied later if slower).
- The `walph` launcher (`cli/launcherScript.ts`, `ipc/cli.ts`) is a GENERATED script with a marker embedding the
  executable path (`$APPIMAGE` on Linux); a file without the marker is never overwritten without confirmation nor
  removed; macOS admin writes go through `osascript` with paths as argv; installing from a DMG/translocated path is
  refused.
- Auto update (`ipc/update.ts`, `electron-updater` loaded lazily) exists only when packaged with the user-only
  `update.enabled`/`update.channel`; `update:install` arms a flag and calls `app.quit()` (the dirty guard can veto;
  `onQuitCancelled` clears the flag) and `quitAndInstall(true, true)` runs in `will-quit`.
- Setting `autoUpdater.channel` forces `allowDowngrade = true`; reset it.
- Native binaries of other platforms/arches don't get bundled: each OS is built on its own runner (`release.yml`, draft
  created once, then published). The draft job first waits for the tag commit's `ci.yml` run and fails unless it is
  `success` (it filters `--event push`, so the nightly runs never count); the `ci.yml` unit jobs on macOS/Windows also
  run `pnpm build`.
- `ci.yml` layout: `check` (typecheck, lint, knip, docs, coverage with thresholds), `e2e-linux` (3 Playwright shards),
  `unit` (macOS/Windows `pnpm test` + `pnpm build`); nightly and `workflow_dispatch` add `e2e-desktop` (full E2E on
  macOS/Windows) and `packaged` (`electron-builder --linux --dir` + `e2e/packaged.spec.ts`). Shared setup lives in
  `.github/actions/setup/action.yml` (`electron-display: 'true'` for Linux jobs that open the app). The concurrency
  group includes the event name so a nightly run never cancels the push run the release gate needs.
- Tests of the packaged app: `WALPH_PACKAGED_EXE=<exe> pnpm exec playwright test e2e/packaged.spec.ts`.

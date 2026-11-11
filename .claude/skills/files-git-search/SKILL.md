---
name: files-git-search
description: Disk, git and search patterns in main: atomic writes, the editor saves coming back through the watcher, git paths in the window folder path space, network git and clone, the shared search replace engine and text encodings. Use when creating or reviewing code that writes files, runs git, searches/replaces, or reads text that is compared with an editor tab.
---

# Files, git and search

Main owns every disk write and every git/rg process; the renderer never decides a path outside the view folder.

## Atomic writes

- **Every disk write goes through `writeFileAtomic`/`writeFileAtomicSync`/`writeJsonAtomicSync`** (`fs/atomicWrite.ts`):
  hidden `.<name>.walph-<12 hex>.tmp` in the target's folder (`wx`), keeps the existing `mode`, follows a symlink target
  (the link stays a link; `followSymlinks:false` for the `walph` launcher), removes the tmp on failure, retries
  EPERM/EBUSY on Windows. Both variants `fsync` the tmp (`handle.sync()` / `fsyncSync(fd)`) before the rename,
  tolerating `EINVAL`/`ENOTSUP`/`ENOSYS` (filesystems without fsync: logged once, the save continues). Only the async
  variant also syncs the parent folder after the rename (POSIX, best effort: its errors are ignored); the sync variant
  runs on the main thread for frequent small state files and skips it. The existing-file info and the mode choice are
  shared helpers (`existingInfo*`, `pickMode`): never duplicate them between the async and sync paths.
- That includes the editor's `fs:writeFile` (the inode changes: hardlinks stop sharing). It is gated first by
  `assertWritable` (`fs/writeAccess.ts`: inside the view folder, or a file `fs:readText` returned to that view; see
  `main-ipc` Security): a new code path that reads a file into a tab must go through `fs:readText`, never `readFile`.
- The workspace watcher drops those tmp names (`isAtomicTempPath` in `classifyBatch`) and LSP `fileChanges` skips `add`
  of a mirrored doc.
- **Creating a NEW file** (explorer "new file", the settings templates) uses `createFileExclusive(path, data, { mode })`
  (`O_EXCL`, creates the parent, an occupied target throws `AlreadyExistsError`: match the type, not the text). The only
  raw `writeFile`/`appendFile` in `src/main` live in `fs/atomicWrite.ts` and tests.
- Never write a user/state file with a bare `writeFile`.
- **Translating a write failure** (`EACCES`, `ENOSPC`, `EISDIR`…) is `describeWriteError(err, path, { overrides, fallback })`
  (`fs/describeWriteError.ts`): `overrides` maps an errno to a ready message (e.g. `ENOENT` -> "file gone" in the replace
  engine), `fallback(name, message)` formats unknown errors (default: keep the original error). Never write a local
  errno `switch` for writes. Reads, listings and creation use `describeFsError(err, path)` (`fs/describeFsError.ts`, same
  idea for ENOENT/EEXIST/EACCES…); both return a `UserError`.
- The workspace settings file is written/created through `resolveSettingsWriteTarget` (`settings/writeSetting.ts`): it
  rejects a workspace-settings directory or file link that leaves the folder before anything is created.
- **Reading text for the editor** (`readTextFile`) opens with `O_NONBLOCK`, `fstat`s the handle (`!isFile()` is refused:
  a FIFO/socket would pin a libuv thread) and reads capped (`readCapped`, shared with `readImageFile`).

## The editor's own saves

- **The editor's own saves come back through the watcher** (`WorkspaceChange.files`): the renderer compares the disk
  text with the tab's saved baseline (EOL-normalized) and ignores matches; never treat every `change` as external.
- Anything that rewrites the text at save time (whitespace transforms, EditorConfig) runs before `saveDocument` takes
  the new baseline (`renderer-editor` skill, "Save pipeline"); changing the text after it would make the echo look
  external.
- `.editorconfig` files are read through `fs.exists` + `fs.readFile` (reads are free; `exists` first so a missing file
  is not a rejected IPC per folder), walking up from the file's folder until `root = true`; the renderer caches them per
  folder and drops an entry when the workspace watcher reports that file.

## Git paths and network git

- Git handlers are wiring: `ipc/git.ts` is `ownRoot` + a handle table; the work is in `git/ops/{status,history,stash,
  branches,worktree}.ts` (writes take `(sender, root, rawArgs)`, reads take `(root, rawArgs)`; `status` also takes `sender`). Argument checks are in `git/validateArgs.ts`
  (`repoRelative`, commit hashes…), the repo root in `git/repoTop.ts` (over `repoTopCache.ts`), the ignored list in
  `git/ignoredCache.ts` (TTL 10 s), `HEAD` detection in `git/hasHead.ts` and the quit sweep in `git/killAll.ts`.
- The file list for Quick Open is `files/fileListCache.ts` (`getFileList`, one rg run per root shared by concurrent
  calls; `invalidateFileList` is called by the tree watcher on structural changes).

- **Git paths live in the window folder's path space:** the repo root comes from `rev-parse --show-cdup` resolved against
  the window folder, never `--show-toplevel` (it resolves symlinks, e.g. macOS `/tmp` and `/var`, and the renderer's
  paths don't).
- Commands taking repo-relative paths run with `cwd` = repo root (the folder may be a subfolder). git runs with
  `LC_MESSAGES=C` so `gitErrors.ts` can classify stderr into translated messages; pull/push/sync use `ssh -o BatchMode=yes`
  (unless the user configured SSH) and an explicit `<remote> HEAD:<upstream>` refspec.
- Code that decides by the exit code (e.g. `claude/gitExclude.ts`, `check-ignore`) uses `gitStatusCode(cwd, args, { timeoutMs })`
  from `git/run.ts` (same env as `git()`, never rejects, `-1` = did not run); a git process spawned outside `git/run.ts` is
  forbidden.
- Every git call in `git/run.ts` is one `runCollect` (`process/runCollect.ts`) plus a classifier (`runRaw`: cancelled /
  timeout / spawn error / overflow / exit code → `GitCommandError`); there is no second runner. Network git (pull/push/sync,
  owned per view; `git/remote.ts`) and clone
  (`git/clone.ts`) are process-group leaders (`process/spawnGroup.ts`): the 10-minute timeout and a view reset (reload,
  crash, close; `onViewReset`) kill the whole tree (ssh, git-remote-*), not just `git`.
- **Owned local mode:** every command that changes the repo (`commit`, `switch`, `stash` incl. pop/apply/drop/push, `add`,
  `restore`, `rm --cached`, `reset`, `update-ref`, `init`) passes `{ localOwner: sender }` to `git()`/`runGit()`
  (`git/run.ts`): same process-group path as network git (registry `ownedProcs`, `onViewReset`, eviction guard
  `hasOwnedGit`, `killAllOwnedGit` at `will-quit`) with a 5-minute timeout and the translated
  `git.errors.timeout`/`cancelled`; no SSH tweaks. These processes are `graceful` (`spawnGroup(..., { graceful })`):
  view reset and timeout call `proc.terminate()` (`process/tree.ts` `killLiveTreeGracefully`: SIGTERM to the group /
  `taskkill /T`, SIGKILL / `/F` after 4 s) so git removes `index.lock` and undoes half-done work. At `will-quit`
  `kill(true)` cannot wait, so graceful procs get a synchronous SIGTERM and the others (network, docker) SIGKILL. Only
  read-only plumbing runs without an owner (still a process group, so aliases and filters die with it), with a 60 s timeout and a 64 MiB stdout cap that fails
  (owned modes truncate at 16 MiB instead). A new mutating command must pass
  `localOwner`.
- Git failures are `GitCommandError` (`git/gitErrors.ts`): `message` is classified/translated, `stderr` is the raw git
  output, `aborted` marks timeout/cancel. Decide on `stderr`, never on the message, and never retry-on-catch when
  `isAbortedGit(err)` (`statusOnce`, `unstage`).
- `git show`/`baseline` map to `''`/`null` only when `isPathNotInRefError` (raw stderr, `git/gitErrors.ts`) matches the "path not in ref"
  stderr; any other failure is rethrown. Repo-relative paths come from `pathTail(top, path, { strict: true })`, never
  `relative()` + `startsWith('..')` (a file named `..foo` is inside).

## Clone

- `git:clone` validates with `git/cloneUrl.ts` (`resolveCloneUrl` lowercases the scheme; `GIT_ALLOW_PROTOCOL=https:ssh`
  is case-sensitive; `file://` only in test mode), shows the destination dialog itself (the renderer never sends a
  destination), creates the folder with a NON-recursive `mkdir` so cleanup (cancel, failure, view navigate/destroy,
  `will-quit` via `rmSync`) only ever removes a folder the clone created; one clone per view, slot taken before the
  dialog.
- The SSH-configured check for clone reads only global/system config.

## Search replace

- Every `rg` run (`ipc/search.ts`, `files/fileListCache.ts`) goes through `search/rg.ts` `runRg` (base args, 8 KiB stderr head, exit
  code 1/2 semantics, `describeRgSpawnError`); a search is owned by its view through `searches.scope(wc)`.

- Search results leave main sorted with `comparePaths` (`shared/pathCompare.ts`): rg scans in parallel, so arrival
  order changes between runs. Any list of paths that needs a stable cross-OS order uses `comparePaths`, never `<` on the
  raw string (`\\` and `/` sort differently against letters).
- **Search replace engine is shared** (`shared/searchReplace.ts`): main uses it for disk, the renderer for the preview
  and dirty tabs.
- A match is replaced only if its line still equals `match.text` (dirty buffers first go through `relocateMatches`); the
  JS regex gets rg's Unicode `\w`/`\d`/`\b` via `toUnicodeClasses`, and when that's impossible non-ASCII lines are
  skipped rather than risking different groups.
- `src/shared/*.test.ts` run only in the `node` project (excluded from `tsconfig.web.json`).

## Encodings

- `main/fs/encoding.ts` detects only by BOM (no heuristics; Windows-1252/Latin-1 only when the user chooses, own tables,
  no ICU).
- `fs.readFile`/`readText` strip the BOM; a file tab reads with `readText` and saves with `writeFile(…, tab.encoding)`,
  and every other reader that compares with a tab (git `show`/`baseline`/`commitDiff` via `gitFileText`, Claude
  proposals via `readTextDetailedOrNull`, `applyWorkspaceEdit` unloaded files) decodes the same way; a user-chosen
  encoding (`forcedEncodingFor(path)`) is passed to `git.show`/`baseline`.
- `writeFile` encodes before touching the disk (unencodable char → translated error, nothing written); a UTF-16 BOM exempts
  the null-byte binary check; UTF-16 files get the generic Claude `tool` card (the CLI writes them).
- `search.replace` still refuses non-UTF-8.
- The preload gets the home dir via `--walph-home=` (`additionalArguments`).
- Toggling the EOL dirties a tab without changing its text (`markFormatDirty`/`formatDirtyEol` in `diskSync.ts`): `replaceDocument`
  dispatches synchronously into `setDirty`, so clear the tab's dirty/format state BEFORE replacing.

## Hunks, conflicts and blame

- **Stage/unstage by hunk or by selected lines** (`git:stageRanges`/`git:unstageRanges`, `git/ops/ranges.ts`): the
  renderer sends only repo paths + 1-based line ranges of the *new* side (working tree for stage, index for unstage);
  main reads both sides itself (`git cat-file blob`, disk), picks the target with `selectLines` (`shared/hunkSelection.ts`
  over `shared/lineDiff.ts`, the same Myers diff as the editor gutter) and builds a unified patch
  (`git/rangePatch.ts`) applied with `git apply --cached -` through stdin (`runGit(..., { input })`, `localOwner`).
  `git apply` checks the index preimage, so a stale request fails instead of corrupting the index. Text is handled as
  `latin1` (1 char = 1 byte): any ASCII-compatible encoding and BOMs round-trip; NUL bytes (binary, UTF-16) are refused.
  Lines compare without their EOL (CRLF = LF) but a missing final newline differs; an LF index never receives CRLF lines.
  Untracked/conflicted/deleted files fall back to whole-file `stage`/`unstage`.
- **Stage from the editor saves first** (main reads the disk); **revert never runs git**: in a loaded tab it edits the
  buffer (`applyTabEdits`, undoable, not saved); from the diff editor it edits+saves a clean loaded tab, refuses a dirty
  one, or `readText` + `writeFile` (atomic, write-access gated) after a confirmation.
- **Conflicts**: `isConflictStatus` (`shared/gitStatusCodes.ts`) is the only porcelain conflict check (Git view "Merge
  Changes", `discardTargets`). `GitStatus.operation` comes from markers in the git dir (`findGitDir`, cached like the repo
  top: `rebase-merge`/`rebase-apply`/`MERGE_HEAD`/`CHERRY_PICK_HEAD`/`REVERT_HEAD`); `git:abortOperation` runs the
  matching `--abort`. `git:show` accepts `OURS`/`THEIRS` (`:2:`/`:3:`) for "Compare Changes" (`DiffTab.mergeCompare`,
  never persisted). Marker parsing is `lib/mergeConflicts.ts` (pure); the editor extension is `editor/mergeConflicts.ts`.
- **Blame** (`git:blame`, `git/parseBlame.ts`): `--porcelain`, with `--contents -` (stdin) only when the tab is dirty.
  The renderer (`gitBlameActions.ts`) refetches only on HEAD change, save (dirty → clean) or a text change with a clean
  tab (load/disk reload); between fetches `editor/gitBlame.ts` maps marks through edits and re-diffs the blamed text
  against the buffer (debounced), so edited lines become "not committed yet". No blame per keystroke.

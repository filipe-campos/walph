---
description: Bumps the version (patch/minor/major, decided from the commits when not given), runs the checks, builds the installer into dist/ and tags the release
argument-hint: '[patch|minor|major] (empty = decide from the commits)'
---

# 🚀 Release

Create a new Walph version: decide the bump, update `package.json`, run the checks, build the installer for the
current OS into `dist/`, commit and tag. Requested bump: `$ARGUMENTS` (empty = decide).

Talk to the user in pt-BR. Stop and report at the first failure — never leave a half-made release behind (see
"Rollback").

## 1. Preconditions

Stop and report if any of these fails:

- Branch is `main` (`git branch --show-current`).
- Working tree is clean (`git status --porcelain` empty) — uncommitted work would not be in the release.
- In sync with the remote: `git fetch origin` then `git status -sb` shows neither `ahead` nor `behind`. Ahead → tell
  the user to push first (`/commit-and-push`); behind → pull first.
- `$ARGUMENTS` is empty or exactly one of `patch`, `minor`, `major`. Anything else: stop and show the usage.

## 2. Current version and changes

- Current version: `node -p "require('./package.json').version"`.
- Last release tag: `git describe --tags --abbrev=0 --match 'v*'` (may not exist).
  - If the tag exists and differs from `v<package.json version>`, stop and report the mismatch (the release workflow
    requires the tag to match `package.json`).
  - If the tag `v<new version>` already exists (step 3), stop.
- Commits in the release: `git log <last tag>..HEAD --format='%h %s%n%b'` (no tag yet → `git log --format=...` of the
  whole history). **No commits since the last tag → stop: nothing to release.**

## 3. Decide the bump

If `$ARGUMENTS` is given, use it. Otherwise decide from the commit subjects/bodies (convention in
`.claude/git/commit.md`):

| Signal in any commit since the last tag | Bump |
|---|---|
| `BREAKING CHANGE` in the body, or `!` before `:` in the subject (`feat(ipc)!: …`) | **major** |
| `feat(…)` | **minor** |
| only `fix`, `hotfix`, `refactor`, `perf`, `chore`, `docs`, `test`, `style` | **patch** |

- Use the highest bump found. A commit outside the convention: judge it by what it changed (new user-visible capability
  → minor; correction → patch) and say so in the summary.
- **Before 1.0.0** (major is `0`): a breaking change bumps **minor**, not major (SemVer 0.x). Only go to `1.0.0` when the
  user asks for `major` explicitly.
- New version = current version with the bump applied (patch: `x.y.z+1`; minor: `x.y+1.0`; major: `x+1.0.0`). Drop any
  prerelease suffix.

Show the user, before changing anything: current version → new version, the chosen bump and **why** (the commits that
decided it), and the list of commits grouped as Features (`feat`) / Fixes (`fix`, `hotfix`) / Other. Then go on
— the bump decision does not need confirmation (only the push in step 6 does).

## 4. Bump and verify

1. `npm pkg set version=<new version>` (changes only `package.json`; pnpm's lockfile does not store the root version).
2. `CI=true pnpm install --frozen-lockfile` — the changed `package.json` makes pnpm re-check the install before the next
   `pnpm` script, and without `CI=true` that install waits for a confirmation nobody can answer (it hung the 0.2.0
   release). Should print "Already up to date".
3. `CI=true pnpm check` — typecheck + lint + docs:check + tests, zero warnings. On failure: rollback and report.

## 5. Build the installer

```bash
rm -rf dist
CI=true env -u ELECTRON_RUN_AS_NODE pnpm dist --publish never
```

- `CI=true`: same reason as step 4 (no interactive pnpm prompt). `--publish never`: the local build never uploads anything (publishing is the job of `release.yml` on the tag).
- Builds only for the **current OS/arch** (native binaries — node-pty, ripgrep, the Claude CLI — are per platform;
  the other OSes are built by the CI on the tag).
- macOS: without `CSC_LINK`/`CSC_KEY_PASSWORD` (or a certificate in the Keychain) and the notarization variables the
  app comes out unsigned — fine for local testing, mention it in the report.
- On failure: rollback and report the relevant part of the electron-builder output.
- List what was produced: `ls -lh dist/ | grep '<new version>'` (installers named `Walph-<version>-<os>-<arch>.<ext>`).

## 6. Commit, tag and (with confirmation) push

1. Commit only `package.json`, message per `.claude/git/commit.md` plus the attribution lines from the system:
   `chore(build): bump version to <new version>` — body: the grouped commit list from step 3.
2. Annotated tag on that commit: `git tag -a v<new version> -m "v<new version>"`.
3. **Ask the user** (AskUserQuestion) whether to push now. Explain: pushing the tag starts `.github/workflows/release.yml`,
   which builds macOS/Windows/Linux and **publishes** the GitHub Release (and the auto update serves it to installed
   apps). Its first step waits for the `ci.yml` run of the tag commit and aborts unless it is `success`, so `main` must
   be pushed first and its CI must be green.
   - Yes → `git push origin main` then `git push origin v<new version>`; report the Actions URL
     (`gh run list --workflow release.yml --limit 1`).
   - No → leave commit and tag local; tell the user the two push commands to run later.

## Rollback

If anything fails after step 4.1 and before the commit: `git checkout -- package.json` and `rm -rf dist`. After the
tag was created but before pushing, a failure needs `git tag -d v<new version>` and `git reset --hard HEAD~1` — only do
it after telling the user. Never delete a tag that was already pushed.

## Report

Short, in pt-BR: old → new version and why; check result; artifacts in `dist/` (name and size) and whether they are
signed; commit hash and tag; pushed or not (and the release workflow link if pushed).

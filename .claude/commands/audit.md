---
description: Audits the whole repository (or one area) against the project standards and writes a prioritized improvement plan to AUDIT.html
argument-hint: '[all|architecture|ipc|store|claude-setup] (empty = all)'
---

# 🔍 Audit

Audit the **whole codebase** (not the diff) for the scope `$ARGUMENTS` (empty = `all`). Be thorough: depth over speed.
Use subagents (Explore, or the reviewer agents on a list of files) to cover large areas in parallel.

## Scopes

- **architecture**: adherence to `CLAUDE.md` and the skills (the IPC path contract → spec → handler → usage, `ipc/*`
  as wiring only, store and component organization, tokens-only styling); the process boundary (Node leaking toward
  the renderer, business logic inside components instead of action modules or `lib/`); resource ownership per
  workspace view; decisions that will hurt as features grow (global singletons, single-window or single-workspace
  assumptions).
- **ipc**: think like a senior Electron security architect. For every channel in `src/shared/ipcSpec.ts`: the 4 steps
  exist and their signatures match; inputs validated in main; no `shell: true` or command strings; events go to the
  requesting view; processes and watchers are released; errors reach the user translated. Skills `main-ipc`,
  `main-processes`, `i18n`. Add a table `canal | camadas ok | problemas | severidade`.
- **store**: think like a senior frontend architect. `store.ts`, the action modules beside it and every component that
  uses `useStore`: broad selectors (lists, keystrokes), async actions without stale-context guards, state in the wrong
  place, actions without error handling, the skill's Quick Index out of date. Skill `renderer-store`.
- **claude-setup**: `CLAUDE.md` and `.claude/` (skills, agents, commands, `git/`). Run `pnpm docs:check` first: every
  path it reports is an item (a path cited on purpose without existing goes to `NOT_REPO_PATHS` in
  `scripts/check-doc-paths.mjs` instead). Also look for rules that contradict each other or the code.
- **all**: the four above plus security, resource leaks, cross-platform issues, performance and UX.

## Output

Write `AUDIT.html` at the project root, in English: each item classified by impact (🚨 high / ⚠️ medium / 💡 low),
with `file:line` or the affected module, the violated standard or risk and an objective fix, grouped into tasks in
execution order that say which agent does each one (**main-developer**, **renderer-developer**, **test-creator**,
**uiux-expert**). Change no code. Finish with a short summary in Portuguese.

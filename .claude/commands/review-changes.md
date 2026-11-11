---
description: Reviews the current changes (git diff) with the project reviewers of each layer touched
argument-hint: '[base branch] (empty = uncommitted changes)'
---

# 🔎 Review Changes

Review the changes with the project's review agents. Scope: `$ARGUMENTS` empty → uncommitted changes (`git status`,
`git diff`, `git diff --cached`, untracked files); a branch name → also `git diff <branch>...HEAD`. Pass the base
branch to the agents when given.

- `src/main/`, `src/preload/` or `src/shared/` → **main-code-reviewer**
- `src/renderer/` → **renderer-code-reviewer**
- Build/config (`electron.vite.config.ts`, `electron-builder.yml`, `package.json`, `tsconfig*.json`, `.github/`,
  `.claude/`) and `e2e/` → review them yourself (correctness, security, cross-platform, consistency with the stack and
  with `CLAUDE.md`)

Launch the agents of every scope touched **in parallel**. Then consolidate the findings into one prioritized list
(🚨 critical / ⚠️ important / 💡 suggestion), with `file:line` and an objective fix. Respond in Portuguese.

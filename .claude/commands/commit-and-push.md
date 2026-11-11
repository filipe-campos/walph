---
description: Runs the checks, commits following .claude/git/commit.md and pushes to GitHub
---

# ✈️ Commit and Push

Based on the standards in `.claude/git/commit.md`, **commit** and **push** everything shown in `git status`.

Before committing:
1. Run `pnpm check`. If it fails, stop and report.
2. Make sure no secrets, `.env` files, `out/`, `dist/` or `node_modules/` are staged.

If the branch has no upstream, push with `git push -u origin <branch>`. The remote is the private GitHub repository
`filipe-campos/walph`.

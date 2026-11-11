---
description: Opens a GitHub pull request for the current branch using the .claude/git/pr.md template
argument-hint: "[feature name]"
---

# 🔀 Create Pull Request

## Details

$ARGUMENTS

## Instructions

1. Make sure the branch is pushed (otherwise run `/commit-and-push` first). Never open a PR from `main`.
2. Collect the changes: `git log main..HEAD --oneline --no-merges` and `git diff main...HEAD --stat`.
3. Fill the template in `.claude/git/pr.md` (in English) and create the PR:
   ```bash
   gh pr create --repo filipe-campos/walph --base main --head <branch> --title "<title>" --body-file <tmp-file>
   ```
   Title follows the commit pattern of `.claude/git/commit.md` (e.g. `feat(claude): command registry and command palette`).
4. Show the PR link to the user.

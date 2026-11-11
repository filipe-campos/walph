---
description: Implements a task (feature or fix, in main, renderer or both) with the developer agents, reviews it and verifies it in the app
argument-hint: '[task description]'
---

# 🚀 Task

## Task Details

$ARGUMENTS

## Execution

### 1. Plan

Read the task and map which layers it touches (`src/main` + `src/preload` + `src/shared`, `src/renderer`, tests only)
and which domain skills apply (table "Domain guides" in `CLAUDE.md`). When the task lists several independent items,
treat each one as its own unit with its own layers. A task that is small and clear can be done directly, without agents;
use the agents when it is larger or touches several areas.

### 2. Implement

- **Main only** → **main-developer**. **Renderer only** → **renderer-developer**. **Tests only** → **test-creator**.
  **Interaction design needed first** (new screen, unclear UX) → **uiux-expert** in Design mode, then implement its spec.
- **Both sides**: write the contract first (`src/shared/types/<domain>.ts` + the entry in `src/shared/ipcSpec.ts`), then
  give the main part to **main-developer** and the UI part to **renderer-developer**, in parallel when the UI depends
  only on the contract, main first otherwise. Then run `pnpm typecheck` and close the integration gaps.
- Give each agent the full text of its items, the domain skills to load and the acceptance criteria. Independent units
  run in parallel (one message, several agents).

### 3. Review

Run `/review-changes` (reviewers by the layers touched, in parallel). Fix 🚨/🔴 findings, through the developer agent of
the layer when the fix is not trivial, and re-run `pnpm check` until it is green with zero warnings.

### 4. Verify

For user-visible behavior, give the acceptance criteria to **app-tester**. Pure logic without tests goes to
**test-creator**.

### 5. Report

Do not commit (the user runs `/commit-and-push`). Summarize in Portuguese: what was done per item, what was deferred
and why, the review and verification results.

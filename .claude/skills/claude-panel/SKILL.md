---
name: claude-panel
description: Patterns of the Claude Code panel: Agent SDK conversations owned per view (src/main/claude, ipc/claude.ts), permission/question/elicitation cards, sessions (favorites, titles, rewind), prompt attachments and the / menu, the /mcp manager, session status and OS notifications, and the fake SDK for E2E. Use when creating or reviewing anything in src/main/claude, ipc/claude.ts, components/claude or the renderer `claude*.ts` modules.
---

# Claude panel (`src/main/claude`, `components/claude`)

Main runs the Agent SDK; the renderer (the `claude*.ts` modules in `src/renderer/src`, `components/claude/`) only renders events and answers
requests. Everything from the CLI, the SDK, MCP servers and Claude itself is untrusted.

## Conversations and the CLI

- Main runs `@anthropic-ai/claude-agent-sdk` (pinned exact; ESM-only, kept external and loaded with a lazy native
  `import()` in `claude/sdk.ts`; its CLI is a native binary in a per-platform optional package, unpacked via
  `asarUnpack` and spawned by `claude/spawn.ts` through `spawnGroup` (process group, registry swept at `will-quit`; spawn.ts only keeps
  the stderr tail and the SDK abort).
- Expected conversation failures (closed, `/usage` timeout) are `ConversationError` with a `code`
  (`claude/conversationError.ts`; also `invalidReport`); never classify an error by its translated text.
- Each conversation (`claude/conversation/conversation.ts`) is owned by its `webContents` and dies on folder change,
  reload, close and quit; termination signals call `app.quit()` (SIGKILL can't be handled).
- `ipc/claude.ts` is channel wiring only. The domain lives beside the conversation: `claude/registry.ts` (conversations
  per view on `createViewRegistry`, editor contexts, attachment allowlists, session events `onClaudeSessionEvent`,
  `sessionStatesOf`/`markAllRead`/`updateBadge`, `killAllClaude`, `restartAllOf`, `registerClaudeLifecycle`),
  `claude/conversationDeps.ts` (`createConversationDeps`: the view side of `ConversationDeps`; the LSP diagnostics are
  injected by the handler, the domain never imports `ipc/lsp`), `claude/authCli.ts` (`claude auth …` runs, login
  terminal source), `claude/sessions.ts` (history, meta, fork, export), `claude/attachmentPicker.ts`,
  `claude/stores.ts` (`sessionMeta()`, `favoriteCommands()`) and `notifications/sound.ts`
  (`requestNotificationSound`). Nothing outside `index.ts` imports `ipc/claude`; other main code imports the registry.
- A conversation leaves its view in ONE way: `removeConversation(wc, conversation)` (registry `delete` + `retire`:
  system notification closed, badge, `removed` event emitted once + `close()`). A view reset goes through the
  registry's `dispose`, which retires the same way, so a `claude:start` that fails after the reset must not emit again
  (`delete(wc, id, expected)` returns false). Never delete from the registry by hand.
- `claude/conversation/` splits the conversation by responsibility; `conversation.ts` is the facade that wires them:
  `run.ts` (`RunManager`: launch, stop, sleep, `ensureRun`, `trackStopping`; the CLI process of the conversation, never
  two at once), `messageRouter.ts` (SDK message to ordered `RouteOp[]`: events and state changes in one list because
  their order is observable; no SDK, no state of the conversation, tested in `messageRouter.test.ts`), `idlePolicy.ts`
  (when the CLI may sleep; timers only, like `lsp/idlePolicy.ts`), `controls.ts` (permission mode, bypass, model,
  effort and the `overrides` the CLI `init` must not undo), `checkpoints.ts` (rewind, fork), `interrupts.ts`,
  `send.ts` (`sendPrompt`), `commandCatalog.ts` (the `/` menu list), `history.ts` (resume), `mcpConnect.ts` (wait for
  MCP servers after a launch), `data.ts` (session data shared by the facade and the checkpoints), `deps.ts`
  (`ConversationDeps`). The `/mcp` calls go through the read-only `conversation.mcp` (`McpController`). Renderer args are parsed in `ipc/claude.ts` (`parseTaskId`, `parseModel` in `validate.ts`; `parseServerName`, `parseMcpEnabled`, `parseMcpScope`, `parseCallbackUrl`, `validateMcpServerInput` in `mcp.ts`): conversation and controller methods take typed args.
- Always pass `permissionMode` explicitly (omitted = `auto`); `settingSources` = user+project+local (repo `.claude/`
  settings, hooks and MCP apply, like running `claude` in the folder).
- `claude.initialPermissionMode`, `claude.executable` and `claude.env` are user-only.
- The Claude process gets the login-shell PATH (`env/loginShell.ts`, cached per shell only on success, 5 s timeout).
- Conversation, `claude mcp …` and `claude auth …` share ONE context: `claude/cliContext.ts` `resolveCliContext(settings,
  cwd, loginPath?)` (login PATH + `claude.executable` + `claude.env`, `WALPH_FAKE_CLAUDE*` stripped); never rebuild the env or
  resolve the executable inline. A `.js` executable is refused with `assertRunnableBinary` (`env/executable.ts`).
- `claude/pushStream.ts` `PushStream` is the only async queue: `end()` closes, `fail(err)` drains the queued items and then
  rejects the consumer (the fake SDK's outbox uses it). Deadlines on SDK calls use `util/deadline.ts`
  (`rejectAfter` for MCP calls, `withDeadline` + `TIMEOUT` for status/usage/context).
- Edits in the default permission mode (ask before editing) go through `canUseTool` → `kind:'edit'` (`claude/proposeEdit.ts` computes the
  proposal; outside the folder/unreadable → generic `tool` card) → renderer diff tab (`DiffTab.proposal`) → the CLI
  writes and the clean tab reloads through the watcher.
- Accept always rechecks the disk against `original` (and a dirty tab is saved or reverted first); never write into a
  dirty buffer.
- Paths from Claude go through `resolveInsideRoot` (`fs/paths.ts`: lexical + `realpath`, returned in the window folder's
  spelling).
- The CLI emits one `assistant` message per content block and `init` twice; main emits exactly one `result` per turn
  (the renderer's "Na fila" queue and partial-stream flush key on it).
- Deltas are batched per animation frame in `claudeEvents.ts`.
- The in-process MCP server `walph` (`claude/ideServer.ts`) is in `allowedTools`: the SDK's
  `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` warning is expected (`openDiff` has its own approval).

## Renderer modules (`src/renderer/src/claude*.ts`)

Flat modules beside `store.ts`, listed in dependency order: each imports only modules above it in this table, so there are no cycles (only cycles are lint-enforced, not the order). Components import from
the owning module, there is no barrel.

| Module | Owns |
|---|---|
| `claudeState.ts` | `bridge` (`liveClaudeApi`), `failed`, `patchClaude`, `findConversation`, `updateConversation`, `activeConversation`, `liveConversationId` (`null` for dormant tabs: never sent to IPC), `optimisticPatch` |
| `claudePromptBridge.ts` | `PromptHandle` registry: lets actions insert text into / focus the mounted prompt box of the active conversation without the store |
| `claudeDrafts.ts` | per-conversation prompt drafts and the sent-message history (↑), kept out of the action modules so the workspace session can save them |
| `claudeQueue.ts` | `startQueue` (every `start` goes through it; `claude.starting` mirrors it) and `earlyEvents` (events that arrive before `start` answers) |
| `claudeVisibility.ts` | window focus (`watchWindowFocus`), `isShown`/`isVisible`/`syncRead` (`markRead`), toast keys, `revealConversation`/`openClaudeSession`, done/error/model-fallback toasts |
| `claudePermissions.ts` | `respondPermission`, `acceptEdit`/`rejectEdit`, `diskMatches`, proposal diff tabs (`openProposalDiff`, `closeProposalTabs`), card focus, `reviewPermission` and the pending-request toast (`showAttentionToast`) |
| `claudeEvents.ts` | `agentTimes`, delta batching, `handleEvent`/`applyEvent` |
| `claudeLifecycle.ts` | show/hide/toggle/focus the panel, `runStart` (job of `startQueue`), `enqueueStart`, `autoStart`, wake of dormant tabs, new/close/resume/activate/step, `forgetConversation` |
| `claudeEditorContext.ts` | editor context sent to main (`readEditorContext`, debounced `scheduleEditorContext`), `insertClaudeReference`, `openPathFromClaude`, `reviewChangedFile` |
| `claudeSessionMeta.ts` | favorite, rename, duplicate, export, `loadSessions`, `hydrateDormantMeta` |
| `claudeMcpActions.ts` | `/mcp` calls (`mcpCall`) and the `/usage` report: both wake a dormant tab first (`openOverlayAfterWake`) |
| `claudeLogin.ts` | `openClaudeLogin` (terminal + `authStatus` poll), `logoutClaude`, `stopLoginPoll` |
| `claudePromptActions.ts` | `sendPrompt` (+ local commands `/clear` `/mcp` `/usage` `/login` `/logout`), retry/compact/interrupt/`stopBackgroundTask`, attachments, `/` menu, favorite commands, `askClaude`, `handleStartRequested` ("Comece com o Claude") |
| `claudeRewind.ts` | `rewindConversation` |
| `claudeConversationSettings.ts` | mode, model, effort (optimistic, undone on failure) |
| `claudeReactions.ts` | `startClaudeReactions` (top of the chain, imported only by `ipcReactions.ts`): main events, root change reset (`resetClaude`), visibility, wake and auto start, editor context |

Pure conversation logic lives in `lib/`, store-free, one module per concern (each importing only the ones before it):

| Module | Owns |
|---|---|
| `lib/claudeConversation.ts` | `ClaudeConversation` and its types, `createConversation`/`createDormantConversation`, `userText`, queued and permission helpers (`addQueued`, `bindQueuedUuid`, `removeQueued`, `removePermission`), `setUserTitle`, `loadStep`, background task labels |
| `lib/claudeReducer.ts` | `reduceEvent`: the single reducer of main's `ClaudeEvent`s over a conversation |
| `lib/claudeTimeline.ts` | `buildTimeline` and `TimelineItem` (messages flattened into screen items, `resultCache` keeps tool results referentially stable) |
| `lib/claudeSessionTabs.ts` | `sessionClaudeTabs` and `sameSessionFields`: the conversation tabs saved in the workspace session |

Timeline pieces live in `components/claude/timeline/` (`ItemView` with the `sameItemProps` memo comparison, `UserMessage`
+ `UserText`, `PinnedPrompt`, `TurnSummary`, `BackgroundTasks`, `RetryLine`, `ThinkIndicators`, `MessageTime`); `Timeline.tsx`
composes them. The prompt box is `PromptBox.tsx` (JSX and wiring) over `usePromptText` (draft, caret, history ref, the
`registerPrompt` bridge), `usePromptMenus` (`@`/`/` menus and their loads) and `promptKeyAction` in `lib/claudePrompt.ts`
(pure: which action a key triggers; menu arrows stay in `useActiveDescendant`).

A lower module never calls a higher one: what several need goes down (`startQueue`, `earlyEvents`), what needs
everything goes up (`claudeReactions.ts`).

## Session status and notifications

- Status/`unread` are derived in main (`claude/sessionStatus.ts`, pure reducer, priority attention > error > running >
  done > idle) and emitted as `sessionStatus`; main counts `unread` always and the renderer calls `claude.markRead`
  whenever the session is visible (active tab + panel shown + window focused).
- A failed conversation stays in main's map (closed) until the renderer's `close`.
- OS `Notification`s (one per session, references kept against GC) + `app.setBadgeCount` live in
  `claude/registry.ts`/`claude/conversationDeps.ts`/`claude/notify.ts`.
- All app notices are toasts (`components/Toasts.tsx`, `notify()` → `showToast`; `key` replaces/removes).
- E2E of the panel use the fake SDK (`WALPH_FAKE_CLAUDE=<script.json>`, `claude/fake/` (`index.ts`; script format in `script.ts`, CLI in `cli.ts`, query in `query.ts`) reached only through
  `claude/runtime.ts`/`sdk.ts`, ignored when packaged, its single `fake-*` chunk excluded from the package, every
  `WALPH_FAKE_*` stripped from the real CLI env); Playwright emulates page focus, so specs blur explicitly; spy
  `Notification.prototype.show` for OS notifications.

## Questions

- `AskUserQuestion` is handled first in `canUseTool` (independent of the permission mode) as `kind:'question'`.
- `claude/question.ts` normalizes the untrusted input (malformed → `deny` without interrupt and a message, nothing
  shown) and maps the renderer's `answer` (`{ [ClaudeQuestion.id]: string[] }`) to the CLI format `updatedInput.answers
  = { [original question text]: values.join(', ') }`; `skip` = `deny` without interrupt.
- `claude.respond` returns a boolean ack: `false` = main refused (wrong behavior for the kind, invalid answer/malformed)
  and the request STAYS pending, so the renderer keeps/restores the card; `true` = accepted or the request no longer
  exists; never leave a pending request without a card.
- Cards carry `data-request-id`; when the focused card leaves the DOM the prompt gets focus back (`claudeFocus` would
  stay stuck).
- Fake SDK step `question` for E2E.

## Sessions

- Favorite + user title per `sessionId` live in main (`claude/sessionMeta.ts`, `<userData>/claude/<sha256>.json`); the
  user title wins everywhere and is mirrored to the CLI transcript with `renameSession` (best effort, `syncCliTitle` in `claude/sessions.ts`).
- `ClaudeStarted.userTitle` separates it from the automatic title (a later `title` event only replaces automatic ones);
  the renderer must take the `sessionId` from EVERY `init` (rewind to the start creates a new one, meta is copied).
- "Permitir sempre" is session-only (suggestions retargeted to `session`); "Sempre neste workspace" is written by main
  to `<root>/.claude/settings.local.json` (`localPermissions.ts`, never a path from the renderer, invalid file never
  overwritten) + `.git/info/exclude` when new (`gitExclude.ts`).
- Non-fatal warnings use the `notice` event (toast), never `error`.
- Turn `+N −N` comes from the tool blocks (`lib/claudeTurnSummary.ts`, LCS with a per-turn budget).
- Fake SDK: persistent session store (`WALPH_FAKE_CLAUDE_STORE`), steps `toolCall`/`toolResult`/`subagentMessage`,
  `permission.suggestions`.
- Native save dialogs are stubbed in E2E via `electronApp.evaluate`.

## Prompt, attachments and commands

- File chips are `ClaudeAttachment { path }`; a path outside the folder is accepted by main only if it is in the view's
  `PathAllowlist` (`fs/pathAllowlist.ts`, one per view through `window/viewPathAllowlist.ts`, registered in
  `claude/registry.ts`: filled by `claude:pickAttachments` or by the native confirmation in `claude:authorizeAttachments`;
  10 min renewed on use, pinned by canonical path + dev/ino, cleared with the view); the renderer
  never reads outside paths itself (`files.pathForFile` only returns a path).
- `/` menu = `claude:commands` (init commands merged with `claude/commandFiles.ts`, re-read per call with mtime cache,
  untrusted plain text, no symlinks out of `.claude/commands`).
- `bypassPermissions` needs the user-only `claude.allowBypassPermissions`: only then does main launch with
  `allowDangerouslySkipPermissions`; turning it off moves open conversations back to `default` only after the CLI
  confirms (failure closes the conversation).
- `setEffort(null)` = model default.
- The fake SDK records calls in `globalThis.__walphFakeClaudeCalls`/`WALPH_FAKE_CLAUDE_LOG` (user content blocks,
  `setPermissionMode`, `applyFlagSettings`).
- The execution modes keep the design system's English names (Manual · Edit automatically · Plan · Auto · Bypass
  permissions, as in Claude Code): the same labels in every language on purpose; descriptions are translated.
- Prompt-bar menus use `ChipMenu` + `common/useMenuPopup.ts` (shared with `DropdownMenu`).
- Favorite commands (strip above the prompt, `FavoriteCommands.tsx`) live in the app per folder
  (`claude/favoriteCommands.ts`, `<userData>/claude/favorite-commands/<sha256>.json`, never in the repo);
  `shared/favoriteCommands.ts` validates names/icons and the IPC takes the renderer's `root` and refuses if the view
  changed folder.
- Tool rows (`ToolRow.tsx`) come from the pure `lib/claudeToolRow.ts` (icon + past-tense verb, capped detail lines).

## MCP manager (`/mcp`)

- A bare `/mcp` is intercepted in `sendPrompt` (like `/clear`) and opens `components/claude/mcp/McpModal.tsx` (`overlay`
  `{ kind: 'mcp', conversationId }`, one modal at a time; also ⋯ menu and `claude.manageMcp`).
- Status/toggle/reconnect/OAuth go through the SDK `Query` (`mcpAuthenticate`/`mcpClearAuth`/`mcpSubmitOAuthCallbackUrl`
  are untyped: cast + feature-detect; the CLI never opens the browser, main does, `http(s)` only).
- Add/remove are persistent through the CLI (`claude/cliRunner.ts`: `claude mcp add-json|remove -s <scope> --`, bundled
  native binary or `claude.executable`), run with `runCollect` as a process group (20 s timeout; the conversation's
  `AbortSignal` and `will-quit` kill the tree). `claude auth status|logout` (`claude:authStatus`/`claude:logout`) use the
  same runner with a per-view `AbortController` (`authRuns` registry in `claude/authCli.ts`, aborted on view reset), then `reloadPlugins`;
  the live CLI may still list a removed server (main
  filters it per conversation) or a new one without scope (main remembers it).
- `claude/mcp.ts` normalizes the untrusted status: env/header VALUES never leave main, secrets in args/URLs/errors
  masked; only `local`/`project`/`user` are `editable`, the internal `walph` (`source: 'sdk'`) is read-only.
- MCP calls are serialized per conversation, count as activity (no sleep mid-OAuth) and are aborted on `close`.
- Fake SDK: root `mcpServers`.

## SDK events (elicitation, limits, progress)

- MCP elicitation goes through `onElicitation` → `ask()` as `kind:'elicitation'` (attention, like a question; answered
  only with `behavior:'elicitation'`).
- `claude/elicitation.ts` normalizes the untrusted schema (flat subset, ≤ 20 fields,
  `__proto__`/`constructor`/`prototype` refused; anything else is declined with a `notice`, never half-shown); url mode
  is opened by MAIN (http(s) only, no credentials; `openExternal` failure → `cancel`).
- Content is validated by `shared/elicitation.ts` on both sides (error codes; main is authoritative, `validate.ts`
  `parseResponse` first).
- The card shows errors only after the first submit (on blur the layout shift ate the next click).
- `rate_limit_event` `utilization` is a fraction and `resetsAt` epoch seconds.
- `prompt_suggestion` is emitted only while idle; `tool_progress` is throttled to 1/s per tool; none of these start a
  turn or block sleep.
- `model_refusal_fallback` removes `retracted` uuids from the transcript (both scopes) and, for `session`, swaps the
  model (+ `overrides.model`) and re-emits `init`.
- `commands_changed` only updates the init list (the `/` menu re-reads per call).
- `claude.fallbackModel` (user-only) drops entries equal to the model; the SDK throws when `fallbackModel === model`.
- Renderer state for these (`rateLimit`, `retry`, `suggestion`, `taskProgress`, `toolElapsed`) is ephemeral, never in
  the session.
- E2E: `e2e/claudeSdkEvents.spec.ts` with the fake SDK steps.

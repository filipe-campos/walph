---
name: containers
description: Containers screen patterns: docker CLI owned per view (ipc/docker.ts, src/main/docker), process groups and one-shot tracking, id/compose validation, untrusted docker output sent to Claude, the containers takeover in the renderer and the fake docker for E2E. Use when creating or reviewing anything in src/main/docker, ipc/docker.ts or the containers screen.
---

# Containers (`src/main/docker`, `ipc/docker.ts`)

Every docker process is spawned as a process group and owned by a view (or by the shared `ps` cache).

## Containers

- `ipc/docker.ts` is wiring only (channels, validation, delegation). The docker CLI runs from the user-only
  `docker.path` (empty = `docker` of the login-shell PATH, `docker/executable.ts`; `.cmd`/`.bat` rejected on Windows).
  Modules in `docker/`: `run.ts` (`specFor`, `spawnLive`, `run`, the `oneShots` registry), `viewState.ts` (per-view
  `ViewState`: last `ps`, stats/logs streams, `logSeq`; `stopStatsOf`/`stopLogsOf`; the `onViewReset` stop),
  `statsStream.ts` / `logsStream.ts` (classes with `start`/`stop`, injected `spawn`, tested with
  `testing/fakeGroupProcess.ts` and fake timers), `streams.ts` (`startStats`, `followLogs`: spec + `send` + view
  state), `ps.ts` (`fetchPs`, shared `psCache`), `commands.ts` (info, actions, compose, inspect, investigation prompt),
  `composeTarget.ts` (members → validated working dir and files), `exec.ts` (`dockerExecCommand`, terminal source).
- `docker/**` never imports from `claude/**`: the executable comes from `env/executable.ts` `resolveExecutable`, the
  env from `env/childEnv.ts` `buildChildEnv` and the PATH from `env/loginShell.ts` `effectivePath()`.
- Stream lines (`logs -f`, `stats`) are split with `util/lineSplitter.ts` `createLineSplitter` (CRLF aware, capped line).
- EVERY docker process is an own process group (`process/spawnGroup.ts`, killed on timeout, view navigate/destroy and
  `will-quit` via `killAllSpawnedGroups`): continuous ones (`stats`, `logs -f`) through `spawnLive`, one-shot commands
  (`run`: compose up, actions, inspect…) through `runCollect` (`process/runCollect.ts`) with `group: true` and
  `owner: oneShots.scope(sender)`; `run` only classifies the result into `DockerError`. One-shots are tracked in the view
  (`oneShots` registry in `run.ts`), killed on view reset and block hibernation
  (eviction guard `docker`) while running, except the shared `ps` (`psCache`), which belongs to no view; `stats` and
  `logs -f` are per view and only while the screen / the detail is open (`logSeq` is bumped even before the follow
  spawns, so a stop during `specFor` never leaves an orphan).
- `logs -f` batches lines per `LOGS_BATCH_MS` tick (at most `LOGS_BATCH_MAX` per tick; the excess waits for the next
  tick, nothing is dropped). Above `LOGS_HIGH_WATERMARK` queued lines both pipes are paused (a main-side throughput cap, there is no renderer ack) until the queue falls to
  `LOGS_LOW_WATERMARK`; on exit the whole queue is delivered before `docker:logsEnd`.
- Stdout over `MAX_BUFFER` (16 MB, `runCollect` `maxBuffer` with the default `onOverflow: 'kill'`) kills the process and fails with `DockerError` reason `outputTooLarge`; it is never
  truncated silently. Stderr keeps only a bounded tail (verbose compose builds are not a failure).
- Ids from the renderer pass `resolveContainerRef` (12–64 hex or a name from that view's last `ps`) and always go after
  `--`; compose dirs/files come only from the container labels and must exist.
- Docker 27 with the daemon stopped exits 0 on `info` with an empty `ServerVersion` (`parseInfo.ts` → `daemonDown`);
  errors carry their `DockerInfoError` (`DockerError`), never reclassify the translated message.
- Docker output in the Claude prompt is untrusted: `investigation.ts` delimited/truncated blocks, env values never leave
  main, secrets in the command masked (`maskSecrets.ts`).
- Renderer: the takeover is `screen: 'workbench' | 'containers'` (NOT `view`, never in the session); everything else
  stays mounted and hidden (`.workbench.takeover`), toasts portal to `body`, Claude sessions don't count as seen while
  on containers, and `executeCommand` leaves the screen first for editor/tab commands (⌘W only leaves it; the
  `registerOverlayPolicy` in `dockerActions.ts`, registered by `startDockerReactions`).
- E2E use `e2e/fixtures/fake-docker.mjs` (state in `WALPH_FAKE_DOCKER_STATE`, `.calls.jsonl`/`.pids` beside it).

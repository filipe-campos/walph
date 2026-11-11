#!/usr/bin/env node
// FAKE Docker for E2E and manual tests (app-tester). Talks to no daemon: reads/writes a JSON state file.
//
// How to use
//   1. Create the state file (see "State") and export `WALPH_FAKE_DOCKER_STATE=<file>` BEFORE opening the app
//      (the app passes its environment to the Docker processes; in E2E it goes in `electron.launch({ env })`).
//   2. `docker.path` is user-only: put it in the `settings.json` of the isolated `--user-data-dir`
//        { "docker.path": "/absolute/path/to/the/fake-docker" }
//      The value must be an executable. This file has `#!/usr/bin/env node` and the execute bit, but Electron
//      does not guarantee `node` on the PATH; so the E2E generates a wrapper in the temporary directory:
//        #!/bin/sh
//        exec "<node path>" "<this file>" "$@"
//      (see `makeFakeDocker` in e2e/containers.spec.ts). Windows: not supported (sh wrapper).
//   3. Change the state while the app runs by editing the JSON (the fake reads the file again on every command).
//
// State (`WALPH_FAKE_DOCKER_STATE`)
//   {
//     "mode": "ok" | "down" | "downInfoOk",  // "down": every command fails with "Cannot connect…" (exit 1);
//                                       "downInfoOk": like the real Docker 27, `info` exits 0 with JSON with an empty ServerVersion
//     "failActions": true,        // start/stop/restart fail with "Error response from daemon: …"
//     "composeDelayMs": 60000,    // `compose …` waits this long before changing the state (long one-shot command)
//     "info": { "ServerVersion": "27.0.1-fake", "MemTotal": 8589934592, "NCPU": 8, "context": "fake-context" },
//     "containers": [{
//       "id": "aaaaaaaaaaaa",                 // 12 hex digits
//       "name": "shop-web-1", "image": "nginx:1",
//       "state": "running" | "exited" | ...,
//       "health": null | "healthy" | "unhealthy" | "starting",
//       "ports": "0.0.0.0:8080->80/tcp, :::8080->80/tcp",   // Ports column of `docker ps`
//       "labels": { "com.docker.compose.project": "shop", "com.docker.compose.service": "web",
//                   "com.docker.compose.project.working_dir": "/abs", "com.docker.compose.project.config_files": "/abs/compose.yaml" },
//       "logs": ["INFO server started", "ERROR failed to connect"],   // initial lines of `docker logs`
//       "restartCount": 0
//     }]
//   }
//
// Files next to the state (append-only, one JSON line per event)
//   <state>.calls.jsonl    { "args": [...], "at": ms }  every command received (including `stats`/`logs`)
//   <state>.pids           { "pid": n, "kind": "logs-follow" | "stats" | "compose", "id": "…" }  continuous processes (and
//                          `compose` with `composeDelayMs`); the test checks with `process.kill(pid, 0)` that they died
//
// Supported commands (the same arguments `src/main/ipc/docker.ts` sends)
//   info --format …                    JSON with ServerVersion/MemTotal/NCPU
//   context show                       prints info.context
//   ps -a --format …                   one JSON line per container (ID, Names, Image, State, Status, Ports, Labels)
//   stats --format …                   continuous frames every ~500 ms (`ESC[2J ESC[H` + one line per running container);
//                                      CPU/memory vary on every frame
//   logs [-f] --timestamps --tail N -- id   lines from the state; with -f keeps emitting `tick N` every 400 ms
//   start|stop|restart -- id           changes the container `state` in the file
//   compose --project-directory D [-f F]… -p P up -d|restart|stop     changes the state of the project containers
//   compose -f F up -d                 (header Compose up) starts the containers whose config_files include F
//   inspect -- id                      JSON array with one object (Config, State.Health, NetworkSettings, Mounts…)
//   exec -it -- id sh                  prints a prompt and echoes what is typed

import { appendFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const statePath = process.env.WALPH_FAKE_DOCKER_STATE
const argv = process.argv.slice(2)

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

if (!statePath) fail('fake-docker: set WALPH_FAKE_DOCKER_STATE')

const readState = () => JSON.parse(readFileSync(statePath, 'utf8'))
function writeState(state) {
  const tmp = `${statePath}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, statePath)
}
const record = (file, obj) => appendFileSync(`${statePath}${file}`, `${JSON.stringify(obj)}\n`)

record('.calls.jsonl', { args: argv, at: Date.now() })

let state = readState()
if (state.mode === 'down') {
  fail('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?')
}

// Docker 27 with the daemon stopped: `info` exits 0 and prints JSON with an empty ServerVersion + ServerErrors; the
// "Cannot connect…" text only goes to stderr. The other commands fail normally.
if (state.mode === 'downInfoOk') {
  const text = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'
  if (argv[0] === 'info') {
    process.stdout.write(`${JSON.stringify({ ServerVersion: '', ServerErrors: [text] })}\n`)
    process.stderr.write(`failed to connect to the docker API: ${text}\n`)
    process.exit(0)
  }
  fail(text)
}

const after = (flag) => argv[argv.indexOf(flag) + 1]
const refOf = () => argv[argv.indexOf('--') + 1]
const find = (ref) => state.containers.find((c) => c.id === ref || c.name === ref || c.id.startsWith(ref))
const labelsText = (c) =>
  Object.entries(c.labels ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(',')

function statusText(c) {
  if (c.state === 'running') {
    const base = c.justStarted ? 'Up Less than a second' : 'Up 2 hours'
    const h =
      c.health === 'healthy'
        ? ' (healthy)'
        : c.health === 'unhealthy'
          ? ' (unhealthy)'
          : c.health === 'starting'
            ? ' (health: starting)'
            : ''
    return base + h
  }
  if (c.state === 'restarting') return 'Restarting (1) 5 seconds ago'
  return 'Exited (0) 3 minutes ago'
}

function setState(c, next) {
  c.state = next
  c.justStarted = next === 'running'
}

function mutate(fn) {
  state = readState()
  fn()
  writeState(state)
}

const [cmd] = argv
switch (cmd) {
  case 'info': {
    const { context: _context, ...info } = state.info ?? {}
    process.stdout.write(
      `${JSON.stringify({ ServerVersion: '27.0.1-fake', MemTotal: 8589934592, NCPU: 8, ...info })}\n`
    )
    break
  }
  case 'context':
    process.stdout.write(`${state.info?.context ?? 'fake-context'}\n`)
    break
  case 'ps':
    for (const c of state.containers) {
      process.stdout.write(
        `${JSON.stringify({
          ID: c.id,
          Names: c.name,
          Image: c.image,
          State: c.state,
          Status: statusText(c),
          Ports: c.ports ?? '',
          Labels: labelsText(c)
        })}\n`
      )
    }
    break
  case 'start':
  case 'stop':
  case 'restart': {
    const c = find(refOf())
    if (!c) fail(`Error response from daemon: No such container: ${refOf()}`)
    if (state.failActions) fail(`Error response from daemon: cannot ${cmd} container ${c.name}: falha simulada`)
    mutate(() => setState(find(c.id), cmd === 'stop' ? 'exited' : 'running'))
    process.stdout.write(`${c.name}\n`)
    break
  }
  case 'compose': {
    const project = argv.includes('-p') ? after('-p') : null
    const files = argv.flatMap((a, i) => (a === '-f' ? [argv[i + 1]] : []))
    const verb = argv.includes('up')
      ? 'up'
      : argv.includes('restart')
        ? 'restart'
        : argv.includes('stop')
          ? 'stop'
          : null
    if (!verb) fail('fake-docker: verbo do compose desconhecido')
    if (state.composeDelayMs) {
      record('.pids', { pid: process.pid, kind: 'compose', id: '' })
      await new Promise((resolve) => setTimeout(resolve, state.composeDelayMs))
    }
    mutate(() => {
      for (const c of state.containers) {
        const labels = c.labels ?? {}
        const inProject = project
          ? labels['com.docker.compose.project'] === project
          : files.some((f) => (labels['com.docker.compose.project.config_files'] ?? '').split(',').includes(f))
        if (inProject) setState(c, verb === 'stop' ? 'exited' : 'running')
      }
    })
    process.stderr.write(' Container started\n')
    break
  }
  case 'inspect': {
    const c = find(refOf())
    if (!c) fail(`Error: No such object: ${refOf()}`)
    const running = c.state === 'running'
    process.stdout.write(
      `${JSON.stringify([
        {
          Id: c.id.repeat(6).slice(0, 64),
          Name: `/${c.name}`,
          Created: '2026-10-17T12:00:00.000000000Z',
          Path: 'docker-entrypoint.sh',
          Args: [],
          RestartCount: c.restartCount ?? 0,
          Config: {
            Image: c.image,
            Cmd: ['serve', '--port', '80'],
            Entrypoint: null,
            Env: ['A=1', 'SECRET=nao-mostrar']
          },
          State: {
            Status: c.state,
            Running: running,
            ExitCode: running ? 0 : 1,
            ...(c.health
              ? {
                  Health: {
                    Status: c.health,
                    FailingStreak: c.health === 'unhealthy' ? 3 : 0,
                    Log: [
                      { Output: c.health === 'unhealthy' ? 'curl: (7) Failed to connect to localhost port 80' : 'ok' }
                    ]
                  }
                }
              : {})
          },
          NetworkSettings: {
            Networks: { [`${c.labels?.['com.docker.compose.project'] ?? 'bridge'}_default`]: {} },
            Ports: {}
          },
          Mounts: []
        }
      ])}\n`
    )
    break
  }
  case 'logs': {
    const c = find(refOf())
    if (!c) fail(`Error response from daemon: No such container: ${refOf()}`)
    const follow = argv.includes('-f')
    const stamp = (n) =>
      new Date(Date.UTC(2026, 9, 17, 12, 0, 0, n))
        .toISOString()
        .replace('.000Z', `.${String(n).padStart(3, '0')}000000Z`)
    ;(c.logs ?? []).forEach((text, i) => process.stdout.write(`${stamp(i)} ${text}\n`))
    if (!follow) break
    record('.pids', { pid: process.pid, kind: 'logs-follow', id: c.id })
    let n = 0
    setInterval(() => process.stdout.write(`${new Date().toISOString()} INFO tick ${++n} de ${c.name}\n`), 400)
    break
  }
  case 'stats': {
    record('.pids', { pid: process.pid, kind: 'stats', id: '' })
    let tick = 0
    const frame = () => {
      const current = readState()
      if (current.mode === 'down')
        fail('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?')
      tick++
      let out = '\x1b[2J\x1b[H'
      current.containers
        .filter((c) => c.state === 'running')
        .forEach((c, i) => {
          const cpu = (i + 1) * 3 + (tick % 10) * 0.37
          const mem = 20 + i * 15 + (tick % 10)
          out += `${JSON.stringify({
            ID: c.id,
            Container: c.id,
            Name: c.name,
            CPUPerc: `${cpu.toFixed(2)}%`,
            MemUsage: `${mem.toFixed(1)}MiB / 1GiB`,
            MemPerc: `${(mem / 10.24).toFixed(2)}%`
          })}\n`
        })
      process.stdout.write(out)
    }
    frame()
    setInterval(frame, 500)
    break
  }
  case 'exec': {
    const c = find(refOf())
    if (!c) fail(`Error response from daemon: No such container: ${refOf()}`)
    process.stdout.write(`fake-docker exec ${c.name}\r\n/ # `)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) =>
      process.stdout.write(chunk.replace(/\r/g, '\r\n') + (chunk.includes('\r') ? '/ # ' : ''))
    )
    break
  }
  default:
    fail(`fake-docker: unsupported command: ${argv.join(' ')}`)
}

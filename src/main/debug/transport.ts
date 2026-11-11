// The adapter process and the DAP channels to it: stdio (a single channel) or local TCP (one socket per session, for
// the child sessions of js-debug's `startDebugging`).
import { createServer, connect, type Socket } from 'node:net'
import { t } from '@shared/i18n'
import { UserError } from '../errors'
import { spawnGroup, type GroupProcess } from '../process/spawnGroup'
import { createLineSplitter } from '../util/lineSplitter'
import { withPort, type ResolvedAdapter } from './adapters'
import type { DapStreams } from './connection'

const CONNECT_TIMEOUT_MS = 10_000
const CONNECT_RETRY_MS = 100
const MAX_STDERR_LINE = 8192

export interface AdapterLaunch {
  adapter: ResolvedAdapter
  /** Executable already resolved (absolute). */
  file: string
  env: Record<string, string>
  cwd: string
}

export interface AdapterHandle {
  readonly proc: GroupProcess
  readonly command: string
  /** New channel to the adapter. On stdio only the first call works (`null` afterwards). */
  connect(): Promise<DapStreams | null>
  /** Kills the adapter tree (no-op if it already exited). */
  kill(): void
}

export interface AdapterCallbacks {
  /** Adapter stderr line (diagnostic; goes to the console as `console`). */
  onStderr(line: string): void
  /** The process exited (code or signal) or never came to exist (`spawnError`). */
  onExit(code: number | null, signal: NodeJS.Signals | null, spawnError: string | null): void
}

/** Free TCP port on 127.0.0.1 (the adapter opens it right after; the race window is the same as VS Code's). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('no port'))))
    })
  })
}

const socketStreams = (socket: Socket): DapStreams => ({
  input: socket,
  output: socket,
  close: () => socket.destroy()
})

/** Connects to the local DAP server, retrying while it starts up; gives up at the deadline or if the process exited. */
function connectTcp(port: number, proc: GroupProcess, timeoutMs = CONNECT_TIMEOUT_MS): Promise<DapStreams> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const socket = connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.removeAllListeners('error')
        socket.on('error', () => undefined)
        resolve(socketStreams(socket))
      })
      socket.once('error', () => {
        socket.destroy()
        if (proc.exited || Date.now() >= deadline) reject(new UserError(t().debug.errors.connectTimeout))
        else setTimeout(attempt, CONNECT_RETRY_MS)
      })
    }
    attempt()
  })
}

export async function startAdapter(launch: AdapterLaunch, callbacks: AdapterCallbacks): Promise<AdapterHandle> {
  const { adapter, file, env, cwd } = launch
  const port = adapter.transport === 'tcp' ? await freePort() : null
  const args = port === null ? adapter.args : withPort(adapter.args, port)
  const command = [file, ...args].join(' ')
  let proc: GroupProcess
  try {
    proc = spawnGroup(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    throw new UserError(t().debug.errors.spawn(file, err instanceof Error ? err.message : String(err)))
  }
  const { child } = proc
  const stderr = createLineSplitter(MAX_STDERR_LINE)
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    for (const l of stderr.feed(chunk)) if (l.trim()) callbacks.onStderr(l)
  })
  child.stdin?.on('error', () => undefined)
  child.stdout?.on('error', () => undefined)
  let reported = false
  const report = (code: number | null, signal: NodeJS.Signals | null, spawnError: string | null): void => {
    if (reported) return
    reported = true
    callbacks.onExit(code, signal, spawnError)
  }
  child.on('error', (err) => {
    // No pid = the executable never got to run.
    if (child.pid === undefined) report(null, null, t().debug.errors.spawn(file, err.message))
  })
  child.on('exit', (code, signal) => report(code, signal, null))

  let stdioTaken = false
  return {
    proc,
    command,
    connect: async () => {
      if (port !== null) return connectTcp(port, proc)
      if (stdioTaken || !child.stdout || !child.stdin) return null
      stdioTaken = true
      // On stdio the channel is the process itself: closing it ends the adapter.
      return { input: child.stdout, output: child.stdin, close: () => proc.kill() }
    },
    kill: () => proc.kill()
  }
}

// Runs a command to completion and returns what it wrote. A single place for the deadline, output caps, cancellation
// and spawn errors: the caller only classifies the result into messages. Never rejects.

import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { omitUndefined } from '@shared/omitUndefined'
import { dropPartialHead, trimPartialTail } from '../util/utf8Boundary'
import { spawnGroup, type GroupProcess } from './spawnGroup'

const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024
const DEFAULT_MAX_STDERR = 256 * 1024

/** Who answers for the process (a view): registers it to die with the view and later tells whether it cancelled it. */
export interface ProcessOwner {
  /** Returns the function that removes the process from the registry when it ends. */
  track(proc: GroupProcess): () => void
  wasCancelled(proc: GroupProcess): boolean
}

export interface RunCollectOptions {
  cwd?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
  /** Deadline in ms; when it expires the process is killed and `timedOut` is `true`. Without it, runs until exit. */
  timeout?: number
  /** Stdout cap in bytes (default 16 MiB). Exceeding it sets `overflow`; what happens next is `onOverflow`. */
  maxBuffer?: number
  /**
   * `kill` (default): exceeding the cap kills the process, the output would be silently truncated. `truncate`: keeps
   * the cap and goes on.
   */
  onOverflow?: 'kill' | 'truncate'
  /** Stderr cap in bytes (default 256 KiB). Exceeding it is never a failure: only `stderrKeep` decides what is kept. */
  maxStderr?: number
  /** Part of stderr kept when over the cap: the beginning (`head`) or the end (`tail`, default). */
  stderrKeep?: 'head' | 'tail'
  /** Leader of its own group (`spawnGroup`): deadline, cancellation and `will-quit` kill the whole tree. */
  group?: boolean
  /** With `group`: the deadline and cancellation send SIGTERM before SIGKILL (git holding `index.lock`). */
  graceful?: boolean | undefined
  owner?: ProcessOwner | undefined
  /** Aborts the process (`cancelled`); if already aborted, it never starts. */
  signal?: AbortSignal | undefined
  /** `stdout` as a `Buffer`, undecoded. */
  binary?: boolean | undefined
  /**
   * Receives stdout as text as it arrives, instead of accumulating it (`stdout` comes back empty and `maxBuffer` does
   * not apply). `stop()` kills the process (the caller knows it stopped because it chose to).
   */
  onStdout?: (chunk: string, stop: () => void) => void
  /** Written to the process stdin (which is closed right after); without it stdin is `ignore`. */
  input?: string | Buffer | undefined
}

export interface CollectResult<Out extends string | Buffer = string> {
  /** `null` when killed by a signal, by this call (stop, timeout, abort, overflow) or when the process never started. */
  code: number | null
  stdout: Out
  stderr: string
  timedOut: boolean
  /** Cancelled by the owner (`owner`) or by the `signal`. */
  cancelled: boolean
  /** Failure to start the process (ENOENT, EACCES…). */
  spawnError: Error | null
  /** Stdout exceeded `maxBuffer`. */
  overflow: boolean
}

function plainProcess(file: string, args: string[], options: RunCollectOptions): GroupProcess {
  const child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: [stdinOf(options), 'pipe', 'pipe'],
    windowsHide: true
  })
  let exited = false
  let markClosed!: () => void
  const closed = new Promise<void>((resolve) => (markClosed = resolve))
  const end = (): void => {
    exited = true
    markClosed()
  }
  child.once('exit', end)
  child.once('error', () => {
    if (child.pid === undefined) end()
  })
  const signal = (name: NodeJS.Signals) => () => {
    if (!exited) child.kill(name)
  }
  return {
    child,
    get exited() {
      return exited
    },
    graceful: false,
    closed,
    kill: signal('SIGKILL'),
    terminate: signal('SIGTERM')
  }
}

function startProcess(file: string, args: string[], options: RunCollectOptions): GroupProcess {
  if (!options.group) return plainProcess(file, args, options)
  return spawnGroup(file, args, {
    ...omitUndefined({ cwd: options.cwd, env: options.env, graceful: options.graceful }),
    stdio: [stdinOf(options), 'pipe', 'pipe']
  })
}

function stdinOf(options: RunCollectOptions): 'pipe' | 'ignore' {
  return options.input === undefined ? 'ignore' : 'pipe'
}

export function runCollect(
  file: string,
  args: string[],
  options: RunCollectOptions & { binary: true }
): Promise<CollectResult<Buffer>>
export function runCollect(
  file: string,
  args: string[],
  options?: RunCollectOptions & { binary?: false }
): Promise<CollectResult>
export function runCollect(
  file: string,
  args: string[],
  options: RunCollectOptions
): Promise<CollectResult<string | Buffer>>
export function runCollect(
  file: string,
  args: string[],
  options: RunCollectOptions = {}
): Promise<CollectResult<string | Buffer>> {
  const { timeout, owner, signal, onStdout } = options
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
  const maxStderr = options.maxStderr ?? DEFAULT_MAX_STDERR
  const keepTail = (options.stderrKeep ?? 'tail') === 'tail'

  return new Promise((resolve) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outLength = 0
    let errLength = 0
    let timedOut = false
    let overflow = false
    let stderrCut = false
    let settled = false

    const build = (
      code: number | null,
      spawnError: Error | null,
      cancelled: boolean
    ): CollectResult<string | Buffer> => {
      const stdout = Buffer.concat(out)
      let stderr: Buffer = Buffer.concat(err)
      if (keepTail) {
        if (stderr.length > maxStderr) stderr = dropPartialHead(stderr.subarray(-maxStderr))
      } else if (stderrCut) {
        stderr = trimPartialTail(stderr)
      }
      return {
        code,
        stdout: options.binary ? stdout : (overflow ? trimPartialTail(stdout) : stdout).toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        cancelled,
        spawnError,
        overflow
      }
    }

    if (signal?.aborted) return resolve(build(null, null, true))

    let proc: GroupProcess
    try {
      proc = startProcess(file, args, options)
    } catch (spawnError) {
      return resolve(build(null, spawnError as Error, false))
    }

    if (options.input !== undefined && proc.child.stdin) {
      // The process may exit without reading everything (EPIPE): the result comes from the exit code, not this error.
      proc.child.stdin.on('error', () => {})
      proc.child.stdin.end(options.input)
    }

    const untrack = owner?.track(proc)
    // On Windows `taskkill` ends the process with exit code 1, which would read as a normal exit.
    let killedHere = false
    const kill = (): void => {
      killedHere = true
      proc.kill()
    }
    const stop = (): void => {
      killedHere = true
      if (options.graceful) proc.terminate()
      else proc.kill()
    }
    signal?.addEventListener('abort', stop, { once: true })
    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true
            stop()
          }, timeout)
    const decoder = onStdout ? new StringDecoder('utf8') : null

    const finish = (code: number | null, spawnError: Error | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
      untrack?.()
      if (decoder) {
        const rest = decoder.end()
        if (rest) onStdout?.(rest, kill)
      }
      resolve(build(code, spawnError, signal?.aborted === true || owner?.wasCancelled(proc) === true))
    }

    proc.child.stdout?.on('data', (chunk: Buffer) => {
      if (decoder) return onStdout?.(decoder.write(chunk), kill)
      const room = maxBuffer - outLength
      if (chunk.length <= room) {
        out.push(chunk)
        outLength += chunk.length
        return
      }
      const first = !overflow
      overflow = true
      if (room > 0) {
        out.push(chunk.subarray(0, room))
        outLength = maxBuffer
      }
      if (first && options.onOverflow !== 'truncate') kill()
    })
    proc.child.stderr?.on('data', (chunk: Buffer) => {
      if (keepTail) {
        err.push(chunk)
        errLength += chunk.length
        while (err.length > 1) {
          const head = err[0]
          if (!head || errLength - head.length < maxStderr) break
          errLength -= head.length
          err.shift()
        }
        return
      }
      const room = maxStderr - errLength
      if (room <= 0) return
      if (chunk.length > room) stderrCut = true
      const kept = chunk.length > room ? chunk.subarray(0, room) : chunk
      err.push(kept)
      errLength += kept.length
    })
    proc.child.once('close', (code) => finish(killedHere ? null : code, null))
    proc.child.once('error', (spawnError) => {
      if (proc.child.pid === undefined) finish(null, spawnError)
    })
  })
}

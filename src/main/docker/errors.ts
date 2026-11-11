import { t } from '@shared/i18n'
import type { DockerInfoError } from '@shared/types'
import { UserError } from '../errors'

export interface DockerFailure {
  code?: string | number | null | undefined
  stderr?: string
  message?: string | undefined
  killed?: boolean
  /** The output went past the limit and the process was terminated. */
  overflow?: boolean
}

const DAEMON_DOWN =
  /cannot connect to the docker daemon|error during connect|is the docker daemon running|docker daemon is not running|connect: no such file or directory|dial unix .*docker\.sock|pipe\/docker_engine/i

/** First useful stderr line, without the `Error response from daemon:` prefix. */
function firstStderrLine(stderr: string | undefined): string {
  const line =
    (stderr ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? ''
  return line.replace(/^error response from daemon:\s*/i, '').replace(/^error:\s*/i, '')
}

/** Classifies the failure of a Docker command into reason + translated message. */
export function classifyDockerFailure(err: DockerFailure): DockerInfoError {
  const messages = t().containers.errors
  // A missing executable always arrives with `code: 'ENOENT'`: the translated message is never compared.
  if (err.code === 'ENOENT') return { ok: false, reason: 'notInstalled', message: messages.notInstalled }
  const text = `${err.stderr ?? ''}\n${err.message ?? ''}`
  if (DAEMON_DOWN.test(text)) return { ok: false, reason: 'daemonDown', message: messages.daemonDown }
  if (err.overflow) return { ok: false, reason: 'outputTooLarge', message: messages.outputTooLarge }
  if (err.killed) return { ok: false, reason: 'error', message: messages.timeout }
  const detail = firstStderrLine(err.stderr) || firstStderrLine(err.message)
  return { ok: false, reason: 'error', message: detail ? messages.withDetail(detail) : messages.noDetail }
}

/** Error with the reason already classified: `info()` returns `info` as is, without reclassifying the message. */
export class DockerError extends UserError {
  readonly info: DockerInfoError
  constructor(info: DockerInfoError, options?: ErrorOptions) {
    super(info.message, options)
    this.info = info
  }
}

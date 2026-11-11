// Resolution of the user-configured executable (`claude.executable`, `docker.path`) and rejection of scripts.

import { isAbsolute, win32 } from 'node:path'
import { findInPath, isFileSync } from './childEnv'
import { UserError } from '../errors'

const WINDOWS_SCRIPT = /\.(cmd|bat)$/i
const JS_SCRIPT = /\.(?:m?js|cjs)$/i

export interface ExecutableMessages {
  /** Absolute path that does not exist. */
  notFound(value: string): string
  /** Bare name that is not in the PATH. Without this, `notFound` applies. */
  notInPath?(value: string): string
  /** `.cmd`/`.bat` on Windows: the process cannot run them without a shell. */
  windowsScript(path: string): string
}

export interface ResolveExecutableOptions {
  messages: ExecutableMessages
  platform?: string | undefined
  isFile?: ((path: string) => boolean) | undefined
}

/**
 * `value` (non-empty) → absolute path. A bare name is looked up in the PATH; an absolute path must exist. When not
 * found, throws with `code: 'ENOENT'`.
 */
export function resolveExecutable(
  value: string,
  pathVar: string,
  { messages, platform = process.platform, isFile = isFileSync }: ResolveExecutableOptions
): string {
  const absolute = isAbsolute(value) || (platform === 'win32' && win32.isAbsolute(value))
  let found: string | null
  if (absolute) {
    if (!isFile(value)) throw Object.assign(new UserError(messages.notFound(value)), { code: 'ENOENT' })
    found = value
  } else {
    found = findInPath(value, pathVar, platform, isFile)
    if (!found) throw Object.assign(new UserError((messages.notInPath ?? messages.notFound)(value)), { code: 'ENOENT' })
  }
  if (platform === 'win32' && WINDOWS_SCRIPT.test(found)) throw new UserError(messages.windowsScript(found))
  return found
}

/** A Node script does not run as a binary without a shell/interpreter: reject instead of guessing. */
export function assertRunnableBinary(file: string, message: () => string): void {
  if (JS_SCRIPT.test(file)) throw new UserError(message())
}

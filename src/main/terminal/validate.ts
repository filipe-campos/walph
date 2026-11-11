import { isRecord, isNonEmptyString, isFiniteNumber } from '@shared/guards'

/** Limit of pty columns/rows: an absurd value from the renderer allocates huge buffers in node-pty. */
const MAX_TERMINAL_DIMENSION = 1000
export const MAX_LINK_LENGTH = 4096

export interface TerminalCreateOptions {
  /** Requested initial folder (absolute path validation is up to whoever opens the pty). */
  cwd: string | null
  /** Profile name from `terminal.profiles`; `null` = the default. */
  profile: string | null
  /** Container id/name for `docker exec`; `null` = regular shell. */
  dockerExec: string | null
  /** Runs `claude auth login` instead of the shell. */
  claudeLogin: boolean
  /** Debugger `runInTerminal` ticket; `null` = regular shell. */
  debugRun: string | null
}

/** Renderer input (untrusted): only `cwd`, `profile` and `dockerExec`, and only if they are strings. */
export function parseCreateOptions(value: unknown): TerminalCreateOptions {
  const opts = isRecord(value) ? value : {}
  return {
    cwd: isNonEmptyString(opts.cwd) ? opts.cwd : null,
    profile: typeof opts.profile === 'string' ? opts.profile : null,
    dockerExec: typeof opts.dockerExec === 'string' ? opts.dockerExec : null,
    claudeLogin: opts.claudeLogin === true,
    debugRun: typeof opts.debugRun === 'string' ? opts.debugRun : null
  }
}

/** Text typed/pasted into the terminal; anything else is discarded. */
export function parseWriteData(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Characters acknowledged by the renderer (flow control): positive finite number. */
export function parseAckChars(value: unknown): number | null {
  return isFiniteNumber(value) && value > 0 ? value : null
}

/**
 * pty size: finite numbers ≥ 1, truncated and capped at 1000 (discarding would leave the pty out of sync with xterm
 * on a huge screen). Invalid = `null` (resize is fire-and-forget, so it is ignored).
 */
export function parseResize(cols: unknown, rows: unknown): { cols: number; rows: number } | null {
  const valid = (n: unknown): n is number => isFiniteNumber(n) && n >= 1
  if (!valid(cols) || !valid(rows)) return null
  const clamp = (n: number): number => Math.min(Math.floor(n), MAX_TERMINAL_DIMENSION)
  return { cols: clamp(cols), rows: clamp(rows) }
}

/** Clickable link path: non-empty, short text, without a null byte. */
export function parseLinkPath(value: unknown): string | null {
  if (!isNonEmptyString(value) || value.length > MAX_LINK_LENGTH || value.includes('\0')) return null
  return value
}

// Login shell PATH at startup. An app opened from Finder/Dock (macOS) or a launcher (Linux) inherits a minimal PATH
// (/usr/bin:/bin…): git, node and the user's language servers would not be found. Everything main starts (git, rg, LSP,
// shells, Claude) inherits `process.env`, so fixing it once here is enough.

import { userInfo } from 'node:os'
import { delimiter } from 'node:path'
import { withDeadline } from '../util/deadline'
import { loginShellPath, mergePaths } from './loginShell'

/** `$SHELL` when present; a GUI app often does not get it, so it falls back to the user's account shell. */
export function pickShell(envShell: string | undefined, userShell: string | undefined): string | undefined {
  if (envShell) return envShell

  return userShell || undefined
}

function accountShell(): string | undefined {
  try {
    return userInfo().shell ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Waits for `load` for at most `capMs`; if it resolves later (the shell has its own 5 s timeout), `apply` still runs.
 * `apply` must be idempotent. Never rejects: without a login PATH the inherited one applies.
 */
export async function applyWithinCap(
  load: Promise<string | null>,
  capMs: number,
  apply: (login: string) => void
): Promise<void> {
  const settled = load.then(
    (login) => {
      if (login) apply(login)
    },
    () => undefined
  )
  await withDeadline(settled, capMs)
}

/** Replaces the process `PATH` with the login shell one plus the inherited one. No-op on Windows (PATH is complete). */
export function applyLoginPathAtStartup(capMs = 2000): Promise<void> {
  if (process.platform === 'win32') return Promise.resolve()
  const shell = pickShell(process.env.SHELL, accountShell())
  return applyWithinCap(loginShellPath(process.platform, shell), capMs, (login) => {
    process.env.PATH = mergePaths(login, process.env.PATH, delimiter)
  })
}

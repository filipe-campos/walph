import { t } from '@shared/i18n'
import type { TerminalProfile } from '@shared/settings'
import { resolveShell } from './resolveShell'
import { UserError } from '../errors'

export interface ProfileSettings {
  'terminal.shell': string
  'terminal.profiles': Record<string, TerminalProfile>
  'terminal.defaultProfile': string
}

export interface ResolvedTerminal {
  file: string
  args: string[]
  /** Profile variables to add to the environment (`null` removes). */
  env: Record<string, string | null>
  /** Chosen profile, or `null` if `terminal.shell`/the OS default applies. */
  profile: string | null
}

const has = (profiles: Record<string, TerminalProfile>, name: string): boolean => Object.hasOwn(profiles, name)

/**
 * Chooses what to run: explicit profile (missing = error) → `terminal.defaultProfile` (missing = falls back to
 * `terminal.shell`, so "New Terminal" never fails because of a stale config) → `terminal.shell`/the OS default.
 */
export function resolveTerminal(
  requested: string | null,
  settings: ProfileSettings,
  platform: string,
  envShell: string | undefined
): ResolvedTerminal {
  const profiles = settings['terminal.profiles']
  let name: string | null = null
  if (requested !== null) {
    if (!has(profiles, requested)) {
      throw new UserError(t().terminal.errors.profileNotFound(requested))
    }
    name = requested
  } else {
    const def = settings['terminal.defaultProfile'].trim()
    if (def && has(profiles, def)) name = def
  }
  const profile = name === null ? undefined : profiles[name]
  if (name === null || !profile) {
    return { ...resolveShell(settings['terminal.shell'], platform, envShell), env: {}, profile: null }
  }
  const base = resolveShell(profile.path, platform, envShell)
  return { file: base.file, args: profile.args ? [...profile.args] : base.args, env: { ...profile.env }, profile: name }
}

/**
 * Final environment: inherited + profile (`null` deletes). `ELECTRON_RUN_AS_NODE` never passes; TERM_PROGRAM/COLORTERM
 * fixed; CLICOLOR default.
 */
export function buildTerminalEnv(
  base: Record<string, string | undefined>,
  profileEnv: Record<string, string | null>,
  platform: string = process.platform
): Record<string, string> {
  const env: Record<string, string | undefined> = { ...base }
  for (const [key, value] of Object.entries(profileEnv)) {
    // On Windows variables ignore case: the profile `Path` cannot coexist with an inherited `PATH`.
    if (platform === 'win32') {
      for (const existing of Object.keys(env)) if (existing.toLowerCase() === key.toLowerCase()) delete env[existing]
    }
    if (value === null) delete env[key]
    else env[key] = value
  }
  // If inherited, it would make any Electron app opened from the terminal run as plain Node.
  for (const key of Object.keys(env)) {
    if (key === 'ELECTRON_RUN_AS_NODE' || (platform === 'win32' && key.toUpperCase() === 'ELECTRON_RUN_AS_NODE')) {
      delete env[key]
    }
  }
  env.TERM_PROGRAM = 'Walph'
  env.COLORTERM = 'truecolor'
  // `ls` and other BSD tools (macOS) only colorize with CLICOLOR; an inherited value or `null` in the profile wins.
  if (!Object.hasOwn(profileEnv, 'CLICOLOR')) env.CLICOLOR ??= '1'
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined))
}

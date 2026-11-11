import { isAbsolute } from 'node:path'
import { flattenControl } from '@shared/controlChars'
import { isNonEmptyString, isRecord } from '@shared/guards'
import { isValidEnvMap } from '@shared/settings'

/** What the adapter asked to run in a terminal (`runInTerminal`), validated. */
export interface RunInTerminalRequest {
  file: string
  args: string[]
  /** Absolute; empty or relative in the request = the view folder. */
  cwd: string
  /** Added to the app environment (`null` removes the variable). */
  env: Record<string, string | null>
  title: string
}

const MAX_ARGS = 1000
const MAX_ARG = 32_768

/** `null` = invalid request (the adapter gets the refusal). `args[0]` is the executable, without a shell. */
export function parseRunInTerminal(value: unknown, root: string | null): RunInTerminalRequest | null {
  if (!isRecord(value) || !Array.isArray(value.args)) return null
  const args = value.args
  if (args.length === 0 || args.length > MAX_ARGS) return null
  if (!args.every((a): a is string => typeof a === 'string' && a.length <= MAX_ARG && !a.includes('\0'))) return null
  const [file, ...rest] = args
  if (!file) return null
  const cwd = isNonEmptyString(value.cwd) && isAbsolute(value.cwd) ? value.cwd : root
  if (!cwd) return null
  const env = value.env ?? {}
  if (!isValidEnvMap(env)) return null
  const title = isNonEmptyString(value.title) ? flattenControl(value.title).trim().slice(0, 100) : ''
  return { file, args: rest, cwd, env: env as Record<string, string | null>, title }
}

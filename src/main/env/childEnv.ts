// Environment and executable lookup for child processes (Claude, docker): the login shell PATH comes from the caller.

import { statSync } from 'node:fs'
import { posix, win32 } from 'node:path'

export const isFileSync = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Looks for `name` in the ABSOLUTE folders of `pathVar` (relative entries, like `.`, would be code from the current
 * directory). On Windows tries `.exe` before the other PATHEXT extensions and the bare name last. `isFile` is
 * injectable (tests).
 */
export function findInPath(
  name: string,
  pathVar: string,
  platform: string,
  isFile: (path: string) => boolean = isFileSync,
  pathExt: string = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD'
): string | null {
  const mod = platform === 'win32' ? win32 : posix
  let exts = ['']
  if (platform === 'win32') {
    const list = pathExt
      .split(';')
      .filter(Boolean)
      .map((e) => e.toLowerCase())
    exts = ['.exe', ...list.filter((e) => e !== '.exe'), '']
  }
  for (const dir of pathVar.split(platform === 'win32' ? ';' : ':')) {
    if (dir === '' || !mod.isAbsolute(dir)) continue
    for (const ext of exts) {
      const candidate = mod.join(dir, name + ext)
      if (isFile(candidate)) return candidate
    }
  }
  return null
}

export interface ChildEnvOptions {
  platform?: string
  /** Variables whose name starts with one of these prefixes are removed (including those from `extra`). */
  stripPrefixes?: readonly string[]
}

/** Final environment: inherited + `extra` (`null` deletes) + PATH. `ELECTRON_RUN_AS_NODE` never passes. */
export function buildChildEnv(
  base: Record<string, string | undefined>,
  extra: Record<string, string | null>,
  pathVar: string | undefined,
  { platform = process.platform, stripPrefixes = [] }: ChildEnvOptions = {}
): Record<string, string> {
  const env: Record<string, string | undefined> = { ...base }
  const drop = (key: string): void => {
    // On Windows variables are case-insensitive.
    for (const existing of Object.keys(env)) {
      if (existing === key || (platform === 'win32' && existing.toLowerCase() === key.toLowerCase()))
        delete env[existing]
    }
  }
  if (pathVar) {
    drop('PATH')
    env[platform === 'win32' ? 'Path' : 'PATH'] = pathVar
  }
  for (const [key, value] of Object.entries(extra)) {
    drop(key)
    if (value !== null) env[key] = value
  }
  drop('ELECTRON_RUN_AS_NODE')
  for (const key of Object.keys(env)) {
    const name = platform === 'win32' ? key.toUpperCase() : key
    if (stripPrefixes.some((prefix) => name.startsWith(prefix))) delete env[key]
  }
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined))
}

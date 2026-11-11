// `walph` terminal command. The installed file is a GENERATED launcher (with a marker, so we only touch what is
// ours) that calls the app executable: the already running app receives the folder through `second-instance`.

import { posix, win32 } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

const MARKER_POSIX = '# walph — gerado pelo Walph'
const MARKER_WINDOWS = 'rem walph — gerado pelo Walph'

/** POSIX shell single quotes: a `'` inside the value becomes `'\''`. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function assertSingleLine(exe: string): void {
  if (/[\r\n\0]/.test(exe)) throw new UserError(t().app.cli.invalidExecutable)
}

export function posixLauncher(exe: string): string {
  assertSingleLine(exe)
  return [
    '#!/bin/sh',
    MARKER_POSIX,
    `APP=${shellQuote(exe)}`,
    'if [ ! -x "$APP" ]; then',
    // The message is fixed when the launcher is written; it must not contain `"`, `$` or backticks.
    `  echo "${t().app.cli.launcherNotFound('$APP')}" >&2`,
    '  exit 1',
    'fi',
    // An inherited `ELECTRON_RUN_AS_NODE` (VS Code, Claude Code) would turn Electron into plain Node.
    'nohup env -u ELECTRON_RUN_AS_NODE "$APP" "$@" >/dev/null 2>&1 &',
    ''
  ].join('\n')
}

export function windowsLauncher(exe: string): string {
  assertSingleLine(exe)
  // `%` is variable expansion in .cmd; `"` does not exist in Windows file names.
  const safe = exe.replace(/%/g, '%%')
  return [
    '@echo off',
    MARKER_WINDOWS,
    // cmd.exe reads the .cmd in the OEM codepage: without UTF-8, an accented path (C:\Users\João) would never exist.
    'chcp 65001 >nul',
    'setlocal',
    'set ELECTRON_RUN_AS_NODE=',
    `if not exist "${safe}" (`,
    `  echo ${t().app.cli.launcherNotFound(safe)} 1>&2`,
    '  exit /b 1',
    ')',
    `start "" "${safe}" %*`,
    ''
  ].join('\r\n')
}

/**
 * macOS: the app opened straight from the DMG (`/Volumes/…`) or "translocated" by Gatekeeper runs from a path that
 * disappears; a launcher pointing there would break. `null` = stable path.
 */
export function unstableLocationMessage(platform: string, exe: string): string | null {
  if (platform !== 'darwin') return null
  if (exe.startsWith('/Volumes/') || exe.includes('/AppTranslocation/')) {
    return t().app.cli.moveToApplications
  }
  return null
}

export function launcherFor(platform: string, exe: string): string {
  return platform === 'win32' ? windowsLauncher(exe) : posixLauncher(exe)
}

/** Is the text (start of the file) a launcher created by Walph? */
export function hasMarker(text: string): boolean {
  return text.includes(MARKER_POSIX) || text.includes(MARKER_WINDOWS)
}

/** Executable the launcher calls. AppImage: the mount path changes on every run, so `$APPIMAGE` wins. */
export function launcherExecutable(
  platform: string,
  env: Record<string, string | undefined>,
  execPath: string
): string {
  if (platform === 'linux' && env.APPIMAGE) return env.APPIMAGE
  return execPath
}

export interface CliTarget {
  /** Launcher path. */
  path: string
  /** `true` where the target may require admin rights (macOS only: `/usr/local/bin`). */
  mayNeedAdmin: boolean
}

/** Where the launcher is installed per OS. Throws if the base folder is missing (Windows with no `LOCALAPPDATA`). */
export function cliTarget(platform: string, env: { home: string; localAppData?: string }): CliTarget {
  switch (platform) {
    case 'darwin':
      return { path: '/usr/local/bin/walph', mayNeedAdmin: true }
    case 'win32':
      if (!env.localAppData) throw new UserError(t().app.cli.noLocalAppData)
      return { path: win32.join(env.localAppData, 'Microsoft', 'WindowsApps', 'walph.cmd'), mayNeedAdmin: false }
    default:
      return { path: posix.join(env.home, '.local', 'bin', 'walph'), mayNeedAdmin: false }
  }
}

/** Does `dir` appear in `pathVar`? (Linux: warn if `~/.local/bin` is not in PATH.) */
export function pathIncludes(pathVar: string | undefined, dir: string, delimiter: string): boolean {
  const strip = (p: string): string => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p)
  return (pathVar ?? '').split(delimiter).some((p) => p !== '' && strip(p) === strip(dir))
}

// Paths go in as osascript arguments (`argv`), never interpolated into the script.
export const INSTALL_APPLESCRIPT = [
  'on run argv',
  '  do shell script "mkdir -p /usr/local/bin && rm -f " & quoted form of item 2 of argv & " && cp " & quoted form of item 1 of argv & " " & quoted form of item 2 of argv & " && chmod 755 " & quoted form of item 2 of argv with administrator privileges',
  'end run'
].join('\n')

export const UNINSTALL_APPLESCRIPT = [
  'on run argv',
  '  do shell script "rm -f " & quoted form of item 1 of argv with administrator privileges',
  'end run'
].join('\n')

/** The user cancelled the macOS password dialog (AppleScript error -128). */
export function isOsascriptCancel(stderr: string): boolean {
  return /\(-128\)|User canceled/i.test(stderr)
}

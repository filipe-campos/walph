import { basename } from 'node:path'

const POSIX_LOGIN_SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'ksh'])

/**
 * Terminal shell: the one configured in `terminal.shell` (if not empty) or the OS default. On known POSIX shells
 * (outside Windows) uses `-l` to load the user's PATH (the app opened from Finder inherits a minimal PATH); other
 * executables get empty arguments, since we do not know whether they accept `-l`.
 */
export function resolveShell(
  configured: string,
  platform: string,
  envShell: string | undefined
): { file: string; args: string[] } {
  const custom = configured.trim()
  if (!custom) {
    if (platform === 'win32') return { file: 'powershell.exe', args: [] }

    return { file: envShell || '/bin/bash', args: ['-l'] }
  }
  if (platform === 'win32') return { file: custom, args: [] }
  const name = basename(custom)
  return { file: custom, args: POSIX_LOGIN_SHELLS.has(name) ? ['-l'] : [] }
}

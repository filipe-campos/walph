import { posix, win32 } from 'node:path'

/**
 * Automatic title from the name of the foreground process: basename, without `.exe` on Windows and without the `-` of
 * login shells (`-zsh`). Empty if nothing is left.
 */
export function normalizeProcessTitle(name: string, platform: string = process.platform): string {
  const trimmed = name.trim()
  // Windows accepts both slashes; elsewhere `\` is a valid name character.
  let base = (platform === 'win32' ? win32 : posix).basename(trimmed)
  if (platform === 'win32') base = base.replace(/\.exe$/i, '')
  return base.replace(/^-+/, '').trim()
}

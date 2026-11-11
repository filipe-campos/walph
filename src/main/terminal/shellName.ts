const SHELLS = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'csh',
  'tcsh',
  'nu',
  'elvish',
  'xonsh',
  'pwsh',
  'powershell',
  'cmd'
])

/** Is the pty foreground process the shell itself (idle)? `-zsh` (login), paths and `.exe` are normalized. */
export function isShellProcess(name: string | undefined | null): boolean {
  if (!name) return false
  const base = name
    .trim()
    .split(/[\\/]/)
    .pop()!
    .replace(/^-/, '')
    .replace(/\.exe$/i, '')
    .toLowerCase()
  return SHELLS.has(base)
}

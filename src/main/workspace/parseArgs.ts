import { isAbsolute, resolve } from 'node:path'

/**
 * Extracts the folder passed on the command line.
 * - packaged: argv = [exe, folder]
 * - dev / `electron . folder` / `electron out/main/index.js folder`: argv = [electron, appPath, folder]
 * Flags (`-x`, `--remote-debugging-port=…`, `--user-data-dir=…`) are ignored; a relative path resolves from `cwd`.
 */
export function folderFromArgv(argv: string[], cwd: string, isPackaged: boolean): string | null {
  const args = argv.slice(1).filter((a) => a && !a.startsWith('-'))
  // Not packaged: the 1st argument without `-` is the script/app (`.`, `out/main/index.js`); Chromium may inject flags
  // before it in the argv forwarded by `second-instance`, so a fixed count cannot be skipped.
  const arg = isPackaged ? args[0] : args[1]
  if (!arg) return null
  return isAbsolute(arg) ? resolve(arg) : resolve(cwd, arg)
}

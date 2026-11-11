// Installs/uninstalls the `walph` terminal command (generated launcher, see `cli/launcherScript.ts`).

import { app, type WebContents } from 'electron'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { writeFileAtomic } from '../fs/atomicWrite'
import { runCollect } from '../process/runCollect'
import { confirmDestructive } from '../window/nativeUi'
import {
  cliTarget,
  hasMarker,
  INSTALL_APPLESCRIPT,
  isOsascriptCancel,
  launcherExecutable,
  launcherFor,
  pathIncludes,
  unstableLocationMessage,
  UNINSTALL_APPLESCRIPT
} from '../cli/launcherScript'
import { handle } from './typed'
import { t } from '@shared/i18n'
import { omitUndefined } from '@shared/omitUndefined'
import { UserError } from '../errors'

const NEEDS_ADMIN = new Set(['EACCES', 'EPERM', 'ENOENT'])
const code = (err: unknown): string | undefined => (err as NodeJS.ErrnoException | null)?.code

/** Start of the file (the marker is in the first lines); `null` if missing. Never reads a large file whole. */
async function readHead(path: string): Promise<string | null> {
  let handle
  try {
    handle = await open(path, 'r')
  } catch (err) {
    if (code(err) === 'ENOENT') return null
    throw err
  }
  try {
    const buffer = Buffer.alloc(2048)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

/** `osascript` with the script and the paths as arguments (nothing is interpolated into the script). */
async function runOsascript(script: string, args: string[]): Promise<boolean> {
  const result = await runCollect('osascript', ['-e', script, ...args], { timeout: 120_000 })
  if (!result.spawnError && !result.timedOut && result.code === 0) return true
  // The user cancelled the password prompt: not an error, the caller returns `null`.
  if (isOsascriptCancel(result.stderr)) return false
  throw new UserError(t().app.cli.adminFailed)
}

function target() {
  if (!app.isPackaged) throw new UserError(t().app.cli.notInstalledApp)
  return cliTarget(process.platform, { home: homedir(), ...omitUndefined({ localAppData: process.env.LOCALAPPDATA }) })
}

async function install(sender: WebContents): Promise<string | null> {
  const { path, mayNeedAdmin } = target()
  const exe = launcherExecutable(process.platform, process.env, process.execPath)
  const unstable = unstableLocationMessage(process.platform, exe)
  if (unstable) throw new UserError(unstable)
  const text = launcherFor(process.platform, exe)
  // Only ENOENT means "does not exist"; any other read error (EACCES, EISDIR) falls into the confirmation.
  let existing: string | null
  try {
    existing = await readHead(path)
  } catch {
    existing = ''
  }
  if (existing !== null && !hasMarker(existing)) {
    const replace = await confirmDestructive(sender, {
      message: t().app.cli.fileExists(path),
      detail: t().app.cli.fileExistsDetail,
      confirmLabel: t().app.cli.replace
    })
    if (!replace) return null
  }
  try {
    // `rename` replaces the path itself (a symbolic link included), without writing through it.
    await writeFileAtomic(path, text, { mode: 0o755, forceMode: true, mkdirp: true, followSymlinks: false })
  } catch (err) {
    if (!(mayNeedAdmin && process.platform === 'darwin' && NEEDS_ADMIN.has(code(err) ?? ''))) {
      throw new UserError(t().app.cli.installFailed(path), { cause: err })
    }
    // /usr/local/bin is usually owned by root: writes to a temp file and copies it with administrator rights.
    const dir = await mkdtemp(join(app.getPath('temp'), 'walph-cli-'))
    try {
      const tmp = join(dir, 'walph')
      await writeFileAtomic(tmp, text, { mode: 0o755 })
      if (!(await runOsascript(INSTALL_APPLESCRIPT, [tmp, path]))) return null
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  let message = t().app.cli.installed(path)
  if (process.platform === 'linux' && !pathIncludes(process.env.PATH, dirname(path), delimiter)) {
    message += ` ${t().app.cli.addToPath(dirname(path))}`
  }
  return message
}

async function uninstall(): Promise<string | null> {
  const { path, mayNeedAdmin } = target()
  let existing: string | null
  try {
    existing = await readHead(path)
  } catch (err) {
    throw new UserError(t().app.cli.readFailed(path), { cause: err })
  }
  if (existing === null) throw new UserError(t().app.cli.notInstalled)
  if (!hasMarker(existing)) {
    throw new UserError(t().app.cli.notOurs(path))
  }
  try {
    // Removes only the launcher Walph itself generated (checked above); it is not a user file, so no trash.
    await rm(path, { force: true })
  } catch (err) {
    if (!(mayNeedAdmin && process.platform === 'darwin' && NEEDS_ADMIN.has(code(err) ?? ''))) {
      throw new UserError(t().app.cli.removeFailed(path), { cause: err })
    }
    if (!(await runOsascript(UNINSTALL_APPLESCRIPT, [path]))) return null
  }
  return t().app.cli.removed(path)
}

export function registerCliHandlers(): void {
  handle('cli:install', (e) => install(e.sender))
  handle('cli:uninstall', () => uninstall())
}

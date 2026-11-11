import { randomBytes } from 'node:crypto'
import {
  closeSync,
  fchmodSync,
  fchownSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
  type Stats
} from 'node:fs'
import { lstat, mkdir, open, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { t } from '@shared/i18n'
import { createLog } from '../log'
import { AlreadyExistsError } from './moveNoOverwrite'
import { linkTarget } from './paths'
import { UserError } from '../errors'

const log = createLog('atomicWrite')

export interface AtomicWriteOptions {
  /** Mode of a NEW file (an existing file keeps its own). Default 0o666 minus the umask. */
  mode?: number
  /** With `mode`, imposes the mode on an existing file too (e.g. the `walph` launcher, always 0o755). */
  forceMode?: boolean
  /**
   * Async version only: if the temp file cannot be created (non-writable folder, name too long) or the rename
   * fails for good (Windows, file open without FILE_SHARE_DELETE), writes directly to the file itself. Loses
   * atomicity, but the editor keeps saving where it always saved.
   */
  fallbackInPlace?: boolean
  /** Creates the missing folders before writing. */
  mkdirp?: boolean
  /**
   * Follows a symlink at the destination and writes to the target (the link stays a link). `false`: the rename replaces
   * the link itself.
   */
  followSymlinks?: boolean
  /**
   * Dangling link: creates the target (as `writeFile` did) instead of refusing. Only for the editor, which has no
   * folder restriction; anyone validating containment (`resolveInsideRoot`) must never use this.
   */
  allowDangling?: boolean
  /**
   * Called right before the rename; `false` discards the temp file without writing (returns `false`). When present, the
   * rename is synchronous: check + rename cannot be split by an `await` (see `session/asyncWriter.ts`).
   */
  beforeRename?: () => boolean
}

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [15, 40, 100]

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? Buffer.from(data, 'utf8') : data
}

/** `.<name>.walph-<12 hex>.tmp`: temp file of `writeFileAtomic` (the workspace watcher ignores it). */
export function isAtomicTempPath(path: string): boolean {
  return /(^|[\\/])\..+\.walph-[0-9a-f]{12}\.tmp$/.test(path)
}

/** Temp file in the SAME folder (rename is only atomic on the same volume); dot name so it does not show as a file. */
function tempPathFor(target: string): string {
  return resolve(dirname(target), `.${basename(target)}.walph-${randomBytes(6).toString('hex')}.tmp`)
}

/** Windows: antivirus/indexer/watcher hold the destination briefly and the rename fails with EPERM/EBUSY/EACCES. */
function shouldRetry(err: unknown, attempt: number): boolean {
  return (
    process.platform === 'win32' &&
    attempt < RETRY_DELAYS_MS.length &&
    RETRY_CODES.has((err as NodeJS.ErrnoException).code ?? '')
  )
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Actual destination: if `path` is a symlink, the resolved target; otherwise `path` itself. A DANGLING link is refused:
 * following the `readlink` would create the target wherever it points (including outside the open folder).
 */
export async function resolveWriteTarget(path: string, allowDangling = false): Promise<string> {
  try {
    if (!(await lstat(path)).isSymbolicLink()) return path
  } catch {
    return path
  }
  try {
    return await realpath(path)
  } catch {
    if (allowDangling) return linkTarget(path, await readlink(path))
    throw new UserError(t().files.errors.danglingSymlink)
  }
}

function resolveWriteTargetSync(path: string): string {
  try {
    if (!lstatSync(path).isSymbolicLink()) return path
  } catch {
    return path
  }
  try {
    return realpathSync(path)
  } catch {
    throw new UserError(t().files.errors.danglingSymlink)
  }
}

/** Failures creating the temp file where the editor can still write to the file itself. */
const TEMP_FALLBACK_CODES = new Set(['EACCES', 'EPERM', 'EROFS', 'ENAMETOOLONG'])
const RENAME_FALLBACK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

const codeOf = (err: unknown): string => (err as NodeJS.ErrnoException).code ?? ''

/** File systems without fsync (some FUSE/network ones): the save goes on without the durability guarantee. */
const FSYNC_UNSUPPORTED_CODES = new Set(['EINVAL', 'ENOTSUP', 'ENOSYS'])
let warnedFsyncUnsupported = false

function tolerateFsyncUnsupported(err: unknown): void {
  if (!FSYNC_UNSUPPORTED_CODES.has(codeOf(err))) throw err
  if (warnedFsyncUnsupported) return
  warnedFsyncUnsupported = true
  log.warn(`fsync not supported (${codeOf(err)}); writing without syncing the temp file.`)
}

interface ExistingInfo {
  mode: number
  uid: number
  gid: number
}

const toExisting = (info: Stats): ExistingInfo => ({ mode: info.mode & 0o7777, uid: info.uid, gid: info.gid })

/** An existing file keeps its mode (unless `forceMode`); a new one uses `options.mode`. `undefined` = umask default. */
function pickMode(options: AtomicWriteOptions, existing: ExistingInfo | null): number | undefined {
  return options.forceMode ? (options.mode ?? existing?.mode) : (existing?.mode ?? options.mode)
}

/** Mode and owner of the existing destination (`null` = new file). `lstat` when the link itself is the destination. */
async function existingInfo(path: string, followSymlinks: boolean): Promise<ExistingInfo | null> {
  try {
    return toExisting(await (followSymlinks ? stat(path) : lstat(path)))
  } catch {
    return null
  }
}

function existingInfoSync(path: string, followSymlinks: boolean): ExistingInfo | null {
  try {
    return toExisting(followSymlinks ? statSync(path) : lstatSync(path))
  } catch {
    return null
  }
}

/** Makes the rename durable (the folder entry); does not exist on Windows and failing here never undoes the write. */
async function syncDir(dir: string): Promise<void> {
  if (process.platform === 'win32') return
  try {
    const handle = await open(dir, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    // Best effort.
  }
}

/**
 * Writes `data` to `path` atomically: a random temp file next to it (opened with `wx`, so a link planted with a
 * predictable name is never followed) + rename over it. A quit/ENOSPC midway never leaves the file truncated; the
 * temp file is removed on any failure. Keeps the `mode` of the existing file (unless `forceMode`). A dangling
 * symlink is refused (see `resolveWriteTarget`).
 * Known limits: ACL/xattrs are not copied (only owner/group, best effort on POSIX); a crash between creating and
 * renaming leaves an orphan `.x.walph-*.tmp` in the folder (there is no sweep, the watcher only ignores it).
 * Returns `false` only when `beforeRename` vetoed.
 */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {}
): Promise<boolean> {
  if (!isAbsolute(path)) throw new UserError(t().files.errors.invalidPath)
  const follow = options.followSymlinks !== false
  const target = follow ? await resolveWriteTarget(path, options.allowDangling) : path
  if (options.mkdirp) await mkdir(dirname(target), { recursive: true })
  const existing = await existingInfo(target, follow)
  const mode = pickMode(options, existing)
  const temp = tempPathFor(target)
  let tempCreated = false
  try {
    const handle = await open(temp, 'wx', mode ?? 0o666)
    tempCreated = true
    try {
      await handle.writeFile(toBytes(data))
      // Best effort: preserves owner/group when the process can (root, or same owner in a different group). Before
      // chmod: on Linux a regular user's chown clears setuid/setgid.
      if (existing && process.platform !== 'win32')
        await handle.chown(existing.uid, existing.gid).catch(() => undefined)
      // The umask may have dropped bits at creation; restores the requested/original mode.
      if (mode !== undefined) await handle.chmod(mode)
      // Without this a crash right after the rename can leave the destination empty: the rename reaches disk before
      // the data.
      await handle.sync().catch(tolerateFsyncUnsupported)
    } finally {
      await handle.close()
    }
    if (options.beforeRename) {
      if (!options.beforeRename()) {
        await rm(temp, { force: true })
        return false
      }
      renameSync(temp, target)
      await syncDir(dirname(target))
      return true
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temp, target)
        await syncDir(dirname(target))
        return true
      } catch (err) {
        if (!shouldRetry(err, attempt)) throw err
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      }
    }
  } catch (err) {
    await rm(temp, { force: true }).catch(() => undefined)
    const fallback = tempCreated ? RENAME_FALLBACK_CODES : TEMP_FALLBACK_CODES
    if (options.fallbackInPlace && !options.beforeRename && fallback.has(codeOf(err))) {
      await writeFile(target, toBytes(data), { mode: options.mode })
      return true
    }
    throw err
  }
}

/**
 * Creates a NEW file with `data` (`O_EXCL`): never overwrites nor follows a link planted at the destination. Creates
 * the missing folders. An occupied destination throws `AlreadyExistsError` (the caller tells it by type, not by text).
 */
export async function createFileExclusive(
  path: string,
  data: string | Uint8Array,
  options: { mode?: number } = {}
): Promise<void> {
  if (!isAbsolute(path)) throw new UserError(t().files.errors.invalidPath)
  await mkdir(dirname(path), { recursive: true })
  let handle
  try {
    handle = await open(path, 'wx', options.mode ?? 0o666)
  } catch (err) {
    if (codeOf(err) === 'EEXIST') throw new AlreadyExistsError(basename(path), { cause: err })
    throw err
  }
  try {
    await handle.writeFile(toBytes(data))
  } catch (err) {
    // The file is ours (O_EXCL): a truncated leftover would block the creation forever.
    await handle.close().catch(() => undefined)
    await rm(path, { force: true }).catch(() => undefined)
    throw err
  }
  await handle.close()
}

/**
 * Synchronous version of `writeFileAtomic`, to write before the process exits (flush on close, `windows.json`).
 * Does not sync the folder: runs on the main thread for frequent state files and a second fsync would block it.
 */
export function writeFileAtomicSync(path: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): void {
  if (!isAbsolute(path)) throw new UserError(t().files.errors.invalidPath)
  const follow = options.followSymlinks !== false
  const target = follow ? resolveWriteTargetSync(path) : path
  if (options.mkdirp) mkdirSync(dirname(target), { recursive: true })
  const existing = existingInfoSync(target, follow)
  const mode = pickMode(options, existing)
  const temp = tempPathFor(target)
  try {
    const fd = openSync(temp, 'wx', mode ?? 0o666)
    try {
      const bytes = toBytes(data)
      let offset = 0
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset)
      if (existing && process.platform !== 'win32') {
        try {
          fchownSync(fd, existing.uid, existing.gid)
        } catch {
          // No permission to change the owner: keeps the process one.
        }
      }
      if (mode !== undefined) fchmodSync(fd, mode)
      try {
        fsyncSync(fd)
      } catch (err) {
        tolerateFsyncUnsupported(err)
      }
    } finally {
      closeSync(fd)
    }
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(temp, target)
        return
      } catch (err) {
        if (!shouldRetry(err, attempt)) throw err
        sleepSync(RETRY_DELAYS_MS[attempt] ?? 0)
      }
    }
  } catch (err) {
    rmSync(temp, { force: true })
    throw err
  }
}

/**
 * Writes a JSON synchronously and atomically. Synchronous on purpose: the state files are tiny and the write
 * must finish before the process exits. Creates the folder if missing.
 */
export function writeJsonAtomicSync(path: string, data: unknown): void {
  writeFileAtomicSync(path, JSON.stringify(data), { mkdirp: true })
}

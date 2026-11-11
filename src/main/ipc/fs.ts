import { clipboard, ClipboardItem, shell } from 'electron'
import { constants, lstatSync } from 'node:fs'
import { access, cp, mkdir, open, readdir, realpath, type FileHandle } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { assertAbsolutePath, assertValidName, isAbsolutePathInput } from '../fs/validate'
import { describeFsError } from '../fs/describeFsError'
import { describeWriteError } from '../fs/describeWriteError'
import { trashPath } from '../fs/trashPath'
import { decodeText, detectEncoding, encodeText, hasUtf16Bom, isTextEncoding } from '../fs/encoding'
import { assertReadableImage, MAX_IMAGE_BYTES, toDataUrl } from '../fs/imageFile'
import { resolveEntryInsideRoot, resolveInsideRoot } from '../fs/paths'
import { describeMoveError, planMove, rebaseUnderRoot } from '../fs/movePlan'
import { AlreadyExistsError, lstatOrNull, moveNoOverwrite } from '../fs/moveNoOverwrite'
import { createFileExclusive, writeFileAtomic } from '../fs/atomicWrite'
import { renameEntry } from '../fs/renameEntry'
import { classifyFolder } from '../fs/folderState'
import { nextCopyName } from '../fs/copyName'
import { buildFilenamesPlist, parseFilenamesPlist, parseFileUrlList } from '../fs/clipboardFiles'
import { popupChoice } from '../window/nativeUi'
import { buildExplorerMenu, parseSelectionCount } from '../fs/explorerMenu'
import { isInside, samePath } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { requireViewRoot } from '../window/ownRoot'
import type { DirEntry, ExplorerAction, TextEncoding, TextFile } from '@shared/types'
import { handle, on } from './typed'
import { bool, record } from '../validate/args'
import { UserError } from '../errors'
import { allowWrite, assertWritable, clearWriteAccess } from '../fs/writeAccess'
import { onWindowRootChange } from '../window/windows'

const HIDDEN = new Set(['.git', '.DS_Store'])
const MAX_FILE_SIZE = 10 * 1024 * 1024

async function readDir(dir: string): Promise<DirEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((err: unknown) => {
    throw describeFsError(err, dir)
  })
  const result = await Promise.all(
    entries
      .filter((e) => !HIDDEN.has(e.name))
      .map(async (e) => {
        const path = join(dir, e.name)
        // Symlinks: follows the target to know whether it is a directory.
        const dirFlag = e.isSymbolicLink() ? (await classifyFolder(path)).state === 'dir' : e.isDirectory()
        return { name: e.name, path, isDirectory: dirFlag }
      })
  )
  return result.sort((a, b) =>
    a.isDirectory === b.isDirectory
      ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
      : a.isDirectory
        ? -1
        : 1
  )
}

/** Reads up to `limit + 1` bytes from an open handle: the extra byte reveals a file that grew past the limit. */
async function readCapped(handle: FileHandle, limit: number): Promise<Buffer> {
  const buffer = Buffer.alloc(limit + 1)
  let read = 0
  while (read < buffer.length) {
    const { bytesRead } = await handle.read(buffer, read, buffer.length - read, read)
    if (bytesRead === 0) break
    read += bytesRead
  }
  return buffer.subarray(0, read)
}

async function readTextFile(rawPath: unknown, forced?: TextEncoding): Promise<TextFile> {
  const path = assertAbsolutePath(rawPath)
  // `O_NONBLOCK`: opening a FIFO/socket without a writer would block a libuv pool thread forever.
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK).catch((err: unknown) => {
    throw describeFsError(err, path)
  })
  let buffer: Buffer
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new UserError(t().files.errors.notAFile)
    if (info.size > MAX_FILE_SIZE) throw new UserError(t().files.errors.tooLargeForEditor)
    buffer = await readCapped(handle, MAX_FILE_SIZE)
  } finally {
    await handle.close()
  }
  if (buffer.length > MAX_FILE_SIZE) throw new UserError(t().files.errors.tooLargeForEditor)
  const encoding = forced ?? detectEncoding(buffer)
  // Simple binary heuristic: a null byte in the first 8KB. UTF-16 has nulls by nature: with a BOM, or forced
  // by the user, it is not binary.
  const utf16 = encoding === 'utf16le' || encoding === 'utf16be' || hasUtf16Bom(buffer)
  if (!utf16 && buffer.subarray(0, 8192).includes(0)) throw new UserError(t().files.errors.binaryFile)
  return { text: decodeText(buffer, encoding), encoding }
}

function parseEncoding(value: unknown): TextEncoding | undefined {
  if (value === undefined) return undefined
  if (!isTextEncoding(value)) throw new UserError(t().files.errors.invalidEncoding)
  return value
}

/**
 * Image for the Markdown preview and the viewer: any absolute path (like `readFile`, reading is free),
 * image extension, regular file, up to 10 MB. `O_NONBLOCK` avoids blocking on a FIFO; the read never exceeds the limit.
 */
async function readImageFile(rawPath: unknown): Promise<string> {
  const path = assertAbsolutePath(rawPath)
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK).catch((err: NodeJS.ErrnoException) => {
    throw new UserError(err.code === 'EACCES' ? t().files.errors.imageNoPermission : t().files.errors.imageNotFound)
  })
  try {
    const info = await handle.stat()
    const mime = assertReadableImage(path, { isFile: info.isFile(), size: info.size })
    const buffer = await readCapped(handle, MAX_IMAGE_BYTES)
    if (buffer.length > MAX_IMAGE_BYTES) throw new UserError(t().files.errors.imageTooLarge)
    return toDataUrl(mime, buffer)
  } finally {
    await handle.close()
  }
}

async function assertFree(path: string): Promise<void> {
  try {
    await access(path)
  } catch {
    return
  }
  throw new AlreadyExistsError(basename(path))
}

/** Failure creating a new item (file or folder): the errno becomes translated text. */
function describeCreateError(err: unknown, path: string): Error {
  return describeWriteError(err, path, {
    overrides: { EEXIST: t().files.errors.alreadyExists(basename(path)), ENOENT: t().files.errors.targetDirMissing },
    fallback: (name, message) => t().files.errors.writeFailed(name, message)
  })
}

/** Folder where the explorer creates an item: inside the view folder (itself included), by the real path. */
async function createTarget(root: string, dir: unknown, name: unknown): Promise<string> {
  const parent = await resolveInsideRoot(root, assertAbsolutePath(dir))
  const path = join(parent, assertValidName(name))
  await assertFree(path)
  return path
}

async function moveEntry(root: string, path: unknown, targetDir: unknown): Promise<string> {
  if (typeof path !== 'string' || typeof targetDir !== 'string' || !path || path.includes('\0')) {
    throw new UserError(t().files.errors.invalidPath)
  }
  if (samePath(root, resolve(root, path))) throw new UserError(t().files.errors.cannotMoveRoot)
  // Only the PARENT is resolved: if the item is a symlink (even pointing outside the folder), the link itself moves.
  const source = await resolveEntryInsideRoot(root, path)
  const parent = dirname(source)
  const name = basename(source)
  const info = await lstatOrNull(source)
  if (!info) throw new UserError(t().files.errors.moveSourceGone)
  const target = await resolveInsideRoot(root, targetDir)
  const plan = planMove(root, source, target)
  if (plan.kind === 'noop') return path
  if ((await classifyFolder(target)).state !== 'dir') throw new UserError(t().files.errors.targetDirMissing)

  // Check by the real paths: a destination through a symlink landing inside the source, or in the same source folder.
  const realRoot = await realpath(root)
  const realParent = await realpath(parent)
  const realTarget = await realpath(target)
  if (samePath(realParent, realTarget)) return path
  if (info.isDirectory() && isInside(join(realParent, name), realTarget)) {
    throw new UserError(t().files.errors.moveIntoItself)
  }
  const destination = join(rebaseUnderRoot(root, realRoot, realTarget), name)

  try {
    if (await lstatOrNull(destination)) throw new AlreadyExistsError(name)
    await moveNoOverwrite(source, destination, info)
  } catch (err) {
    if (err instanceof AlreadyExistsError) throw err
    throw describeMoveError(err, name) ?? describeWriteError(err, destination)
  }
  return destination
}

/**
 * Copies `src` (any path) into `destDir` (inside the view folder). The destination name is the source's
 * when free; otherwise the next "copy". `errorOnExist` covers the race between the check and the copy.
 */
async function copyEntry(root: string, rawSrc: unknown, rawDestDir: unknown): Promise<string> {
  const src = resolve(assertAbsolutePath(rawSrc))
  const info = await lstatOrNull(src)
  if (!info) throw new UserError(t().files.errors.copySourceGone)
  const target = await resolveInsideRoot(root, assertAbsolutePath(rawDestDir))
  if ((await classifyFolder(target)).state !== 'dir') throw new UserError(t().files.errors.targetDirMissing)

  if (info.isDirectory()) {
    const realSrc = await realpath(src)
    if (isInside(realSrc, await realpath(target))) throw new UserError(t().files.errors.copyIntoItself)
  }
  const name = basename(src)
  let destination = join(target, name)
  if (await lstatOrNull(destination)) {
    destination = join(
      target,
      nextCopyName(name, (c) => lstatSync(join(target, c), { throwIfNoEntry: false }) !== undefined, info.isDirectory())
    )
  }
  try {
    await cp(src, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true })
  } catch (err) {
    throw describeWriteError(err, destination)
  }
  return destination
}

const NS_FILENAMES = 'electron application/osclipboard;format="NSFilenamesPboardType"'

async function readClipboardText(type: string): Promise<string> {
  for (const item of await clipboard.read()) {
    if (item.types.includes(type)) return ((await item.getType(type)) as Blob).text()
  }
  return ''
}

/** Files from the OS clipboard: macOS reads the whole Finder list; the other OSes, `text/uri-list` (best effort). */
async function nativeClipboardFiles(): Promise<string[]> {
  let paths: string[] = []
  try {
    if (process.platform === 'darwin' && (await clipboard.has(NS_FILENAMES))) {
      paths = parseFilenamesPlist(await readClipboardText(NS_FILENAMES))
    } else if (await clipboard.has('text/uri-list')) {
      paths = parseFileUrlList(await readClipboardText('text/uri-list'))
    }
  } catch {
    return []
  }
  const alive = await Promise.all(paths.map(async (p) => ((await lstatOrNull(p)) ? p : null)))
  return alive.filter((p): p is string => p !== null)
}

export function registerFsHandlers(): void {
  onWindowRootChange((wc) => clearWriteAccess(wc))
  handle('fs:readDir', (_e, dir: unknown) => readDir(assertAbsolutePath(dir)))
  handle('fs:readFile', async (_e, path: unknown) => (await readTextFile(path)).text)
  handle('fs:readText', async (e, path: unknown, encoding?: unknown) => {
    const file = await readTextFile(path, parseEncoding(encoding))
    await allowWrite(e.sender, assertAbsolutePath(path))
    return file
  })
  handle('fs:readImage', (_e, path: unknown) => readImageFile(path))
  handle('fs:writeFile', async (e, rawPath: unknown, content: unknown, encoding?: unknown) => {
    const path = assertAbsolutePath(rawPath)
    await assertWritable(e.sender, path)
    if (typeof content !== 'string') throw new UserError(t().files.errors.invalidContent)
    // Encodes before touching the disk: a character with no representation rejects without writing anything.
    const bytes = encodeText(content, parseEncoding(encoding) ?? 'utf8')
    try {
      // Recreates the folder if the file (and the directory) were deleted outside the editor.
      await mkdir(dirname(path), { recursive: true })
      // `allowDangling`: saving a dangling link recreates the target, as before the atomic write.
      await writeFileAtomic(path, bytes, { fallbackInPlace: true, allowDangling: true })
    } catch (err) {
      throw describeWriteError(err, path)
    }
  })

  handle('fs:copy', (e, src: unknown, destDir: unknown) => copyEntry(requireViewRoot(e.sender), src, destDir))
  handle('fs:clipboardFiles', () => nativeClipboardFiles())
  handle('fs:writeClipboardFiles', async (_e, paths: unknown) => {
    if (process.platform !== 'darwin') return false
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 1000) return false
    const valid = paths.filter((p): p is string => isAbsolutePathInput(p))
    if (valid.length !== paths.length) return false
    await clipboard.write([new ClipboardItem({ [NS_FILENAMES]: new Blob([buildFilenamesPlist(valid)]) })])
    return true
  })

  handle('fs:move', (e, path: unknown, targetDir: unknown) => moveEntry(requireViewRoot(e.sender), path, targetDir))

  handle('fs:exists', async (_e, rawPath: unknown) => {
    const path = assertAbsolutePath(rawPath)
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  })

  // Explorer mutations: only inside the view folder. `readFile`/`exists` stay free (the editor opens outside files
  // and the session checks outside tabs); `writeFile` only writes what `fs/writeAccess` recognizes.
  handle('fs:createFile', async (e, dir: unknown, name: unknown) => {
    const path = await createTarget(requireViewRoot(e.sender), dir, name)
    await createFileExclusive(path, '').catch((err: unknown) => {
      throw describeCreateError(err, path)
    })
    return path
  })

  handle('fs:createDir', async (e, dir: unknown, name: unknown) => {
    const path = await createTarget(requireViewRoot(e.sender), dir, name)
    await mkdir(path).catch((err: unknown) => {
      throw describeCreateError(err, path)
    })
    return path
  })

  handle('fs:rename', async (e, path: unknown, newName: unknown) => {
    const name = assertValidName(newName)
    const entry = await resolveEntryInsideRoot(requireViewRoot(e.sender), assertAbsolutePath(path))
    return renameEntry(entry, name)
  })

  // Goes to the system trash (reversible), never deletes permanently.
  handle('fs:trash', async (e, path: unknown) => {
    const entry = await resolveEntryInsideRoot(requireViewRoot(e.sender), assertAbsolutePath(path))
    await trashPath(entry)
  })

  on('fs:copyPath', (_e, path: unknown) => {
    // May be relative ("Copy Relative Path"): it only needs to be text.
    if (typeof path === 'string') void clipboard.writeText(path)
  })
  // No-reply channel: invalid input is ignored (throwing here would open main's error dialog).
  on('fs:reveal', (_e, path: unknown) => {
    if (isAbsolutePathInput(path)) shell.showItemInFolder(path)
  })

  handle('fs:contextMenu', (e, rawIsDir: unknown, rawOptions?: unknown) => {
    const options = record(rawOptions)
    return popupChoice<ExplorerAction>(
      e.sender,
      buildExplorerMenu({
        isDir: bool(rawIsDir),
        canPaste: bool(options.canPaste),
        canCompare: bool(options.canCompare),
        selectionCount: parseSelectionCount(options.selectionCount),
        platform: process.platform
      })
    )
  })
}

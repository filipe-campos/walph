// Claude box attachments: (1) `loadAttachments` reads the message attachments from disk on send; (2) `pickAttachments`/
// `authorizeAttachments` validate the chosen/dropped files BEFORE they become chips. A path outside the window
// folder only counts if main allowed it (its native dialog or a confirmation); the allowed list is per view
// (`fs/pathAllowlist.ts`). Individual failures on send become an `unreadable` attachment: the message goes on, and
// Claude learns that the file could not be read.

import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import type { ClaudeAttachmentFile, ClaudeAttachmentResult, ClaudeImage } from '@shared/types'
import { t } from '@shared/i18n'
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS, sliceLines, type LoadedAttachment } from './buildPrompt'
import { readTextOrNull } from './safePath'
import { hasUtf16Bom } from '../fs/encoding'
import { resolveInsideRoot } from '../fs/paths'
import type { PathCheck } from '../fs/pathAllowlist'
import { isAbsolutePathInput } from '../fs/validate'
import { isRecord } from '@shared/guards'
import { UserError } from '../errors'
import { omitUndefined } from '@shared/omitUndefined'

/** Maximum read per text file (bytes); the text is still cut at `MAX_ATTACHMENT_CHARS` when building the prompt. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
/** Images (png/jpeg/gif/webp): the API limit. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_READ_BYTES = MAX_TEXT_BYTES
const HIDDEN = new Set(['.git', '.DS_Store'])

const IMAGE_TYPES: Record<string, ClaudeImage['mediaType']> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}
/** Extensions that are binary even without a NUL in the first bytes (PDF, archives, executables…). */
const BINARY_EXTENSIONS = new Set([
  'pdf',
  'zip',
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'tar',
  'dmg',
  'iso',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'class',
  'jar',
  'wasm',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'wav',
  'flac',
  'ogg',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'ico',
  'bmp',
  'tiff',
  'heic',
  'psd',
  'sqlite',
  'db'
])

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))
const mb = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`

export type AttachmentKind =
  { kind: 'image'; mediaType: ClaudeImage['mediaType'] } | { kind: 'text' } | { kind: 'rejected'; reason: string }

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Kind and size limit of an attachment from its name and size (pure): image up to 5 MB, text up to 2 MB, known binary
 * refused. The content is still checked by `looksBinary` when the file is read.
 */
export function classifyAttachment(name: string, size: number): AttachmentKind {
  const ext = extensionOf(name)
  const mediaType = IMAGE_TYPES[ext]
  if (mediaType) {
    return size > MAX_IMAGE_BYTES
      ? { kind: 'rejected', reason: t().claudeHost.attachments.imageTooLarge(mb(MAX_IMAGE_BYTES)) }
      : { kind: 'image', mediaType }
  }
  if (BINARY_EXTENSIONS.has(ext)) return { kind: 'rejected', reason: t().claudeHost.attachments.binary }
  if (size > MAX_TEXT_BYTES)
    return { kind: 'rejected', reason: t().claudeHost.attachments.tooLarge(mb(MAX_TEXT_BYTES)) }
  return { kind: 'text' }
}

/** A NUL in the first 8 KB = binary, except with a UTF-16 BOM (same heuristic as `readTextOrNull`). */
export function looksBinary(head: Uint8Array): boolean {
  return !hasUtf16Bom(Buffer.from(head.buffer, head.byteOffset, head.byteLength)) && head.subarray(0, 8192).includes(0)
}

async function readHead(path: string): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

type Inspected = { file: ClaudeAttachmentFile } | { reason: string }

/** Checks an already authorized path: it exists, is a file, fits its kind's limit, is not binary. Images are read. */
async function inspectFile(path: string): Promise<Inspected> {
  const name = basename(path)
  let info
  try {
    info = await stat(path)
  } catch {
    return { reason: t().claudeHost.attachments.notFound }
  }
  if (info.isDirectory()) return { file: { path, name: `${name}/`, size: 0 } }
  if (!info.isFile()) return { reason: t().claudeHost.attachments.notRegularFile }
  const kind = classifyAttachment(name, info.size)
  if (kind.kind === 'rejected') return { reason: kind.reason }
  try {
    if (kind.kind === 'image') {
      const data = (await readFile(path)).toString('base64')
      return { file: { path, name, size: info.size, image: { mediaType: kind.mediaType, data } } }
    }
    if (looksBinary(await readHead(path))) return { reason: t().claudeHost.attachments.binary }
  } catch (err) {
    return { reason: err instanceof Error ? err.message : t().claudeHost.attachments.readError }
  }
  return { file: { path, name, size: info.size } }
}

/**
 * Validates chosen (`pickAttachments`) or dropped (`authorizeAttachments`) paths and returns what can become a chip.
 * Inside the folder: `resolveInsideRoot` (the folder's spelling). Outside: folders always refused; files only if
 * `askOutside` (a single question with the names of those within the limits) says yes, and then they go into `allow`.
 * Folders inside the folder become an item named `folder/` with size 0 (main attaches the listing on send).
 */
export async function collectAttachments(
  root: string,
  paths: readonly string[],
  askOutside: (paths: string[]) => Promise<boolean>,
  allow: (path: string) => void | Promise<void>
): Promise<ClaudeAttachmentResult> {
  const files: ClaudeAttachmentFile[] = []
  const rejected: ClaudeAttachmentResult['rejected'] = []
  const outside: ClaudeAttachmentFile[] = []
  // Position in the final list: the chosen/dropped order is kept even with the question in between.
  const order: Array<ClaudeAttachmentFile | { outside: ClaudeAttachmentFile }> = []
  const labelOf = (p: unknown): string => (typeof p === 'string' && basename(p)) || t().claudeHost.attachments.unnamed
  paths.slice(MAX_ATTACHMENTS).forEach((p) => {
    rejected.push({ name: labelOf(p), reason: t().claudeHost.attachments.tooMany(MAX_ATTACHMENTS) })
  })
  for (const raw of paths.slice(0, MAX_ATTACHMENTS)) {
    const label = labelOf(raw)
    if (!isAbsolutePathInput(raw)) {
      rejected.push({ name: label, reason: t().claudeHost.attachments.unreadablePath })
      continue
    }
    let inside: string | null
    try {
      inside = await resolveInsideRoot(root, raw)
    } catch {
      inside = null
    }
    if (inside !== null) {
      const result = await inspectFile(inside)
      if ('file' in result) order.push(result.file)
      else rejected.push({ name: label, reason: result.reason })
      continue
    }
    let isDir = false
    try {
      isDir = (await stat(raw)).isDirectory()
    } catch {
      // surfaces in inspectFile
    }
    if (isDir) {
      rejected.push({ name: label, reason: t().claudeHost.attachments.outsideFolder })
      continue
    }
    const result = await inspectFile(raw)
    if ('file' in result) {
      outside.push(result.file)
      order.push({ outside: result.file })
    } else rejected.push({ name: label, reason: result.reason })
  }
  let accepted = false
  if (outside.length > 0) {
    accepted = await askOutside(outside.map((f) => f.path))
    if (accepted) for (const f of outside) await allow(f.path)
    else for (const f of outside) rejected.push({ name: f.name, reason: t().claudeHost.attachments.outsideRefused })
  }
  for (const item of order) {
    if ('outside' in item) {
      if (accepted) files.push(item.outside)
    } else files.push(item)
  }
  return { files, rejected }
}

function validLine(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1
}

/**
 * `verifyOutside`: checks main's allowance (`PathAllowlist.verify`) of a path outside the folder. Without an
 * allowance the path is refused outright; an expired allowance or a replaced file ask to attach again.
 */
export async function loadAttachments(
  root: string,
  list: unknown,
  verifyOutside: (path: string) => Promise<PathCheck> = () => Promise.resolve('unknown')
): Promise<LoadedAttachment[]> {
  if (!Array.isArray(list)) return []
  if (list.length > MAX_ATTACHMENTS) throw new UserError(t().claudeHost.attachments.tooManyError(MAX_ATTACHMENTS))
  const result: LoadedAttachment[] = []
  for (const a of list as unknown[]) {
    if (!isRecord(a) || typeof a.path !== 'string') throw new UserError(t().claudeHost.attachments.invalid)
    // A path outside the folder is refused outright (it does not become an "unreadable" attachment: the renderer
    // should not send it), except a FILE that main allowed (dialog or confirmation) and that still fits the limits
    // (also checked on send).
    let path: string
    try {
      path = await resolveInsideRoot(root, a.path)
    } catch (err) {
      const check = isAbsolute(a.path) ? await verifyOutside(a.path) : 'unknown'
      if (check === 'expired') {
        throw new UserError(t().claudeHost.attachments.expired(basename(a.path)), { cause: err })
      }
      if (check === 'changed') {
        throw new UserError(t().claudeHost.attachments.changed(basename(a.path)), { cause: err })
      }
      if (check !== 'ok') throw err instanceof UserError ? err : new UserError(errorText(err), { cause: err })
      path = resolve(a.path)
      const info = await stat(path).catch(() => null)
      if (info?.isDirectory()) throw new UserError(t().claudeHost.attachments.outsideFolderError, { cause: err })
    }
    const startLine = validLine(a.startLine) ? a.startLine : undefined
    const endLine = validLine(a.endLine) ? a.endLine : undefined
    // The `unreadable` reasons go into Claude's prompt, not the screen: they stay untranslated.
    try {
      const info = await stat(path)
      if (info.isDirectory()) {
        const entries = (await readdir(path, { withFileTypes: true }))
          .filter((e) => !HIDDEN.has(e.name))
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
          .sort((x, y) => x.localeCompare(y))
        result.push({ kind: 'directory', path, entries })
        continue
      }
      const text = await readTextOrNull(path, MAX_READ_BYTES)
      if (text === null) {
        result.push({ kind: 'unreadable', path, reason: 'file not found' })
        continue
      }
      const sliced = sliceLines(text, startLine, endLine)
      result.push({
        kind: 'file',
        path,
        ...omitUndefined({ startLine, endLine }),
        text: sliced.slice(0, MAX_ATTACHMENT_CHARS * 2)
      })
    } catch (err) {
      result.push({ kind: 'unreadable', path, reason: err instanceof Error ? err.message : 'read error' })
    }
  }
  return result
}

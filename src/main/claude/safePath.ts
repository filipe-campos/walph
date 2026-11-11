// Text read/write through Claude's path. The "inside the folder" check lives in `fs/paths.ts`.

import { mkdir, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type { TextEncoding } from '@shared/types'
import { decodeText, detectEncoding, encodeText, hasUtf16Bom } from '../fs/encoding'
import { resolveInsideRoot } from '../fs/paths'
import { resolveWriteTarget, writeFileAtomic } from '../fs/atomicWrite'
import { isInside } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/**
 * Text file as the editor sees it (`fs:readFile`: BOM stripped, UTF-16 by the BOM), with the detected encoding, or
 * `null` if it does not exist. Throws for folder/binary/too large.
 */
export async function readTextDetailedOrNull(
  path: string,
  maxBytes: number
): Promise<{ text: string; encoding: TextEncoding } | null> {
  let info
  try {
    info = await stat(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  if (!info.isFile()) throw new UserError(t().files.errors.notAFile)
  if (info.size > maxBytes) throw new UserError(t().files.errors.tooLarge)
  const buffer = await readFile(path)
  if (buffer.length > maxBytes) throw new UserError(t().files.errors.tooLarge)
  const encoding = detectEncoding(buffer)
  // UTF-16 has null bytes by nature.
  if (!hasUtf16Bom(buffer) && buffer.subarray(0, 8192).includes(0)) throw new UserError(t().files.errors.binary)
  return { text: decodeText(buffer, encoding), encoding }
}

/** Current text of the file (same decoding as `fs:readFile`), or `null` if it does not exist. */
export async function readTextOrNull(path: string, maxBytes: number): Promise<string | null> {
  return (await readTextDetailedOrNull(path, maxBytes))?.text ?? null
}

/** Writes atomically (`writeFileAtomic`: keeps the existing file's mode and follows symbolic links). */
export async function writeTextAtomic(
  root: string,
  path: string,
  text: string,
  encoding: TextEncoding = 'utf8'
): Promise<void> {
  const target = await resolveInsideRoot(root, path)
  if (!isAbsolute(target)) throw new UserError(t().files.errors.invalidPath)
  await mkdir(dirname(target), { recursive: true })
  // Revalidates after mkdir: the folders just created must also stay inside.
  await resolveInsideRoot(root, target)
  // Actual target (follows links; a dangling link throws): revalidates right before writing, nothing escapes.
  const resolved = await resolveWriteTarget(target)
  const realRoot = await realpath(root)
  if (!isInside(realRoot, resolved) && !isInside(root, resolved)) {
    throw new UserError(t().files.errors.outsideRoot(path))
  }
  // Encodes before creating the temp file: a character with no representation rejects without leaving a trace.
  // `followSymlinks: false`: the target was already resolved and checked; a link planted later is not followed.
  await writeFileAtomic(resolved, encodeText(text, encoding), { followSymlinks: false })
}

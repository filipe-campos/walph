import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { writeFileAtomic } from '../fs/atomicWrite'
import { describeWriteError } from '../fs/describeWriteError'
import { isInside } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { applyEdits, createReplacer, planReplacements, type Replacer } from '@shared/searchReplace'
import type { ReplaceFileOutcome, ReplaceRequest, ReplaceResult, SearchMatch } from '@shared/types'
import { UserError } from '../errors'

/** Same limit as rg's `--max-filesize=2M`: larger files never show up in the search. */
const MAX_REPLACE_BYTES = 2 * 1024 * 1024

/**
 * Strict containment (not the root itself; `..env.ts` is a valid name) and case-sensitive: the paths come from rg and
 * from `realpath`, in the real spelling on disk.
 */
const STRICT_INSIDE = { strict: true, caseSensitive: true, nfc: false } as const

function describeReadError(err: unknown, path: string): string {
  const code = (err as NodeJS.ErrnoException | null)?.code
  const name = basename(path)
  const m = t().search.replaceFile
  switch (code) {
    case 'ENOENT':
      return m.gone
    case 'EACCES':
    case 'EPERM':
      return m.readNoPermission(name)
    case 'EISDIR':
      return m.isDir(name)
    case 'ENOTDIR':
      return m.notDirInPath(name)
    default:
      return m.readFailed(name, err instanceof Error ? err.message : String(err))
  }
}

/**
 * Replaces the matches of a file. Validates containment (including via symlink), size and UTF-8 before writing;
 * writes to the real target (the symlink is preserved) atomically.
 */
async function replaceInFile(
  root: string,
  rootReal: string,
  file: { path: string; matches: SearchMatch[] },
  replacer: Replacer
): Promise<ReplaceFileOutcome> {
  const outcome: ReplaceFileOutcome = { path: file.path, replaced: 0, skipped: file.matches.map((_, i) => i) }
  if (!isAbsolute(file.path) || !isInside(root, file.path, STRICT_INSIDE))
    return { ...outcome, error: t().search.replaceFile.outside }

  let real: string
  let text: string
  let mode: number
  try {
    real = await realpath(file.path)
    // A symlink inside the folder cannot take the write outside it.
    if (!isInside(rootReal, real, STRICT_INSIDE)) return { ...outcome, error: t().search.replaceFile.outside }
    const info = await stat(real)
    if (!info.isFile()) return { ...outcome, error: t().search.replaceFile.notAFile(basename(file.path)) }
    if (info.size > MAX_REPLACE_BYTES) {
      return { ...outcome, error: t().search.replaceFile.tooLarge }
    }
    mode = info.mode & 0o7777
    const bytes = await readFile(real)
    text = bytes.toString('utf8')
    if (!Buffer.from(text, 'utf8').equals(bytes)) {
      return { ...outcome, error: t().search.replaceFile.notUtf8 }
    }
  } catch (err) {
    return { ...outcome, error: describeReadError(err, file.path) }
  }

  const { edits, skipped } = planReplacements(text, file.matches, replacer)
  if (edits.length === 0) return { path: file.path, replaced: 0, skipped }
  try {
    // `real` already went through realpath + containment: does not follow a link swapped after that.
    await writeFileAtomic(real, applyEdits(text, edits), { mode, followSymlinks: false })
  } catch (err) {
    return {
      ...outcome,
      error: describeWriteError(err, file.path, {
        overrides: { ENOENT: t().search.replaceFile.gone },
        fallback: t().files.errors.writeFailed
      }).message
    }
  }
  return { path: file.path, replaced: edits.length, skipped }
}

export async function replaceAll(root: string, request: ReplaceRequest): Promise<ReplaceResult> {
  const replacer = createReplacer(request.query, request.replacement, request.options)
  if (!replacer) {
    throw new UserError(
      request.options.regex ? t().search.errors.unsupportedRegex(request.query) : t().search.errors.invalidReplace
    )
  }
  const rootReal = await realpath(root).catch(() => root)
  const files: ReplaceFileOutcome[] = []
  for (const file of request.files) files.push(await replaceInFile(root, rootReal, file, replacer))
  return { files }
}

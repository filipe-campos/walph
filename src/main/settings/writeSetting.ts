import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { SettingsLayer } from '@shared/settings'
import { isInside } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { resolveWriteTarget, writeFileAtomic } from '../fs/atomicWrite'
import { SerialQueue } from '../util/serialQueue'
import { parseSettingsFile } from './parseSettingsFile'
import { cancelReload, labelOf, pathOf, readText, reload, type Target } from './state'
import { UserError } from '../errors'

// Paths already went through `realpath` (real spelling on disk): lexical containment, without ignoring case.
const REAL_INSIDE = { caseSensitive: true, nfc: false } as const

class OutsideRootError extends UserError {}

function writeFailed(target: Target, err: unknown): Error {
  // I/O errors (folder deleted, no permission…) become the same translated message.
  const detail = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err))
  return new UserError(t().settings.files.writeFailed(labelOf(target), detail), { cause: err })
}

/**
 * Real path where the `target` settings file is written, creating the missing folder. A `.walph/settings.json` comes
 * from the repository (untrusted): `.walph/` or the file may be links to outside the folder, so containment is checked
 * BEFORE creating anything and again on the already resolved destination. Used by every creation/write of the file.
 */
export async function resolveSettingsWriteTarget(target: Target): Promise<string> {
  const path = pathOf(target)
  const dir = dirname(path)
  const outside = (): OutsideRootError => new OutsideRootError(t().settings.files.pointsOutside(labelOf(target)))
  try {
    const realDir = await realpath(dir).catch(() => null)
    const rootReal = target.kind === 'workspace' ? await realpath(target.root) : null
    if (rootReal && realDir && !isInside(rootReal, realDir, REAL_INSIDE)) throw outside()
    await mkdir(dir, { recursive: true })
    // Writes next to the real file: if settings.json is a symlink (dotfiles with stow/chezmoi), the rename must not
    // replace the link with a regular file. File not existing yet: resolves only the folder (comparable with the root).
    const real = await realpath(path).catch(async () => join(await realpath(dir), basename(path)))
    if (rootReal && !isInside(rootReal, real, REAL_INSIDE)) throw outside()
    // Revalidates the already resolved destination right before writing (a dangling link throws here, without creating
    // the target).
    const resolved = await resolveWriteTarget(real)
    if (rootReal && !isInside(rootReal, resolved, REAL_INSIDE)) throw outside()
    return resolved
  } catch (err) {
    throw err instanceof OutsideRootError ? err : writeFailed(target, err)
  }
}

const writeQueue = new SerialQueue()

/**
 * Single write pipeline for a key (set/reset): queued read+write, refuses a file with a syntax error,
 * containment/symlinks and atomic write. `compute` receives the current text (`null` = missing file) and returns the
 * new text, or `null` to do nothing (not even create the file).
 */
export function writeSetting(
  target: Target,
  settingsLayer: SettingsLayer,
  compute: (current: string | null) => string | null
): Promise<void> {
  const path = pathOf(target)
  const run = async (): Promise<void> => {
    const read = await readText(target)
    if ('failure' in read) throw new UserError(read.failure)
    if (read.text !== null) {
      const parsed = parseSettingsFile(read.text, settingsLayer, process.platform)
      if ('error' in parsed) {
        throw new UserError(t().settings.files.fixBeforeEditing(labelOf(target), parsed.error))
      }
    }
    const next = compute(read.text)
    // Nothing to write: still rereads, so a previous read error does not linger in the snapshot.
    if (next === null || next === read.text) return reload(target)
    // Before writing: the watcher event of our own save may arrive before the rename ends (inotify) and must schedule
    // the reread, which becomes a no-op through `lastTexts`, instead of being cancelled without running.
    cancelReload(path)
    const resolved = await resolveSettingsWriteTarget(target)
    try {
      // Atomic (tmp + rename in the same folder): a crash midway never leaves the file truncated.
      // `followSymlinks: false`: does not re-resolve a link swapped after the check.
      await writeFileAtomic(resolved, next, { followSymlinks: false })
    } catch (err) {
      throw writeFailed(target, err)
    }
    // Does not wait for the watcher: the caller already gets the change applied.
    await reload(target)
  }
  return writeQueue.run(run)
}

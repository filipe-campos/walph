import { runRg } from '../search/rg'
import { drainRgPaths } from './normalizeFileList'
import type { FileList } from '@shared/types'
import { t } from '@shared/i18n'
import { isAbsolutePathInput } from '../fs/validate'
import { UserError } from '../errors'

const MAX_FILES = 100_000
const IS_WINDOWS = process.platform === 'win32'

// One rg run per root; we keep the Promise so concurrent calls share the same one.
const cache = new Map<string, Promise<FileList>>()

async function listFiles(root: string): Promise<FileList> {
  const files: string[] = []
  let pending = ''
  let truncated = false
  // --no-require-git: respects .gitignore even in folders that are not a repository.
  const rg = await runRg(['--files', '--no-require-git', '--null', '--', '.'], {
    cwd: root,
    onStdout: (chunk, stop) => {
      if (truncated) return
      const drained = drainRgPaths(pending, chunk, IS_WINDOWS)
      pending = drained.rest
      for (const path of drained.paths) {
        files.push(path)
        if (files.length >= MAX_FILES) {
          truncated = true
          stop()
          break
        }
      }
    }
  })
  const m = t().files.errors
  if (rg.outcome === 'spawnError' && rg.spawnError) throw new UserError(m.listFailed(rg.spawnError.message))
  // Killed for a reason other than the limit (OOM, app exit): a partial list cannot become the cache.
  if (rg.outcome === 'interrupted') throw new UserError(m.listInterrupted)
  // Code 1 = no files; 2 = error (rg may still have listed part of the files).
  if (rg.outcome === 'error' && files.length === 0) {
    const detail = rg.stderr.trim()
    throw new UserError(detail ? m.listError(detail) : m.listErrorGeneric)
  }
  return { files, truncated }
}

/** Lists the files of `root` (rg), with a per-root cache and shared concurrent runs. */
export function getFileList(root: string): Promise<FileList> {
  if (!isAbsolutePathInput(root)) {
    return Promise.reject(new UserError(t().files.errors.listInvalidFolder))
  }
  const cached = cache.get(root)
  if (cached) return cached

  const promise = listFiles(root)
  cache.set(root, promise)
  // A failure is not cached; the identity check avoids deleting a newer run.
  promise.catch(() => {
    if (cache.get(root) === promise) cache.delete(root)
  })
  return promise
}

/**
 * Discards the cached list of `root` (or of all roots, without an argument). A run in progress
 * continues for those already waiting, but stops being the cache: the next call runs rg again.
 */
export function invalidateFileList(root?: string): void {
  if (root === undefined) cache.clear()
  else cache.delete(root)
}

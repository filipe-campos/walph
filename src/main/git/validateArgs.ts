import { isNonEmptyString, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { pathTail } from '@shared/pathCompare'
import type { LineRange } from '@shared/hunkSelection'
import { int } from '../validate/args'
import { parseAbsolutePath } from '../fs/validate'
import { git } from './run'
import { UserError } from '../errors'

const COMMIT_HASH = /^[0-9a-f]{4,64}$/i

/** Path relative to the repository root, with `/`; refuses what is not relative or is outside the repository. */
export function repoRelative(top: string, path: unknown): string {
  const tail = pathTail(top, parseAbsolutePath(path, t().files.errors.invalidPath), { strict: true })
  if (!tail) throw new UserError(t().git.errors.fileOutsideRepo)
  return tail.join('/')
}

export function repoRelativeList(top: string, paths: unknown): string[] {
  if (!Array.isArray(paths) || paths.length === 0) throw new UserError(t().git.errors.noFiles)
  return paths.map((p) => repoRelative(top, p))
}

/** A commit file from the renderer: only `status` and the paths matter; the paths are validated further on. */
export function parseCommitFile(value: unknown): { status: string; path: unknown; oldPath: unknown } {
  if (!isRecord(value) || !isNonEmptyString(value.status)) throw new UserError(t().git.errors.invalidFile)
  return { status: value.status, path: value.path, oldPath: value.oldPath }
}

export function assertHash(hash: unknown): string {
  if (typeof hash !== 'string' || !COMMIT_HASH.test(hash)) throw new UserError(t().git.errors.invalidCommit)
  return hash
}

const MAX_RANGES = 10_000
const MAX_LINE = 10_000_000

/** Line ranges (1-based, inclusive) from the renderer; at least one. */
export function lineRanges(value: unknown): LineRange[] {
  const message = t().git.errors.invalidRanges
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RANGES) throw new UserError(message)
  return value.map((r) => {
    if (!isRecord(r)) throw new UserError(message)
    const from = int(r.from, { min: 1, max: MAX_LINE }, message)
    const to = int(r.to, { min: from, max: MAX_LINE }, message)
    return { from, to }
  })
}

export function assertStashIndex(index: unknown): number {
  return int(index, { min: 0 }, t().git.errors.invalidStash)
}

export async function assertBranchName(root: string, name: unknown): Promise<string> {
  if (typeof name !== 'string' || !name.trim() || name.startsWith('-') || name.includes('@{')) {
    throw new UserError(t().git.errors.invalidBranchName)
  }
  try {
    await git(root, ['check-ref-format', '--branch', name])
  } catch {
    throw new UserError(t().git.errors.invalidBranchName)
  }
  return name
}

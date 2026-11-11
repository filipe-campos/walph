import type { Stats } from 'node:fs'
import { link, lstat, rename, unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/** Occupied destination: the caller recognizes it by type, not by text (which depends on the language). */
export class AlreadyExistsError extends UserError {
  constructor(name: string, options?: ErrorOptions) {
    super(t().files.errors.alreadyExists(name), options)
  }
}

export async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// File: link + unlink fails with EEXIST instead of overwriting (rename overwrites silently). Folder/symlink:
// rename (fails with ENOTEMPTY on a non-empty folder). No hardlink support on the volume → rename after a new check.
export async function moveNoOverwrite(source: string, destination: string, info: Stats): Promise<void> {
  if (info.isFile()) {
    try {
      await link(source, destination)
    } catch (err) {
      // EEXIST is the occupied destination (what we want to detect). Any other `link` error means "this volume does
      // not hardlink" (EPERM, ENOTSUP, EISDIR on Windows FAT32/exFAT…): falls back to rename, after a new check.
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw err
      if (await lstatOrNull(destination)) throw new AlreadyExistsError(basename(destination), { cause: err })
      await rename(source, destination)
      return
    }
    try {
      await unlink(source)
    } catch (err) {
      // Undoes the new link so the file is not left duplicated.
      await unlink(destination).catch(() => undefined)
      throw err
    }
    return
  }
  await rename(source, destination)
}

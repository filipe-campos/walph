// Favorite commands of the Claude panel, per folder: `<userData>/claude/favorite-commands/<folder-sha256>.json` (same
// key as the `sessions/` files). They live in the app, never in the repository. Tolerant read (missing/corrupt = empty)
// and the content is treated as untrusted.

import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sanitizeFavoriteCommands, type ClaudeFavoriteCommand } from '@shared/favoriteCommands'
import { writeJsonAtomicSync } from '../fs/atomicWrite'
import { sessionFileName } from '../session/sessionFile'
import { KeyedSerialQueue } from '../util/serialQueue'
import { UserError } from '../errors'

export class FavoriteCommandsStore {
  private readonly queue = new KeyedSerialQueue()

  /** `dir` = `<userData>/claude/favorite-commands`. */
  constructor(private readonly dir: string) {}

  private path(root: string): string {
    return join(this.dir, sessionFileName(root))
  }

  private async read(root: string): Promise<ClaudeFavoriteCommand[]> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path(root), 'utf8'))
      return sanitizeFavoriteCommands(isRecord(raw) ? raw.commands : [])
    } catch {
      return []
    }
  }

  // Reads and writes of the same folder are queued: two consecutive changes do not trample each other.
  private serialize<T>(root: string, job: () => T | Promise<T>): Promise<T> {
    return this.queue.run(this.path(root), job)
  }

  load(root: string): Promise<ClaudeFavoriteCommand[]> {
    return this.serialize(root, () => this.read(root))
  }

  /** Writes the list (already validated by `parseFavoriteCommands`) and returns what was saved. */
  save(root: string, commands: ClaudeFavoriteCommand[]): Promise<ClaudeFavoriteCommand[]> {
    return this.serialize(root, () => {
      const clean = sanitizeFavoriteCommands(commands)
      try {
        writeJsonAtomicSync(this.path(root), { version: 1, commands: clean })
      } catch {
        // The Node error comes in English and with the userData path: the toast shows only what happened.
        throw new UserError(t().claudeHost.favorites.saveFailed)
      }
      return clean
    })
  }
}

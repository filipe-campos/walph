import { app } from 'electron'
import { join } from 'node:path'
import { FavoriteCommandsStore } from './favoriteCommands'
import { SessionMetaStore } from './sessionMeta'

let metaStore: SessionMetaStore | null = null
/** Walph session metadata (`<userData>/claude/<folder-sha256>.json`); created on first use (the app is ready then). */
export function sessionMeta(): SessionMetaStore {
  return (metaStore ??= new SessionMetaStore(join(app.getPath('userData'), 'claude')))
}

let favoritesStore: FavoriteCommandsStore | null = null
/** Favorite commands per folder (`<userData>/claude/favorite-commands/<folder-sha256>.json`). */
export function favoriteCommands(): FavoriteCommandsStore {
  return (favoritesStore ??= new FavoriteCommandsStore(join(app.getPath('userData'), 'claude', 'favorite-commands')))
}

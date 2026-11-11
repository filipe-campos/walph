/**
 * Auto update notice (`update:notice`), sent to the active view of the focused window (or of the last used one) and
 * shown as a toast with the fixed key `update` (one replaces the other). Translated texts (`t()`).
 * - `checking`/`upToDate`/`error` only appear in a check requested by the user (`update.check`); automatic ones are
 *   silent until something is downloaded.
 * - `downloaded` offers "Restart and Update" (`update.install`).
 */
export interface UpdateNotice {
  kind: 'checking' | 'upToDate' | 'downloading' | 'downloaded' | 'error'
  message: string
  /** New version (`downloading`/`downloaded`). */
  version?: string
}

/**
 * Automatic updates (`electron-updater`), only in the packaged app and with `update.enabled`; channel in
 * `update.channel`. In dev the commands do not exist (`isCommandAvailable`).
 */
export interface UpdateApi {
  /** Check requested by the user (`update:check`): the result arrives as `update:notice`, including "up to date". */
  check(): Promise<void>
  /** Quits and installs the downloaded update (`update:install`); quitting goes through the dirty files guard. */
  install(): void
  onNotice(cb: (notice: UpdateNotice) => void): () => void
}

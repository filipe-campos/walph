// Auto update (`electron-updater`). Only in the packaged app and with `update.enabled`; in dev the module is not even
// loaded.
// Automatic checks are silent until something is downloaded; the manual one (`update:check`) always answers.

import { app } from 'electron'
import type { AppUpdater } from 'electron-updater'
import type { UpdateNotice } from '@shared/types'
import { getUserSettings, onSettingsChange } from '../settings/state'
import { onQuitCancelled } from '../window/closeController'
import { activeContents, targetHost } from '../window/windows'
import {
  CHECK_INTERVAL_MS,
  checkingNotice,
  downloadedNotice,
  downloadingNotice,
  errorNotice,
  FIRST_CHECK_DELAY_MS,
  sameOptions,
  updaterOptions,
  upToDateNotice,
  type UpdaterOptions
} from '../update/notices'
import { handle, on } from './typed'
import { send } from '../window/send'
import { t } from '@shared/i18n'

let updater: AppUpdater | null = null
let loading: Promise<AppUpdater | null> | null = null
let applied: UpdaterOptions | null = null
let firstTimer: NodeJS.Timeout | null = null
let intervalTimer: NodeJS.Timeout | null = null
// A user-requested check in progress: only it shows "checking/upToDate/downloading/error".
let manual = false
let downloading: string | null = null
let downloaded: UpdateNotice | null = null
let installRequested = false

function emitNotice(notice: UpdateNotice): void {
  const host = targetHost()
  const wc = host && activeContents(host)
  if (wc) send(wc, 'update:notice', notice)
}

async function load(): Promise<AppUpdater | null> {
  if (updater) return updater
  loading ??= import('electron-updater')
    .then(({ autoUpdater }) => {
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('update-available', (info) => {
        downloading = info.version
        if (manual) emitNotice(downloadingNotice(info.version))
      })
      autoUpdater.on('update-not-available', () => {
        if (manual) emitNotice(upToDateNotice())
        manual = false
      })
      autoUpdater.on('update-downloaded', (info) => {
        downloading = null
        downloaded = downloadedNotice(info.version)
        manual = false
        emitNotice(downloaded)
      })
      autoUpdater.on('error', (err) => {
        downloading = null
        if (manual) emitNotice(errorNotice(err))
        manual = false
      })
      updater = autoUpdater
      return autoUpdater
    })
    .catch(() => null)
  return loading
}

async function runCheck(): Promise<void> {
  const u = await load()
  if (!u) {
    if (manual) emitNotice(errorNotice(new Error('unavailable')))
    manual = false
    return
  }
  try {
    await u.checkForUpdates()
  } catch (err) {
    // The `error` event also fires; this only ensures the notice if it did not come.
    if (manual) emitNotice(errorNotice(err))
    manual = false
  }
}

function unschedule(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstTimer = intervalTimer = null
}

function schedule(): void {
  unschedule()
  firstTimer = setTimeout(() => void runCheck(), FIRST_CHECK_DELAY_MS)
  intervalTimer = setInterval(() => void runCheck(), CHECK_INTERVAL_MS)
  firstTimer.unref()
  intervalTimer.unref()
}

/** Applies `update.enabled`/`update.channel` (also when the user edits settings.json with the app open). */
async function applySettings(): Promise<void> {
  const options = updaterOptions(getUserSettings())
  if (sameOptions(applied, options)) return
  applied = options
  if (!options.enabled) {
    unschedule()
    // Truly off: not even the install-on-quit of an already downloaded update happens.
    if (updater) updater.autoInstallOnAppQuit = false
    return
  }
  const u = await load()
  // The settings may have changed while the module was loading.
  if (!u || applied !== options) return
  u.channel = options.channel
  // Setting the channel turns on `allowDowngrade` in electron-updater: we never want to downgrade.
  u.allowDowngrade = false
  u.allowPrerelease = options.allowPrerelease
  u.autoInstallOnAppQuit = true
  schedule()
}

export function registerUpdateHandlers(): void {
  // In dev (or without the packaged app) the updater does not exist: the commands are left out too
  // (`isCommandAvailable`).
  if (!app.isPackaged) {
    handle('update:check', () => undefined)
    on('update:install', () => undefined)
    return
  }
  handle('update:check', async () => {
    // An update is already downloaded: only resends the notice with the restart action.
    if (downloaded) return emitNotice(downloaded)
    if (!getUserSettings()['update.enabled']) {
      return emitNotice({ kind: 'error', message: t().app.update.disabled })
    }
    await applySettings()
    if (downloading) return emitNotice(downloadingNotice(downloading))
    manual = true
    emitNotice(checkingNotice())
    await runCheck()
  })
  // Quitting goes through the dirty files guard (`before-quit`); the install runs in `will-quit`, once confirmed.
  on('update:install', () => {
    if (!downloaded) return
    installRequested = true
    app.quit()
  })
  // Quit cancelled (unsaved files): "Restart and Update" does not stay armed for the next quit.
  onQuitCancelled(() => {
    installRequested = false
  })
  onSettingsChange(() => void applySettings())
  void applySettings()
}

/** `will-quit`: stops the timers and, if the user asked for "Restart and Update", installs (the quit is already
 * confirmed). */
export function stopUpdates(): void {
  unschedule()
  if (installRequested && updater) {
    installRequested = false
    try {
      updater.quitAndInstall(true, true)
    } catch {
      // Failed: `autoInstallOnAppQuit` still tries on `quit`.
    }
  }
}

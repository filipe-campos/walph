// Writing and reading `windows.json` (list of windows and workspaces). Writes are debounced; once quitting is decided
// the
// file freezes, since the windows and views keep closing and cannot overwrite the session list.

import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomicSync } from '../fs/atomicWrite'
import { allHosts, type Host } from './windowState'
import { sanitizeWindows, WINDOWS_FILE_VERSION, type SavedWindow } from './windowsFile'
import { createLog } from '../log'

const log = createLog('windows')

const SAVE_DELAY_MS = 500

let saveTimer: NodeJS.Timeout | null = null
let frozen = false

const windowsFile = (): string => join(app.getPath('userData'), 'windows.json')

/** Quitting the app was decided: nothing hibernates anymore (the views are being unloaded by the close). */
export function isQuitFrozen(): boolean {
  return frozen
}

function toSaved(host: Host): SavedWindow {
  const { win } = host
  return {
    workspaces: host.workspaces.map((w) => ({ root: w.root, branch: w.branch, ...(w.muted ? { muted: true } : {}) })),
    active: Math.max(
      0,
      host.workspaces.findIndex((w) => w.id === host.activeId)
    ),
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized()
  }
}

/**
 * Saves the window list. Without live windows it saves nothing: the entry of the last closed window stays in the file
 * (closing the last one on Windows/Linux equals quitting; on macOS `activate` reopens it).
 */
export function saveWindowsNow(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (frozen) return
  const live = allHosts()
  if (live.length === 0) return
  try {
    writeJsonAtomicSync(windowsFile(), { version: WINDOWS_FILE_VERSION, windows: live.map(toSaved) })
  } catch (err) {
    log.error('Could not save the window list:', err)
  }
}

/** App quit decided: saves the current list and freezes (while quitting the windows and views keep closing). */
export function freezeWindowsFile(): void {
  saveWindowsNow()
  frozen = true
}

export function scheduleSave(): void {
  if (frozen) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveWindowsNow, SAVE_DELAY_MS)
}

export function readSavedWindows(): SavedWindow[] {
  try {
    return sanitizeWindows(JSON.parse(readFileSync(windowsFile(), 'utf8')))
  } catch {
    return []
  }
}

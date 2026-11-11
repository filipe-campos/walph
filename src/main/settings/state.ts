import { app, type WebContents } from 'electron'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  mergeSettings,
  type SettingKey,
  type Settings,
  type SettingsFileKind,
  type SettingsSnapshot
} from '@shared/settings'
import { send } from '../window/send'
import { countTestEvent } from '../window/hiddenMode'
import { getBindings, setBindings } from '../keybindings/effective'
import { bindingKeys, parseUserKeybindings, resolveBindings } from '../keybindings/userKeybindings'
import type { DirWatch } from './dirWatch'
import { parseSettingsFile } from './parseSettingsFile'
import { getLocale, t as i18n } from '@shared/i18n'
import { applyLanguageSetting } from '../i18n/locale'
import { createLog } from '../log'
import { createEmitter } from '../util/emitter'

const log = createLog('settings')

// Waits for the editor to finish writing (atomic save = delete + rename fires several events) before rereading.
const DEBOUNCE_MS = 100
export const FILE_KINDS: readonly SettingsFileKind[] = ['user', 'workspace', 'keybindings']

export type Target = { kind: 'user' } | { kind: 'keybindings' } | { kind: 'workspace'; root: string }
export type LinkKind = 'user' | 'keybindings'

export const userDir = (): string => app.getPath('userData')
export const pathOf = (t: Target): string =>
  t.kind === 'user'
    ? join(userDir(), 'settings.json')
    : t.kind === 'keybindings'
      ? join(userDir(), 'keybindings.json')
      : join(t.root, '.walph', 'settings.json')
export const labelOf = (t: Target): string =>
  t.kind === 'keybindings' ? 'keybindings.json' : i18n().settings.files[t.kind]

interface RootWatcher {
  watcher: DirWatch
  refs: number
  /** First read of the workspace file; whoever joins later (another window, same folder) waits for it. */
  ready: Promise<void>
}

export const state = {
  // Last VALID version of each file: a parse error never takes down the settings in use.
  userValues: {} as Partial<Settings>,
  workspaceValues: new Map<string, Partial<Settings>>(),
  // Last text read per path (`null` = missing file): discards repeated events (e.g. our own write).
  lastTexts: new Map<string, string | null>(),
  // Current problems per file, returned to whoever connects (`setWorkspace`).
  problems: new Map<string, string[]>(),
  // Connected windows and the folder of each (per webContents, ready for multi-window).
  windows: new Map<WebContents, string | null>(),
  rootWatchers: new Map<string, RootWatcher>(),
  timers: new Map<string, NodeJS.Timeout>(),
  userWatchers: [] as DirWatch[],
  linkWatchers: new Map<LinkKind, { target: string; watcher: DirWatch }>(),
  linkSync: Promise.resolve(),
  stopped: false
}

const changes = createEmitter<[WebContents]>('settings')

/** Calls `cb` for each window whose settings snapshot was just resent. Returns the unsubscribe. */
export const onSettingsChange = changes.on

/** Effective settings (default ← user ← workspace) of the given window. */
export function getEffectiveSettings(wc: WebContents): Settings {
  const root = state.windows.get(wc)
  return mergeSettings(state.userValues, (root ? state.workspaceValues.get(root) : undefined) ?? {})
}

/** Only the user settings (app-global keys, like `update.*`), without depending on a view. */
export function getUserSettings(): Settings {
  return mergeSettings(state.userValues, {})
}

export function snapshotFor(wc: WebContents, errors: string[]): SettingsSnapshot {
  const root = state.windows.get(wc)
  const workspace = (root ? state.workspaceValues.get(root) : undefined) ?? {}
  const workspaceKeys = Object.keys(workspace) as SettingKey[]
  return {
    settings: getEffectiveSettings(wc),
    keybindings: bindingKeys(getBindings()),
    errors,
    workspaceKeys,
    layers: { user: state.userValues, workspace },
    locale: getLocale()
  }
}

export function currentProblems(root: string | null): string[] {
  const targets: Target[] = [{ kind: 'user' }, { kind: 'keybindings' }]
  if (root) targets.push({ kind: 'workspace', root })
  return targets.flatMap((t) => state.problems.get(pathOf(t)) ?? [])
}

/**
 * Applies the text read and returns the problems of that read (syntax error and/or warnings); never throws. Runs before
 * the window exists (synchronous read at boot) and on watcher events: an unexpected exception here would leave the app
 * without a window or with unhandled rejections.
 */
export function applyText(target: Target, text: string | null): string[] {
  try {
    return applyTextUnsafe(target, text)
  } catch (err) {
    const found = [i18n().settings.files.applyFailed(labelOf(target), err instanceof Error ? err.message : String(err))]
    state.problems.set(pathOf(target), found)
    return found
  }
}

function applyTextUnsafe(target: Target, text: string | null): string[] {
  const label = labelOf(target)
  const path = pathOf(target)
  let found: string[]

  if (target.kind === 'keybindings') {
    const parsed = parseUserKeybindings(text ?? '', process.platform)
    if ('error' in parsed) {
      found = [`${label}: ${parsed.error}`]
    } else {
      setBindings(resolveBindings(process.platform, parsed.entries))
      found = parsed.warnings.map((w) => `${label}: ${w}`)
    }
  } else {
    const parsed = parseSettingsFile(text ?? '', target.kind === 'workspace' ? 'workspace' : 'user', process.platform)
    if ('error' in parsed) {
      found = [`${label}: ${parsed.error}`]
    } else {
      if (target.kind === 'user') {
        state.userValues = parsed.values
        applyLanguageSetting(getUserSettings()['workbench.language'])
      } else state.workspaceValues.set(target.root, parsed.values)
      found = parsed.warnings.map((w) => `${label}: ${w}`)
    }
  }
  state.problems.set(path, found)
  return found
}

export async function readText(target: Target): Promise<{ text: string | null } | { failure: string }> {
  try {
    return { text: await readFile(pathOf(target), 'utf8') }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { text: null }
    return { failure: i18n().settings.files.readFailed(labelOf(target), code ?? i18n().common.unknownError) }
  }
}

/** Rereads the file and notifies the affected windows. With no change in the text, does nothing. */
export async function reload(target: Target): Promise<void> {
  const read = await readText(target)
  // The folder may have been released during the read: applying the text would bring back state of a closed workspace.
  if (target.kind === 'workspace' && !state.rootWatchers.has(target.root)) return
  const path = pathOf(target)
  let found: string[]
  if ('failure' in read) {
    // Keeps the last valid version; the "read" text does not change so the next event tries again.
    found = [read.failure]
    state.problems.set(path, found)
    state.lastTexts.delete(path)
  } else {
    if (state.lastTexts.has(path) && state.lastTexts.get(path) === read.text) return
    state.lastTexts.set(path, read.text)
    found = applyText(target, read.text)
  }
  for (const [wc, root] of state.windows) {
    if (wc.isDestroyed()) continue
    if (target.kind === 'workspace' && root !== target.root) continue
    announce(wc, found)
  }
}

/** Resends the snapshot to the view and notifies whoever depends on its settings (`onSettingsChange` listeners). */
export function announce(wc: WebContents, errors: string[]): void {
  send(wc, 'settings:changed', snapshotFor(wc, errors))
  changes.emit(wc)
}

export function cancelReload(path: string): void {
  clearTimeout(state.timers.get(path))
  state.timers.delete(path)
}

export function scheduleReload(target: Target): void {
  const path = pathOf(target)
  clearTimeout(state.timers.get(path))
  state.timers.set(
    path,
    setTimeout(() => {
      state.timers.delete(path)
      reload(target)
        .catch((err: unknown) => log.error('reload failed', pathOf(target), err))
        .finally(() => countTestEvent(`settings.watcherReload.${target.kind}`))
    }, DEBOUNCE_MS)
  )
}

export function loadUserFilesSync(): void {
  for (const target of [{ kind: 'user' }, { kind: 'keybindings' }] as Target[]) {
    let text: string | null = null
    try {
      text = readFileSync(pathOf(target), 'utf8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      // Only "does not exist" is normal (starts with the defaults; the watcher reloads when it appears). Any other
      // error (permission, it is a folder…) is a problem to show, and the read is tried again on the next event.
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        state.problems.set(pathOf(target), [
          i18n().settings.files.readFailed(labelOf(target), code ?? i18n().common.unknownError)
        ])
        continue
      }
    }
    state.lastTexts.set(pathOf(target), text)
    applyText(target, text)
  }
}

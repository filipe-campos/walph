import type { WebContents } from 'electron'
import { lstat } from 'node:fs/promises'
import {
  sanitizeSettings,
  SETTING_KEYS,
  USER_ONLY_SETTINGS,
  type SettingKey,
  type SettingsLayer,
  type SettingsSnapshot
} from '@shared/settings'
import { t } from '@shared/i18n'
import { setSettingInText, removeSettingFromText } from './setSettingInText'
import { keybindingsTemplate, userSettingsTemplate, workspaceSettingsTemplate } from './templates'
import {
  currentProblems,
  FILE_KINDS,
  labelOf,
  loadUserFilesSync,
  pathOf,
  snapshotFor,
  state,
  type Target
} from './state'
import { bindView } from './binding'
import { startUserWatcher, stopWatchers } from './watchers'
import { resolveSettingsWriteTarget, writeSetting } from './writeSetting'
import { createFileExclusive } from '../fs/atomicWrite'
import { AlreadyExistsError } from '../fs/moveNoOverwrite'
import { assertOwnRoot, requireViewRoot } from '../window/ownRoot'
import { getWindowRoot } from '../window/windows'
import { isAbsolutePathInput } from '../fs/validate'
import { oneOf } from '../validate/args'
import { UserError } from '../errors'

/**
 * The view ↔ folder binding is owned by main (`bindView`, triggered by `onWindowRootChange`). Here the renderer only
 * validates the folder it believes is its own and gets the snapshot with the workspace layer already read.
 */
export async function setWorkspace(wc: WebContents, requested: unknown): Promise<SettingsSnapshot> {
  if (requested !== null && !isAbsolutePathInput(requested)) {
    throw new UserError(t().settings.errors.invalidWorkspaceFolder)
  }
  // The renderer may only refer to the folder main already registered for the view (`workspace.open` comes first):
  // otherwise it could point the settings (and the writes) at any `<folder>/.walph/settings.json`.
  if (requested !== null) assertOwnRoot(wc, requested, t().settings.errors.folderMismatch)
  // Covers the view whose folder came from boot (no change event); for the others it is idempotent.
  await bindView(wc, getWindowRoot(wc))
  // The window may have switched folders (or closed) during the wait: the snapshot reflects the current folder.
  return snapshotFor(wc, currentProblems(state.windows.get(wc) ?? null))
}

async function createIfMissing(target: Target, content: string): Promise<void> {
  // Anything at the path (including a dangling stow/chezmoi link) belongs to the user: creates nothing.
  if (
    await lstat(pathOf(target)).then(
      () => true,
      () => false
    )
  )
    return
  try {
    await createFileExclusive(await resolveSettingsWriteTarget(target), content)
  } catch (err) {
    if (!(err instanceof AlreadyExistsError)) throw err
  }
}

export async function openFile(wc: WebContents, rawKind: unknown): Promise<string> {
  const kind = oneOf(rawKind, FILE_KINDS, t().settings.errors.invalidFileKind)
  let target: Target
  let template: string
  if (kind === 'workspace') {
    target = { kind, root: requireViewRoot(wc, t().settings.errors.openFolderToEdit) }
    template = workspaceSettingsTemplate()
  } else {
    target = { kind }
    template = kind === 'user' ? userSettingsTemplate() : keybindingsTemplate()
  }
  const path = pathOf(target)
  try {
    await createIfMissing(target, template)
  } catch (err) {
    throw new UserError(t().settings.files.createFailed(labelOf(target), (err as Error).message), { cause: err })
  }
  return path
}

/**
 * Validates layer/key coming from the renderer and resolves the target file (workspace folder read NOW, outside the
 * queue).
 */
function resolveSettingTarget(wc: WebContents, layer: unknown, key: unknown): { target: Target; layer: SettingsLayer } {
  if (layer !== 'user' && layer !== 'workspace') throw new UserError(t().settings.errors.invalidLayer)
  const settingsLayer: SettingsLayer = layer
  if (typeof key !== 'string' || !(SETTING_KEYS as string[]).includes(key)) {
    throw new UserError(t().settings.errors.unknownSetting(String(key)))
  }
  if (settingsLayer === 'user') return { target: { kind: 'user' }, layer: settingsLayer }
  if (USER_ONLY_SETTINGS.includes(key as SettingKey)) {
    throw new UserError(t().settings.errors.userOnly(key))
  }
  // If the window switches folders later, the write belongs to the requested folder.
  const root = requireViewRoot(wc, t().settings.errors.openFolderToChange)
  return { target: { kind: 'workspace', root }, layer: settingsLayer }
}

export async function setValue(wc: WebContents, layer: unknown, key: unknown, value: unknown): Promise<void> {
  const { target, layer: settingsLayer } = resolveSettingTarget(wc, layer, key)
  const { warnings } = sanitizeSettings({ [key as string]: value }, settingsLayer, process.platform)
  if (warnings.length > 0) throw new UserError(t().settings.errors.invalidValue(warnings.join('; ')))
  await writeSetting(target, settingsLayer, (text) => {
    // A new workspace file starts from the commented template (like `openFile`); the user one starts empty.
    const current = text ?? (target.kind === 'workspace' ? workspaceSettingsTemplate() : '')
    return setSettingInText(current, key as SettingKey, value as never)
  })
}

/** Removes the key from the layer; a missing key or file is not an error and never creates the file. */
export async function resetValue(wc: WebContents, layer: unknown, key: unknown): Promise<void> {
  const { target, layer: settingsLayer } = resolveSettingTarget(wc, layer, key)
  await writeSetting(target, settingsLayer, (text) =>
    text === null ? null : removeSettingFromText(text, key as SettingKey)
  )
}

/**
 * Reads the user files and starts the watcher. Synchronous on purpose: the shortcuts must be ready before building the
 * menu and opening the window.
 */
export function startSettings(): void {
  state.stopped = false
  loadUserFilesSync()
  startUserWatcher()
}

/** Releases watchers and timers (`will-quit`). */
export const stopSettings = stopWatchers

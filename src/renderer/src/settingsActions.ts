import { createLatest } from './lib/latest'
import type { SettingsSnapshot, SettingsFileKind, SettingKey, SettingsLayer, Settings } from '@shared/types'
import { activeExcludes } from '@shared/settings'
import { compileExcludes } from './lib/glob'
import { DEFAULT_THEME, isKnownTheme } from './themes'
import { get, set } from './store'
import { registerOverlayPolicy, type OverlayPolicy } from './commands/registry'
import { createReactionScope } from './lib/reactions'
import { showOverlay } from './overlayActions'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { notify } from './toasts'
import { syncTabWithDisk } from './diskSync'
import { openFile } from './tabActions'
import { applyLocale } from './i18n'
import { isLocale, t } from '@shared/i18n'

/** Keys whose value is boolean (the ones a toggle command can flip). */
type BooleanSettingKey = { [K in SettingKey]: Settings[K] extends boolean ? K : never }[SettingKey]

const api = window.api

// Only the response of the latest call counts (a quick folder change must not apply the old workspace).
const settingsSeq = createLatest()
let lastErrors: string[] = []
let warnedTheme: string | null = null

function applySnapshot(snapshot: SettingsSnapshot): void {
  const { settings, excludeMatcher } = get()
  const next = snapshot.settings
  if (isLocale(snapshot.locale)) applyLocale(snapshot.locale)
  const sameExcludes = JSON.stringify(activeExcludes(settings)) === JSON.stringify(activeExcludes(next))
  set({
    settings: next,
    workspaceKeys: snapshot.workspaceKeys,
    settingsLayers: snapshot.layers,
    keybindings: snapshot.keybindings,
    excludeMatcher: sameExcludes ? excludeMatcher : compileExcludes(activeExcludes(next))
  })
  // An error equal to the previous snapshot's is not notified again (delayed auto save rewrites the file on every
  // pause; opening the folder returns the same problem). Fixing and breaking it again notifies, as the snapshot in
  // between clears it.
  for (const error of snapshot.errors) if (!lastErrors.includes(error)) notify(error)
  lastErrors = snapshot.errors
  syncSettingsTabs()
  const theme = next['workbench.theme']
  if (!isKnownTheme(theme) && warnedTheme !== theme) {
    warnedTheme = theme
    notify(t().settings.themeNotFound(theme, DEFAULT_THEME.name))
  }
}

/** Binds the settings to the open folder (`null` = user ones only) and applies the received snapshot. */
export async function syncSettings(root: string | null): Promise<void> {
  const seq = settingsSeq.next()
  try {
    const snapshot = await api.settings.setWorkspace(root)
    if (settingsSeq.isCurrent(seq)) applySnapshot(snapshot)
  } catch (err) {
    // A newer folder change already replaced this one: main may have rejected the old folder.
    if (settingsSeq.isCurrent(seq)) notify(t().settings.loadFailed(errorMessage(err)))
  }
}

/** Listens to settings file changes (including the ones saved by the editor itself). */
export function watchSettings(): () => void {
  return api.settings.onChange((snapshot) => applySnapshot(snapshot))
}

/** Opens `settings.json`, the workspace one or `keybindings.json` in a pinned tab (main creates it if missing). */
export async function openSettingsFile(kind: SettingsFileKind): Promise<void> {
  const path = await api.settings.openFile(kind)
  settingsPaths.add(path)
  openFile(path)
}

export function openSettingsModal(): void {
  if (get().overlay?.kind !== 'settings' || get().quickInput) showOverlay({ kind: 'settings' })
}

export function closeSettingsModal(): void {
  if (get().overlay?.kind === 'settings') set({ overlay: null })
}

/** ⌘W closes the modal (like a preferences window), not the hidden tab; other commands close it before running. */
const settingsPolicy: OverlayPolicy = {
  priority: 10,
  active: (s) => s.overlay?.kind === 'settings',
  close: closeSettingsModal,
  consumes: (id) => id === 'workbench.closeTab'
}

export function startSettingsReactions(): () => void {
  const scope = createReactionScope()
  scope.add(registerOverlayPolicy(settingsPolicy))
  return scope.stop
}

/**
 * Writes a key to a layer through main. No optimistic state: the new value arrives in the `onChange` snapshot. An error
 * becomes a toast; returns whether it wrote (the control discards the draft when not).
 */
export async function setSettingValue<K extends SettingKey>(
  layer: SettingsLayer,
  key: K,
  value: Settings[K]
): Promise<boolean> {
  return attempt(
    async () => {
      await api.settings.setValue(layer, key, value)
      return true
    },
    { fallback: false }
  )
}

/** Flips a boolean setting in the layer that defines it (the workspace one, if it has the key; else the user one). */
export async function toggleBooleanSetting(key: BooleanSettingKey): Promise<boolean> {
  const { settings, workspaceKeys } = get()
  return setSettingValue(workspaceKeys.includes(key) ? 'workspace' : 'user', key, !settings[key])
}

/** Removes the key from the layer (user → default; workspace → user value). Same rules as `setSettingValue`. */
export async function resetSettingValue(layer: SettingsLayer, key: SettingKey): Promise<boolean> {
  return attempt(
    async () => {
      await api.settings.resetValue(layer, key)
      return true
    },
    { fallback: false }
  )
}

// Settings files opened from here. The user ones (userData) are outside the workspace watcher; the settings snapshot
// is the only signal that they changed (e.g. choosing a theme rewrites settings.json).
const settingsPaths = new Set<string>()

function syncSettingsTabs(): void {
  if (settingsPaths.size === 0) return
  for (const tab of get().tabs) if (tab.kind === 'file' && settingsPaths.has(tab.path)) void syncTabWithDisk(tab.id)
}

/** Previews a theme (`null` returns to the configured one). */
export function previewTheme(name: string | null): void {
  if (get().themePreview !== name) set({ themePreview: name })
}

/**
 * Confirms the theme: applies it now (without waiting for the file to come back through the watcher) and writes it
 * where the key wins: in `.walph/settings.json` if it defines `workbench.theme` (otherwise the workspace value would
 * undo the choice), else in the user one.
 */
export async function selectTheme(name: string): Promise<void> {
  const { settings, workspaceKeys } = get()
  const previous = settings['workbench.theme']
  set((s) => ({ settings: { ...s.settings, 'workbench.theme': name }, themePreview: null }))
  if (name === previous) return
  const layer = workspaceKeys.includes('workbench.theme') ? 'workspace' : 'user'
  try {
    await api.settings.setValue(layer, 'workbench.theme', name)
    if (layer === 'workspace') notify(t().settings.themeSavedInWorkspace, 'info')
  } catch (err) {
    if (get().settings['workbench.theme'] === name)
      set((s) => ({ settings: { ...s.settings, 'workbench.theme': previous } }))
    notify(t().settings.themeSaveFailed(errorMessage(err)))
  }
}

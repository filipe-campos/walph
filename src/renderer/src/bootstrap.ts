import { DEFAULT_LOCALE, isLocale } from '@shared/i18n'
import { startAppearance } from './appearance'
import { startAutoSave } from './autoSave'
import { registerBuiltinCommands } from './commands/builtin'
import { startFocusContexts } from './focusContext'
import { applyLocale } from './i18n'
import { startIpcListeners } from './ipcReactions'
import { syncSettings } from './settingsActions'
import { startStoreReactions } from './storeReactions'
import { restoreWorkspace } from './workspaceLifecycle'

// Main sends the language through argv: the first render already uses it, before the first settings snapshot.
function bootLocale(): void {
  const fromMain = window.api.locale
  const locale = isLocale(fromMain) ? fromMain : DEFAULT_LOCALE
  applyLocale(locale)
  document.documentElement.lang = locale
}

/**
 * Single startup entry of the renderer, called once by `main.tsx` before the first render. The order matters: the
 * theme and the language are applied from the start, the main listeners are active before restoring (no event is lost)
 * and the user settings come before the restored folder, which only adds the workspace ones on top.
 */
export function bootstrap(): void {
  bootLocale()
  registerBuiltinCommands()
  startStoreReactions()
  startAppearance()
  startAutoSave()
  startFocusContexts()
  startIpcListeners()
  void syncSettings(null).then(restoreWorkspace)
}

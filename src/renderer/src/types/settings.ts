import type { CommandId, SettingKey, Settings, SettingsSnapshot } from '@shared/types'
import type { Locale } from '@shared/i18n'
import type { ExcludeMatcher } from '../lib/glob'

type Overlay =
  | { kind: 'settings' }
  | { kind: 'addWorkspace' }
  | { kind: 'mcp'; conversationId: string }
  | { kind: 'usage'; conversationId: string }
  | { kind: 'claudeCommandArgs'; conversationId: string; command: string; hint: string }

export interface SettingsState {
  /** Effective configuration (default ← user ← workspace), as main delivered it. */
  settings: Settings
  /** UI language resolved by main; components subscribe to it via `useT()`. */
  locale: Locale
  /** Keys defined in `.walph/settings.json`: changing them from the UI must write there, otherwise the workspace
   * undoes it.
   */
  workspaceKeys: SettingKey[]
  /** Values of each layer as they are in the files (without defaults), for the Settings modal. */
  settingsLayers: SettingsSnapshot['layers']
  /**
   * Open modal (only one at a time): Settings, "Open folder as workspace" (+ of the WorkspaceBar, `workspace.add`) or
   * "MCP Servers" (`/mcp`) of a Claude conversation (real id, never `dormant:`). `null` = none.
   */
  overlay: Overlay | null
  /** Effective shortcut per command (`null` before the first snapshot: the `defaultKeybinding` default applies). */
  keybindings: Partial<Record<CommandId, string[]>> | null
  /** `files.exclude` already compiled (recompiled only when the globs change). */
  excludeMatcher: ExcludeMatcher
  /** Theme being previewed in the picker; applies instead of `settings['workbench.theme']` while it is not `null`. */
  themePreview: string | null
}

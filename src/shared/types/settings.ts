import type { SettingKey, Settings, SettingsFileKind, SettingsLayer, SettingsSnapshot } from '../settings'

export interface SettingsApi {
  /**
   * Binds the window settings to the open folder (`settings:setWorkspace`): starts reading and watching
   * `<root>/.walph/settings.json` (`null` = no folder, user only). Returns the effective snapshot; its `errors`
   * must be notified.
   */
  setWorkspace(root: string | null): Promise<SettingsSnapshot>
  /**
   * Absolute path of the file (`settings:openFile`), creating it from a commented template if it does not exist yet
   * (`user` = `<userData>/settings.json`, `keybindings` = `<userData>/keybindings.json`, `workspace` =
   * `<root>/.walph/settings.json`; with no folder open, `workspace` fails).
   */
  openFile(kind: SettingsFileKind): Promise<string>
  /**
   * Writes a key to the user `settings.json` or to the window folder's `.walph/settings.json`, preserving
   * comments and formatting (`settings:setValue`). `USER_ONLY_SETTINGS` keys only in the user layer; `workspace` with
   * no folder open fails. The new snapshot arrives through `onChange`.
   */
  setValue<K extends SettingKey>(layer: SettingsLayer, key: K, value: Settings[K]): Promise<void>
  /**
   * Removes the key from the layer (`settings:resetValue`), preserving the comments and formatting of the rest; in
   * the user layer it goes back to the default, in the workspace to the user value. Missing key (or nonexistent file)
   * = nothing to do, no error. Same rules as `setValue` (user-only, no folder, containment). The snapshot arrives
   * through `onChange`.
   */
  resetValue(layer: SettingsLayer, key: SettingKey): Promise<void>
  /**
   * A settings file changed on disk (including one saved by the editor itself) (`settings:changed`). With a parse
   * error, the snapshot keeps the last valid version of that file and carries the problem in `errors`.
   */
  onChange(cb: (snapshot: SettingsSnapshot) => void): () => void
}

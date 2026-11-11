/**
 * `walph` terminal command (like VS Code's `code`), only in the packaged app. macOS: `/usr/local/bin/walph`
 * (asks for the administrator password if needed); Linux: `~/.local/bin/walph`; Windows: `walph.cmd` in
 * `%LOCALAPPDATA%\Microsoft\WindowsApps` (already in the user's PATH). They return the translated success message
 * (`t()`) (or `null` if the user cancelled); they throw a translated message (`t()`).
 */
export interface CliApi {
  /**
   * `cli:install`. A `walph` file that Walph did not create is only overwritten after a native confirmation.
   * `null` = the user cancelled (confirmation or administrator password): nothing to report.
   */
  install(): Promise<string | null>
  /** `cli:uninstall`. Only removes the file if Walph created it. `null` = cancelled by the user. */
  uninstall(): Promise<string | null>
}

export interface TerminalCreateOptions {
  /** Initial directory; `null` = home folder. */
  cwd: string | null
  /** Name of a `terminal.profiles` profile; `null`/absent = default profile. */
  profile?: string | null
  /**
   * Instead of a shell, opens `docker exec -it <container> sh` (`docker.path` executable). Container id
   * (12–64 hex) or a name seen in this view's last `docker.list()`; ignores `profile`. Invalid → error with a
   * translated message (`t()`).
   */
  dockerExec?: string
  /**
   * Instead of a shell, runs `claude auth login` directly in the pty (`claude.executable` binary or the one bundled in
   * the SDK, same PATH/`claude.env` as the conversations), without depending on `claude` being in the PATH. The
   * terminal closes when the command ends; ignores `profile` and `dockerExec`. No executable → error with a translated
   * message (`t()`). Afterwards, call `claude.restartAll()`.
   */
  claudeLogin?: boolean
  /**
   * Instead of a shell, runs the program the debug adapter asked for (`runInTerminal`): `ticket` is the one from the
   * `debug.onEvent` event, single use; command, folder and environment stay in main. Ignores `profile`, `dockerExec`
   * and `claudeLogin`. Unknown or expired ticket → error with a translated message (`t()`).
   */
  debugRun?: string
}

export interface TerminalCreated {
  id: string
  /** Initial title (shell name, e.g. `zsh`), the same format as `onTitle`. */
  title: string
}

export interface TerminalApi {
  /**
   * Opens a shell (`terminal:create`). `profile` is the name of a `terminal.profiles` profile; `null`/absent uses
   * `terminal.defaultProfile` and, if empty, `terminal.shell`/the OS default. The executable always comes from the
   * effective configuration in main (the renderer only sends the name). Missing profile → error with a translated
   * message (`t()`).
   */
  create(options: TerminalCreateOptions): Promise<TerminalCreated>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  /**
   * Flow control (`terminal:ack`): the renderer confirms `chars` characters (`string.length`) of `onData` already
   * delivered to xterm. Main adds up what it sent and pauses the pty above ~1 MB unconfirmed, resuming below
   * ~256 KB. The `onData` chunks already arrive batched (~16 ms; ~100 ms with the view hidden).
   */
  ack(id: string, chars: number): void
  onData(cb: (id: string, data: string) => void): () => void
  onExit(cb: (id: string, exitCode: number) => void): () => void
  /**
   * Automatic title: the name (basename, without extension on Windows) of the pty's foreground process changed
   * (`terminal:title`; e.g. `zsh` → `htop` → `zsh`). Only on change. On Windows the title is always the shell name.
   */
  onTitle(cb: (id: string, title: string) => void): () => void
  /**
   * Resolves the text of a terminal file link (`terminal:resolveLink`, only the path, without `:line:column`):
   * `~` expanded, absolute directly and relative tried against the shell's current directory (best effort), the window
   * folder and the terminal's initial directory, in that order. Returns the absolute path of the first existing
   * **file** (anywhere on disk; inside the window folder it comes in the folder's spelling), otherwise `null`. A
   * terminal of another window → `null`.
   */
  resolveLink(id: string, path: string): Promise<string | null>
  /**
   * Current directory of the shell of terminal `id` (`terminal:cwd`), native absolute path, best effort (lsof on
   * macOS, /proc on Linux; on Windows returns the initial directory). Cached ~1 s in main. `null` when the terminal
   * belongs to another view or no longer exists.
   */
  cwd(id: string): Promise<string | null>
}

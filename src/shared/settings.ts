// Settings schema (`settings.json`), defaults and the default ← user ← workspace merge. Flat keys, as in VS Code
// (`"editor.fontSize": 16`). JSONC parsing lives in main; only the already-read object arrives here.

import { isModelId } from './claudeModel'
import { isRecord } from './guards'
import { isLanguageId } from './languageId'
import type { CommandId } from './commands'
import { formatList, t, type Messages } from './i18n'
import { LOCALES, type LanguageSetting, type Locale } from './i18n/locale'

/** `claude.effort`: a `ClaudeEffort` level (`types.ts`) or empty = the model default. */
type ClaudeDefaultEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * Claude panel permission modes: `default` = "Manual", `acceptEdits` = "Edit automatically", `plan` = "Plan",
 * `auto` = "Auto" (a CLI classifier approves/denies each call and asks when unsure),
 * `bypassPermissions` = "Bypass permissions" (only with
 * `claude.allowBypassPermissions`). The SDK's `dontAsk` is not offered.
 */
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

type AutoSave = 'off' | 'afterDelay' | 'onFocusChange'

/**
 * A language server in `lsp.servers`. The id `typescript` is the built-in one (`typescript-language-server`, TS/JS):
 * it exists even when absent from the settings; an entry with that id only changes what it defines
 * (e.g. `enabled: false`).
 */
export interface LspServerSetting {
  /** Executable: absolute path or name resolved via PATH (same rules as `terminal.shell`). Omitted in the built-in. */
  command?: string
  args?: string[]
  /** Handled extensions, with a dot (`.py`). Required for a custom server; in the built-in it replaces the defaults. */
  extensions?: string[]
  /** `didOpen` `languageId`; default = the server id. The built-in takes it from the extension (`typescriptreact`…). */
  languageId?: string
  /** `false` turns the server off (including the built-in). Default `true`. */
  enabled?: boolean
  /**
   * Only for the id `typescript`. `true` uses the project's `tsserver.js` (`node_modules/typescript`, in the folder or
   * in ancestors) instead of the built-in one. Default `false`: that file comes from the repository and would run its
   * code when opening a .ts.
   */
  useWorkspaceTypeScript?: boolean
}

/**
 * A debug adapter in `debug.adapters`, by the `type` of the `launch.json` configurations (`python`, `node`…).
 * Replaces the default of the same type (`python` = `python3 -m debugpy.adapter`).
 */
export interface DebugAdapterSetting {
  /** Executable: absolute path or name resolved through PATH (same rules as `terminal.shell`). */
  command: string
  args?: string[]
  /**
   * `stdio` (default): the adapter speaks DAP over standard input/output. `tcp`: the command starts a DAP server on a
   * local port; `${port}` in `args` becomes a free port (e.g. js-debug's `dapDebugServer.js` for `node`/`pwa-node`).
   */
  transport?: 'stdio' | 'tcp'
  /** Variables added to the adapter's environment (`null` removes the variable). */
  env?: Record<string, string | null>
}

/** A shell profile in `terminal.profiles` (profile name = key). */
export interface TerminalProfile {
  /** Executable: same rules as `terminal.shell` (absolute or name resolved through PATH; not empty). */
  path: string
  /** Arguments; absent = the same ones `terminal.shell` would use (`-l` on known POSIX shells). */
  args?: string[]
  /** Variables added to the shell's environment (`null` removes the variable). */
  env?: Record<string, string | null>
}

export interface Settings {
  'editor.fontSize': number
  'editor.fontFamily': string
  /** Tab width and indent used when the file has no detectable indentation. */
  'editor.tabSize': number
  /** Indent with spaces (`true`) or tabs, when the file has no detectable indentation. */
  'editor.insertSpaces': boolean
  'editor.wordWrap': 'off' | 'on'
  'editor.lineNumbers': 'on' | 'off'
  /** Code minimap on the right of the editor (with the git marks and diagnostics). */
  'editor.minimap': boolean
  /** Header lines of the scopes enclosing the top of the screen, pinned to the top of the editor. */
  'editor.stickyScroll.enabled': boolean
  /** Maximum number of lines pinned by sticky scroll. */
  'editor.stickyScroll.maxLineCount': number
  /** File path and cursor symbol above each editor. */
  'breadcrumbs.enabled': boolean
  /** Language server code lenses (reference counts etc.) above declarations. */
  'editor.codeLens': boolean
  /** Formats the document through the language server on manual save (not on auto save). */
  'editor.formatOnSave': boolean
  /** Language server inlay hints (inferred types, parameter names) inside the code. */
  'editor.inlayHints.enabled': 'on' | 'off'
  /** Language server semantic token colors on top of syntax highlighting. */
  'editor.semanticHighlighting.enabled': boolean
  /** Columns of the vertical rulers (added to the file's EditorConfig `max_line_length`). */
  'editor.rulers': number[]
  /** Which spaces and tabs the editor draws: `boundary` hides only the single space between words. */
  'editor.renderWhitespace': 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  /** On save: strips spaces and tabs at the end of lines (the file's EditorConfig wins). */
  'files.trimTrailingWhitespace': boolean
  /** On save: ends the file with a line break (the file's EditorConfig wins). */
  'files.insertFinalNewline': boolean
  /** On save: keeps a single line break after the last line with content. */
  'files.trimFinalNewlines': boolean
  /** Where snippets go in the completion list: at the top, at the bottom, mixed (`inline`) or never (`none`). */
  'editor.snippetSuggestions': 'top' | 'bottom' | 'inline' | 'none'
  /** Emmet abbreviations (completion and commands) in HTML, JSX/TSX, Vue and CSS/SCSS/Less. */
  'emmet.enabled': boolean
  /** Tab expands the abbreviation before the cursor (when no completion is open and no snippet field is active). */
  'emmet.triggerExpansionOnTab': boolean
  /** `languageId` → `languageId` supported by Emmet (e.g. `{ "php": "html" }`). */
  'emmet.includeLanguages': Record<string, string>
  /** Author, date and summary of the commit of the cursor line, at its end (blame). */
  'git.blame.inline': boolean
  /** Blame of the cursor line in the status bar. */
  'git.blame.statusBar': boolean
  'files.autoSave': AutoSave
  /** Delay (ms) of `afterDelay`. */
  'files.autoSaveDelay': number
  // Globs relative to the root (e.g. "**/dist") hidden from the explorer and Quick Open when `true`.
  'files.exclude': Record<string, boolean>
  // Globs (same semantics as `files.exclude`) excluded only from global search, added to those of `files.exclude`.
  'search.exclude': Record<string, boolean>
  // Globs (relative to the root) the tree watcher does not observe: heavy folders nobody edits by hand. Does not
  // include `files.exclude` (a display filter: hiding `**/*.js` must not stop reloads or LSP notifications). Changes
  // in the listed folders do not show up in the explorer on their own.
  'files.watcherExclude': Record<string, boolean>
  'terminal.fontSize': number
  /** History lines kept per terminal (memory grows with them). */
  'terminal.scrollback': number
  /**
   * Shell executable; empty = the system default. Absolute path or simple name (resolved through PATH); a relative
   * path is rejected. Only applies in the user settings (see `USER_ONLY_SETTINGS`).
   */
  'terminal.shell': string
  /** Shell profiles by name, offered in the "+" button picker. Only in the user settings: runs programs. */
  'terminal.profiles': Record<string, TerminalProfile>
  /** Profile used by "New Terminal"; empty = `terminal.shell`. Only in the user settings. */
  'terminal.defaultProfile': string
  /** Copies the text to the clipboard when selecting in the terminal. */
  'terminal.copyOnSelection': boolean
  /** Gives the default zsh/bash prompt the theme colors; prompts customized by the user stay untouched. */
  'terminal.colorPrompt': boolean
  /** `auto` tries the WebGL renderer (falls back to the DOM on failure or context loss); `off` always uses the DOM. */
  'terminal.gpuAcceleration': 'auto' | 'off'
  /** Interface language: `system` follows the operating system. User only: the native menu belongs to the whole app. */
  'workbench.language': LanguageSetting
  /** Theme name (`Walph Dark`, `Walph Light`). */
  'workbench.theme': string
  /** Interface fonts (outside the editor and the terminal), in CSS format. */
  'workbench.fontFamily': string
  /** Base font size of the interface, in px: the other UI sizes scale from it. */
  'workbench.fontSize': number
  /** Language servers by id (besides the built-in `typescript`). Only in the user settings: runs programs. */
  'lsp.servers': Record<string, LspServerSetting>
  /** Debug adapters by `type` (besides the default `python`). Only in the user settings: runs programs. */
  'debug.adapters': Record<string, DebugAdapterSetting>
  /** Model for new Claude panel conversations (an alias like `opus`/`sonnet` or a full id); empty = the CLI default. */
  'claude.model': string
  /**
   * Fallback model(s) when the main one is overloaded or unavailable (comma-separated list, tried in
   * order; the main one is tried again every turn). Empty = no fallback. Only in the user settings: a
   * repository does not choose a different model (and cost).
   */
  'claude.fallbackModel': string
  /** Permission mode each new conversation starts with. Only in the user settings. */
  'claude.initialPermissionMode': ClaudePermissionMode
  /** Effort each new conversation starts with; empty = the model default. */
  'claude.effort': ClaudeDefaultEffort
  /**
   * Unlocks the "Bypass permissions" mode (`bypassPermissions`: commands run without asking). Without it the mode
   * shows disabled in the menu, stays out of the ⇧⇥ cycle, main refuses `setPermissionMode('bypassPermissions')` and a
   * `claude.initialPermissionMode` equal to it falls back to `default`. Only in the user settings.
   */
  'claude.allowBypassPermissions': boolean
  /** Attaches the active file and editor selection to each message (the prompt box button turns it off per message). */
  'claude.autoContext': boolean
  /**
   * Claude Code executable used by the Agent SDK; empty = the binary bundled with the SDK. Same rules as
   * `terminal.shell`. Only in the user settings: runs programs.
   */
  'claude.executable': string
  /** Variables added to the Claude process environment (`null` removes the variable). Only in the user settings. */
  'claude.env': Record<string, string | null>
  /** Claude toasts: `all` (finished/asked/failed), `attention` (only requests and failures) or `off`. */
  'claude.notifications.toast': 'all' | 'attention' | 'off'
  /** System notification when the session finishes/asks/fails while the window is unfocused. */
  'claude.notifications.system': boolean
  /** Sound along with the conversation alerts (toast or system notification). */
  'claude.notifications.sound': boolean
  /**
   * Idle minutes until the conversation shuts down the CLI process (it comes back with `resume` on the next send).
   * 0 = never.
   * Off by default: the relaunch takes down the session's MCP servers. User only (memory policy).
   */
  'claude.idleSleepMinutes': number
  /**
   * Docker executable (`docker`, or a compatible one like `podman`); empty = `docker` from the login shell's
   * PATH. Same rules as `terminal.shell`. Only in the user settings: runs programs.
   */
  'docker.path': string
  /** Maximum workspaces with a loaded view; the least recent ones hibernate (go back to dormant). 0 = no limit. */
  'workspaces.maxLiveViews': number
  /** Minutes without use until an inactive workspace hibernates. 0 = never. */
  'workspaces.hibernateAfterMinutes': number
  /** Automatic update of the packaged app (checks on launch and every 4 h). User only. */
  'update.enabled': boolean
  /** Update channel: `stable` (releases) or `beta` (accepts pre-releases). User only. */
  'update.channel': 'stable' | 'beta'
}

export type SettingKey = keyof Settings

/** Layer the read object came from. */
export type SettingsLayer = 'user' | 'workspace'

export const DEFAULT_SETTINGS: Settings = {
  'editor.fontSize': 13,
  'editor.fontFamily': "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  'editor.tabSize': 2,
  'editor.insertSpaces': true,
  'editor.wordWrap': 'off',
  'editor.lineNumbers': 'on',
  'editor.minimap': true,
  'editor.stickyScroll.enabled': true,
  'editor.stickyScroll.maxLineCount': 5,
  'breadcrumbs.enabled': true,
  'editor.codeLens': true,
  'editor.formatOnSave': false,
  'editor.inlayHints.enabled': 'on',
  'editor.semanticHighlighting.enabled': true,
  'editor.rulers': [],
  'editor.renderWhitespace': 'selection',
  'files.trimTrailingWhitespace': false,
  'files.insertFinalNewline': false,
  'files.trimFinalNewlines': false,
  'editor.snippetSuggestions': 'inline',
  'emmet.enabled': true,
  'emmet.triggerExpansionOnTab': true,
  'emmet.includeLanguages': {},
  'git.blame.inline': true,
  'git.blame.statusBar': true,
  'files.autoSave': 'off',
  'files.autoSaveDelay': 1000,
  'files.exclude': { '**/.git': true, '**/.DS_Store': true },
  'search.exclude': { '**/node_modules': true, '**/bower_components': true },
  'files.watcherExclude': {
    // Same default as VS Code.
    '**/.git/objects/**': true,
    '**/.git/subtree-cache/**': true,
    '**/node_modules/*/**': true,
    '**/.hg/store/**': true
  },
  'terminal.fontSize': 13,
  'terminal.scrollback': 5000,
  'terminal.shell': '',
  'terminal.profiles': {},
  'terminal.defaultProfile': '',
  'terminal.copyOnSelection': false,
  'terminal.colorPrompt': true,
  'terminal.gpuAcceleration': 'auto',
  'workbench.language': 'system',
  'workbench.theme': 'Walph Dark',
  'workbench.fontFamily': "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  'workbench.fontSize': 13,
  'lsp.servers': {},
  'debug.adapters': {},
  'claude.model': '',
  'claude.fallbackModel': '',
  'claude.initialPermissionMode': 'default',
  'claude.effort': '',
  'claude.allowBypassPermissions': false,
  'claude.autoContext': false,
  'claude.executable': '',
  'claude.env': {},
  'claude.notifications.toast': 'all',
  'claude.notifications.system': true,
  'claude.notifications.sound': true,
  'claude.idleSleepMinutes': 0,
  'docker.path': '',
  'workspaces.maxLiveViews': 8,
  'workspaces.hibernateAfterMinutes': 120,
  'update.enabled': true,
  'update.channel': 'stable'
}

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[]

/** Settings files the user edits in the editor itself. */
export type SettingsFileKind = 'user' | 'workspace' | 'keybindings'

export interface SettingsSnapshot {
  /** Effective settings: default ← user ← workspace (always the last valid version of each file). */
  settings: Settings
  /**
   * Effective shortcuts of each command (default ← `keybindings.json`), in order of preference: the UI and the menu
   * show the first. Missing command = no shortcut (never an empty list).
   */
  keybindings: Partial<Record<CommandId, string[]>>
  /** Problems found by the read that produced this snapshot (pt-BR, already with the file name). Empty if none. */
  errors: string[]
  /**
   * Keys defined (with a valid value) in the window folder's `.walph/settings.json`. Changing one of them through the
   * UI must write to the workspace, otherwise the choice is undone by the workspace value, which wins.
   */
  workspaceKeys: SettingKey[]
  /**
   * Valid values of each layer as they are in the file (no defaults): the Settings modal shows the
   * value of the chosen layer (`user` = default ← user; `workspace` = effective) and the "set in
   * workspace" indicator. `workspace` is `{}` with no folder open.
   */
  layers: { user: Partial<Settings>; workspace: Partial<Settings> }
  /** Language in use, already resolved by main from `workbench.language` and the system. */
  locale: Locale
}

/** `platform` (`process.platform`) only matters for file paths; `undefined` accepts the forms of every OS. */
type Validator = (value: unknown, platform?: string) => boolean

const intIn =
  (min: number, max: number): Validator =>
  (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const oneOf =
  (...options: string[]): Validator =>
  (v) =>
    typeof v === 'string' && options.includes(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

/**
 * Empty, absolute path or simple name without a separator (resolved through PATH). Not relative. Absolute depends on
 * the OS: `win32` accepts `C:\\`/`C:/` and UNC; the others only `/…`. Without `platform` (renderer) it accepts both
 * forms.
 */
export function isValidShellSetting(v: unknown, platform?: string): boolean {
  if (typeof v !== 'string') return false
  const text = v.trim()
  if (text === '') return true
  const posixAbsolute = text.startsWith('/')
  const windowsAbsolute = text.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(text)
  if (
    platform === undefined ? posixAbsolute || windowsAbsolute : platform === 'win32' ? windowsAbsolute : posixAbsolute
  )
    return true
  return !/[\\/:]/.test(text) && text !== '.' && text !== '..'
}

const MAX_RULERS = 10
const MAX_RULER_COLUMN = 500

/** Server id: letters, digits, `.`, `_` and `-` (becomes a name in the log and in the status). */
const LSP_SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function isValidLspServer(id: string, v: unknown, platform?: string): boolean {
  if (!isRecord(v) || !LSP_SERVER_ID.test(id)) return false
  const { command, args, extensions, languageId, enabled, useWorkspaceTypeScript } = v
  const known = ['command', 'args', 'extensions', 'languageId', 'enabled', 'useWorkspaceTypeScript']
  if (Object.keys(v).some((k) => !known.includes(k))) return false
  if (command !== undefined && (!isString(command) || command.trim() === '' || !isValidShellSetting(command, platform)))
    return false
  if (args !== undefined && !(Array.isArray(args) && args.every(isString))) return false
  if (
    extensions !== undefined &&
    !(Array.isArray(extensions) && extensions.every((e) => isString(e) && /^\.[^./\\]+$/.test(e)))
  )
    return false
  if (languageId !== undefined && !(isString(languageId) && languageId.trim() !== '')) return false
  if (enabled !== undefined && !isBoolean(enabled)) return false
  if (useWorkspaceTypeScript !== undefined && (id !== 'typescript' || !isBoolean(useWorkspaceTypeScript))) return false
  // A custom server needs a command and extensions (unless off); the built-in has its own.
  if (id !== 'typescript' && enabled !== false && (command === undefined || extensions === undefined)) return false
  return true
}

/** Debug configuration `type`: same format as the language server id. */
const DEBUG_ADAPTER_TYPE = LSP_SERVER_ID

function isValidDebugAdapter(type: string, v: unknown, platform?: string): boolean {
  if (!isRecord(v) || !DEBUG_ADAPTER_TYPE.test(type)) return false
  const { command, args, transport, env } = v
  if (Object.keys(v).some((k) => !['command', 'args', 'transport', 'env'].includes(k))) return false
  if (!isString(command) || command.trim() === '' || !isValidShellSetting(command, platform)) return false
  if (args !== undefined && !(Array.isArray(args) && args.every(isString))) return false
  if (transport !== undefined && transport !== 'stdio' && transport !== 'tcp') return false
  // In `tcp` the port only reaches the adapter through the arguments.
  if (transport === 'tcp' && !(Array.isArray(args) && args.some((a) => isString(a) && a.includes('${port}'))))
    return false
  if (env !== undefined && !isValidEnvMap(env)) return false
  return true
}

/** Profile name: non-empty text, no line break, up to 64 characters (shown in the picker and in the tab). */
function isValidProfileName(name: string): boolean {
  return name.trim() !== '' && name.length <= 64 && !/[\r\n]/.test(name)
}

function isValidTerminalProfile(name: string, v: unknown, platform?: string): boolean {
  if (!isRecord(v) || !isValidProfileName(name)) return false
  const { path, args, env } = v
  if (Object.keys(v).some((k) => !['path', 'args', 'env'].includes(k))) return false
  if (!isString(path) || path.trim() === '' || !isValidShellSetting(path, platform)) return false
  if (args !== undefined && !(Array.isArray(args) && args.every(isString))) return false
  // An empty name or one with `=`/NUL would become a broken entry in the pty environment.
  const validEnv = (e: Record<string, unknown>): boolean =>
    Object.entries(e).every(([k, val]) => k !== '' && !/[=\0]/.test(k) && (val === null || isString(val)))
  if (env !== undefined && !(isRecord(env) && validEnv(env))) return false
  return true
}

/** Extra environment: non-empty name without `=`/NUL (would become a broken entry), text value or `null` (removes). */
export const isValidEnvMap = (v: unknown): boolean =>
  isRecord(v) && Object.entries(v).every(([k, val]) => k !== '' && !/[=\0]/.test(k) && (val === null || isString(val)))

// `expected` is a function: the warning comes out in the language current when the file is read.
type Rule = {
  /** `user`: only the user `settings.json` counts; a repository `.walph/settings.json` is discarded with a warning. */
  scope: 'user' | 'any'
  check: Validator
  expected: () => string
}

const e = (): Messages['settings']['expected'] => t().settings.expected
const oneOfRule = (scope: Rule['scope'], ...options: string[]): Rule => ({
  scope,
  check: oneOf(...options),
  expected: () =>
    formatList(
      options.map((o) => JSON.stringify(o)),
      'disjunction'
    )
})

/**
 * Rules per key. `scope: 'user'` is required for everything that runs a program or changes a whole-app policy: a
 * cloned repository cannot swap the shell, the Claude executable or the children's environment, nor unlock commands
 * without asking (the CLI also discards the bypass mode coming from the project).
 */
export const SETTING_RULES: Record<SettingKey, Rule> = {
  'editor.fontSize': { scope: 'any', check: intIn(6, 72), expected: () => e().intBetween(6, 72) },
  'editor.fontFamily': { scope: 'any', check: (v) => isString(v) && v.trim() !== '', expected: () => e().text },
  'editor.tabSize': { scope: 'any', check: intIn(1, 16), expected: () => e().intBetween(1, 16) },
  'editor.insertSpaces': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.wordWrap': oneOfRule('any', 'off', 'on'),
  'editor.lineNumbers': oneOfRule('any', 'on', 'off'),
  'editor.minimap': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.stickyScroll.enabled': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.stickyScroll.maxLineCount': { scope: 'any', check: intIn(1, 20), expected: () => e().intBetween(1, 20) },
  'breadcrumbs.enabled': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.codeLens': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.formatOnSave': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.inlayHints.enabled': oneOfRule('any', 'on', 'off'),
  'editor.semanticHighlighting.enabled': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.rulers': {
    scope: 'any',
    check: (v) => Array.isArray(v) && v.length <= MAX_RULERS && v.every((c) => intIn(1, MAX_RULER_COLUMN)(c)),
    expected: () => e().rulers(MAX_RULERS, MAX_RULER_COLUMN)
  },
  'editor.renderWhitespace': oneOfRule('any', 'none', 'boundary', 'selection', 'trailing', 'all'),
  'files.trimTrailingWhitespace': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'files.insertFinalNewline': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'files.trimFinalNewlines': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'editor.snippetSuggestions': oneOfRule('any', 'top', 'bottom', 'inline', 'none'),
  'emmet.enabled': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'emmet.triggerExpansionOnTab': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'emmet.includeLanguages': {
    scope: 'any',
    check: (v) => isRecord(v) && Object.entries(v).every(([from, to]) => isLanguageId(from) && isLanguageId(to)),
    expected: () => e().languageMap
  },
  'git.blame.inline': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'git.blame.statusBar': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'files.autoSave': oneOfRule('any', 'off', 'afterDelay', 'onFocusChange'),
  'files.autoSaveDelay': { scope: 'any', check: intIn(100, 600_000), expected: () => e().intBetween(100, 600000) },
  'files.exclude': {
    scope: 'any',
    check: (v) => isRecord(v) && Object.values(v).every(isBoolean),
    expected: () => e().globMap
  },
  'search.exclude': {
    scope: 'any',
    check: (v) => isRecord(v) && Object.values(v).every(isBoolean),
    expected: () => e().globMap
  },
  'files.watcherExclude': {
    scope: 'any',
    check: (v) => isRecord(v) && Object.values(v).every(isBoolean),
    expected: () => e().globMap
  },
  'terminal.fontSize': { scope: 'any', check: intIn(6, 72), expected: () => e().intBetween(6, 72) },
  'terminal.scrollback': { scope: 'any', check: intIn(100, 100000), expected: () => e().intBetween(100, 100000) },
  'terminal.shell': {
    scope: 'user',
    check: isValidShellSetting,
    expected: () => e().executable
  },
  'terminal.profiles': {
    scope: 'user',
    check: (v, platform) =>
      isRecord(v) && Object.entries(v).every(([name, profile]) => isValidTerminalProfile(name, profile, platform)),
    expected: () => e().profiles
  },
  'terminal.defaultProfile': { scope: 'user', check: isString, expected: () => e().defaultProfile },
  'terminal.copyOnSelection': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'terminal.colorPrompt': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'terminal.gpuAcceleration': oneOfRule('any', 'auto', 'off'),
  'workbench.language': {
    scope: 'user',
    check: oneOf('system', ...LOCALES),
    expected: () => e().language(LOCALES.map((l) => `"${l}"`).join(', '))
  },
  'workbench.theme': { scope: 'any', check: (v) => isString(v) && v.trim() !== '', expected: () => e().themeName },
  'workbench.fontFamily': {
    scope: 'any',
    check: (v) => isString(v) && v.trim() !== '' && v.length <= 500,
    expected: () => e().textUpTo(500)
  },
  'workbench.fontSize': { scope: 'any', check: intIn(10, 20), expected: () => e().intBetween(10, 20) },
  'lsp.servers': {
    scope: 'user',
    check: (v, platform) =>
      isRecord(v) && Object.entries(v).every(([id, server]) => isValidLspServer(id, server, platform)),
    expected: () => e().lspServers
  },
  'debug.adapters': {
    scope: 'user',
    check: (v, platform) =>
      isRecord(v) && Object.entries(v).every(([type, adapter]) => isValidDebugAdapter(type, adapter, platform)),
    expected: () => e().debugAdapters
  },
  'claude.model': {
    scope: 'any',
    check: (v) => v === '' || isModelId(v),
    expected: () => e().model
  },
  'claude.fallbackModel': {
    scope: 'user',
    check: (v) => v === '' || (isString(v) && v.split(',').every(isModelId)),
    expected: () => e().fallbackModels
  },
  'claude.initialPermissionMode': oneOfRule('user', 'default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'),
  'claude.effort': oneOfRule('any', '', 'low', 'medium', 'high', 'xhigh', 'max'),
  'claude.allowBypassPermissions': { scope: 'user', check: isBoolean, expected: () => e().boolean },
  'claude.autoContext': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'claude.executable': {
    scope: 'user',
    check: isValidShellSetting,
    expected: () => e().executable
  },
  'claude.env': { scope: 'user', check: isValidEnvMap, expected: () => e().envMap },
  'claude.notifications.toast': oneOfRule('any', 'all', 'attention', 'off'),
  'claude.notifications.system': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'claude.notifications.sound': { scope: 'any', check: isBoolean, expected: () => e().boolean },
  'claude.idleSleepMinutes': { scope: 'user', check: intIn(0, 1440), expected: () => e().intBetweenNever(0, 1440) },
  'docker.path': {
    scope: 'user',
    check: isValidShellSetting,
    expected: () => e().executable
  },
  'workspaces.maxLiveViews': { scope: 'user', check: intIn(0, 64), expected: () => e().intBetweenNoLimit(0, 64) },
  'workspaces.hibernateAfterMinutes': {
    scope: 'user',
    check: intIn(0, 10_080),
    expected: () => e().intBetweenNever(0, 10080)
  },
  'update.enabled': { scope: 'user', check: isBoolean, expected: () => e().boolean },
  'update.channel': oneOfRule('user', 'stable', 'beta')
}

export const USER_ONLY_SETTINGS: readonly SettingKey[] = SETTING_KEYS.filter((k) => SETTING_RULES[k].scope === 'user')

/**
 * Validates the object read from a `settings.json`: keeps only the known keys with a valid value. An unknown key or
 * invalid value becomes a warning (and is ignored), without invalidating the rest of the file. In the `workspace`
 * layer, `USER_ONLY_SETTINGS` keys are discarded with a warning too. Main passes `platform` to validate shell paths.
 */
export function sanitizeSettings(
  raw: unknown,
  layer: SettingsLayer = 'user',
  platform?: string
): { values: Partial<Settings>; warnings: string[] } {
  if (!isRecord(raw)) return { values: {}, warnings: [t().settings.warnings.notObject] }
  const values: Record<string, unknown> = {}
  const warnings: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    // `Object.hasOwn`: the key comes from the file; `constructor`/`toString` must not hit the object's prototype.
    const rule = Object.hasOwn(SETTING_RULES, key) ? SETTING_RULES[key as SettingKey] : undefined
    if (layer === 'workspace' && USER_ONLY_SETTINGS.includes(key as SettingKey)) {
      warnings.push(t().settings.warnings.userOnly(key))
    } else if (!rule) warnings.push(t().settings.warnings.unknown(key))
    else if (!rule.check(value, platform)) warnings.push(t().settings.warnings.invalid(key, rule.expected()))
    else values[key] = value
  }
  return { values: values, warnings }
}

/** `{ glob: boolean }` keys merged glob by glob across layers. */
const GLOB_MAP_KEYS = ['files.exclude', 'search.exclude', 'files.watcherExclude'] as const

/**
 * Layered merge: each layer overrides the previous one key by key. `files.exclude`/`search.exclude` are merged
 * by glob (as in VS Code), so the workspace can add or turn off (`false`) a pattern without repeating the
 * user's ones.
 */
export function mergeSettings(...layers: { [K in keyof Settings]?: Settings[K] | undefined }[]): Settings {
  const result: Settings = {
    ...DEFAULT_SETTINGS,
    'files.exclude': { ...DEFAULT_SETTINGS['files.exclude'] },
    'search.exclude': { ...DEFAULT_SETTINGS['search.exclude'] },
    'files.watcherExclude': { ...DEFAULT_SETTINGS['files.watcherExclude'] }
  }
  for (const layer of layers) {
    for (const key of SETTING_KEYS) {
      const value = layer[key]
      if (value === undefined) continue
      if ((GLOB_MAP_KEYS as readonly string[]).includes(key)) {
        const k = key as (typeof GLOB_MAP_KEYS)[number]
        result[k] = { ...result[k], ...(value as Record<string, boolean>) }
      } else (result as unknown as Record<string, unknown>)[key] = value
    }
  }
  return result
}

/** Active globs (`true`) of `files.exclude`. */
export function activeExcludes(settings: Settings): string[] {
  return Object.entries(settings['files.exclude'])
    .filter(([, on]) => on)
    .map(([glob]) => glob)
}

/** Active globs the tree watcher ignores: only `files.watcherExclude` (the fixed floor lives in main). */
export function activeWatcherExcludes(settings: Settings): string[] {
  return Object.entries(settings['files.watcherExclude'])
    .filter(([, on]) => on)
    .map(([glob]) => glob)
}

/** Active globs of global search: `files.exclude` + `search.exclude` (no repeats). */
export function activeSearchExcludes(settings: Settings): string[] {
  const globs = new Set(activeExcludes(settings))
  for (const [glob, on] of Object.entries(settings['search.exclude'])) if (on) globs.add(glob)
  return [...globs]
}

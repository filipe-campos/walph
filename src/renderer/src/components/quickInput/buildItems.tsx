// Item builders for each quick input mode. Pure functions over the received context (no hooks).
import type { ReactNode } from 'react'
import { compareText, t } from '@shared/i18n'
import { executeCommand, keybindingOf, listCommands, recentCommandIds, type Command } from '../../commands/registry'
import { fuzzyMatch } from '../../lib/fuzzy'
import { rankByLabel } from '../../lib/rankByLabel'
import { rankPaths } from '../../lib/fuzzyPath'
import { formatKeybinding } from '../../lib/keybinding'
import { emptyQueryFiles, toAbs, toRel, type QuickFile } from '../../lib/quickOpenFiles'
import { parseFileQuery, parseLineQuery, toReveal } from '../../lib/quickOpenQuery'
import { focusEditor } from '../editor/editorFocus'
import type { Reveal } from '../../types/tabs'
import { PLAIN_TEXT } from '../../lib/language'
import { encodingEntries, languageEntries } from '../../lib/statusPickers'
import { rankSymbols } from '../../lib/lspSymbols'
import { iconForSymbolKind } from '../../lib/symbolKinds'
import { recordNavigation } from '../../navigationState'
import { revealSymbol } from '../../lspNavigationActions'
import type { LspSymbol, RecentFolder, TextEncoding } from '@shared/types'
import type { TerminalProfile } from '@shared/settings'
import type { SymbolsLoaded } from './useSymbols'
import { rankRecentFolders } from '../../lib/recentFolders'
import { THEMES } from '../../themes'
import { highlight, pathLabel } from './highlight'
import type { AgentStatus } from '../common/StatusDot'
import { selectTheme } from '../../settingsActions'
import { createTerminal } from '../../terminalActions'
import { activeLoadedFileTab, openFile } from '../../tabActions'
import { reopenWithEncoding, saveWithEncoding, setTabLanguage } from '../../tabFormatActions'
import { openWorkspace } from '../../workspaceLifecycle'

export interface QuickItem {
  key: string
  icon?: string
  /** File theme icon (in place of the codicon). */
  fileIcon?: { name: string; folder?: boolean | undefined }
  label: ReactNode
  /** Discreet text on the right (e.g. "recently used"). */
  tag?: string | undefined
  kbd?: string | undefined
  /** Group title (unified palette): the header shows before the first item of each group. */
  group?: string | undefined
  /** Claude status dot in place of the icon (workspaces of the unified palette). */
  status?: AgentStatus | 'none'
  /** Unread count of the workspace (counter next to the dot). */
  unread?: number
  /** AI row ("Ask Claude"): carries the light ring (`.neon`) and the `spark` icon. */
  ai?: boolean
  /** Informative item: shows in the list but Enter/click do nothing. */
  disabled?: boolean
  run: () => void
}

export interface QuickList {
  items: QuickItem[]
  /** Shown in place of the list when there are no items. */
  message?: string | undefined
  /** Discreet note after the items. */
  hint?: string | undefined
}

// ---------- Commands ----------

const fullText = (c: Command): string => `${c.category}: ${c.title}`

export function buildCommandList(text: string, platform: string): QuickList {
  const recentRank = new Map(recentCommandIds().map((id, i) => [id, i]))
  const commands = listCommands()
  const byName = (a: Command, b: Command): number => compareText(fullText(a), fullText(b))
  const toItem = (command: Command, matches: number[], recent: boolean): QuickItem => {
    const set = new Set(matches)
    const keybinding = keybindingOf(command)
    return {
      key: command.id,
      label: (
        <>
          <span className="palette-category">{highlight(`${command.category}: `, set, 0)}</span>
          {highlight(command.title, set, command.category.length + 2)}
        </>
      ),
      tag: recent ? t().quickInput.commands.recentlyUsed : undefined,
      kbd: keybinding ? formatKeybinding(keybinding, platform) : undefined,
      run: () => void executeCommand(command.id)
    }
  }

  if (!text.trim()) {
    const recent = commands
      .filter((c) => recentRank.has(c.id))
      .sort((a, b) => recentRank.get(a.id)! - recentRank.get(b.id)!)
    const rest = commands.filter((c) => !recentRank.has(c.id)).sort(byName)
    return { items: [...recent.map((c) => toItem(c, [], true)), ...rest.map((c) => toItem(c, [], false))] }
  }

  const scored: { command: Command; matches: number[]; score: number }[] = []
  for (const command of commands) {
    const result = fuzzyMatch(text, fullText(command))
    if (result) scored.push({ command, matches: result.matches, score: result.score })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (recentRank.get(a.command.id) ?? Infinity) - (recentRank.get(b.command.id) ?? Infinity) ||
      byName(a.command, b.command)
  )
  return {
    // The "recently used" tag only shows with an empty query.
    items: scored.map((s) => toItem(s.command, s.matches, false)),
    message: t().quickInput.commands.none
  }
}

// ---------- Files ----------

const FILES_QUERY_LIMIT = 150
const FILES_EMPTY_LIMIT = 200

export interface FilesContext {
  root: string | null
  /** null while loading. */
  files: { list: { files: string[]; truncated: boolean } } | { error: string } | null
  /** Absolute paths of the open file tabs. */
  openPaths: string[]
  /** MRU (absolute), most recent first. */
  recent: string[]
  /** Picking the file does this instead of opening it ("Compare with…" picker); the typed position is ignored. */
  onPick?: (path: string) => void
}

function fileLabel(path: string, matches: number[]): ReactNode {
  const slash = path.lastIndexOf('/')
  return pathLabel(path.slice(slash + 1), slash > 0 ? path.slice(0, slash) : undefined, new Set(matches), slash + 1)
}

export function buildFileList(text: string, ctx: FilesContext): QuickList {
  const { root, files } = ctx
  const m = t().quickInput.files
  if (!root) return { items: [], message: m.openFolder }
  if (!files) return { items: [], message: m.loading }
  if ('error' in files) return { items: [], message: files.error }

  const { list } = files
  const query = parseFileQuery(text)
  const reveal: Omit<Reveal, 'tabId'> | undefined = query.line ? toReveal(query.line, query.column) : undefined
  const position = query.line ? (query.column ? m.lineColumn(query.line, query.column) : m.line(query.line)) : undefined
  const hint = list.truncated ? m.truncated : undefined

  const toItem = (file: QuickFile, matches: number[]): QuickItem => ({
    key: file.rel,
    fileIcon: { name: file.rel },
    label: fileLabel(file.rel, matches),
    tag: position ?? file.tag,
    run: () => {
      if (ctx.onPick) return ctx.onPick(file.abs)
      if (reveal) recordNavigation()
      openFile(file.abs, reveal)
      // Without a position, the already active file does not get editor focus by itself (only on mount/reveal).
      if (!reveal) focusEditor()
    }
  })

  if (query.text) {
    const ranked = rankPaths(query.text, list.files, FILES_QUERY_LIMIT)
    return {
      items: ranked.map((r) => toItem({ rel: r.path, abs: toAbs(root, r.path) }, r.matches)),
      message: m.none,
      hint
    }
  }

  const empty = emptyQueryFiles(
    { root, files: list.files, truncated: list.truncated, openPaths: ctx.openPaths, recent: ctx.recent },
    FILES_EMPTY_LIMIT
  )
  return { items: empty.map((f) => toItem(f, [])), message: m.empty, hint }
}

// ---------- Themes ----------

/** Theme picker: `current` is the configured one (marked "current"); navigating the list previews. */
export function buildThemeList(text: string, current: string): QuickList {
  // Without a query keeps the registry order; with a query, the best match first.
  const items = rankByLabel(THEMES, text, (theme) => theme.name, { sort: true }).map(
    ({ entry: theme, matches }): QuickItem => ({
      key: theme.name,
      icon: 'codicon-symbol-color',
      label: highlight(theme.name, new Set(matches), 0),
      tag:
        theme.name === current
          ? t().quickInput.current
          : theme.kind === 'dark'
            ? t().quickInput.themes.dark
            : t().quickInput.themes.light,
      run: () => void selectTheme(theme.name)
    })
  )
  return { items, message: t().quickInput.themes.none }
}

// ---------- Terminal profiles ----------

/**
 * Shell profile picker: "Default" (what "+" creates) and one item per `terminal.profiles` profile. Only the name goes
 * to main.
 */
export function buildTerminalProfileList(
  text: string,
  profiles: Record<string, TerminalProfile>,
  defaultProfile: string
): QuickList {
  const m = t().quickInput.profiles
  const entries: { name: string | null; label: string }[] = [
    { name: null, label: m.default },
    ...Object.keys(profiles).map((name) => ({ name, label: name }))
  ]
  // Without a query keeps the order (Default first); with a query, the best match first.
  const ranked = rankByLabel(entries, text, (e) => e.label, { sort: true })
  const items: QuickItem[] = ranked.map(({ entry, matches }) => ({
    key: entry.name ?? '',
    icon: 'codicon-terminal',
    label: highlight(entry.label, new Set(matches), 0),
    tag:
      entry.name === null
        ? defaultProfile in profiles
          ? m.profile(defaultProfile)
          : m.systemShell
        : entry.name === defaultProfile
          ? m.isDefault
          : undefined,
    run: () => void createTerminal({ profile: entry.name })
  }))
  return { items, message: m.none }
}

// ---------- Language and encoding (status bar) ----------

/** Language mode picker: "Detect from extension" (clears the choice), "Text" and the language-data modes. */
export function buildLanguageList(text: string, ctx: { path: string | null; chosen: string | null }): QuickList {
  if (!ctx.path) return { items: [], message: t().quickInput.language.openFile }
  const items: QuickItem[] = rankByLabel(languageEntries(ctx.path, ctx.chosen), text, (e) => e.label, {
    sort: true
  }).map(({ entry, matches }) => ({
    key: entry.name ?? '__auto__',
    icon: entry.name === PLAIN_TEXT ? 'codicon-file' : entry.name === null ? 'codicon-wand' : 'codicon-code',
    label: highlight(entry.label, new Set(matches), 0),
    tag: entry.current ? t().quickInput.current : undefined,
    run: () => {
      const tab = activeLoadedFileTab()
      if (tab) void setTabLanguage(tab.id, entry.name)
    }
  }))
  return { items, message: t().quickInput.language.none }
}

/** Encoding picker: two sections ("Reopen with…" and "Save with…") with the same encodings. */
export function buildEncodingList(text: string, ctx: { current: TextEncoding | null; dirty: boolean }): QuickList {
  const m = t().quickInput.encoding
  if (!ctx.current) return { items: [], message: m.openFile }
  // Without sorting by score: the sections must stay contiguous for the headers.
  const items: QuickItem[] = rankByLabel(encodingEntries(ctx.current, ctx.dirty), text, (e) => e.label, {
    sort: false
  }).map(({ entry, matches }) => ({
    key: `${entry.action}:${entry.encoding}`,
    icon: entry.action === 'reopen' ? 'codicon-refresh' : 'codicon-save',
    group: entry.action === 'reopen' ? m.reopen : m.save,
    label: highlight(entry.label, new Set(matches), 0),
    tag: entry.tag,
    run: () => {
      const tab = activeLoadedFileTab()
      if (!tab) return
      if (entry.action === 'reopen') void reopenWithEncoding(tab.id, entry.encoding)
      else void saveWithEncoding(tab.id, entry.encoding)
    }
  }))
  return { items, message: m.none }
}

// ---------- Recent folders ----------

/**
 * Recent folders picker (without the current one): fuzzy filter on the whole path; Enter opens through the same flow as
 * "Open Folder".
 */
export function buildRecentList(text: string, folders: RecentFolder[], current: string | null): QuickList {
  const ranked = rankRecentFolders(text, folders, current, window.api.platform)
  const items: QuickItem[] = ranked.map((f) => ({
    key: f.path,
    fileIcon: { name: f.name, folder: true },
    label: pathLabel(
      f.name,
      f.nameStart > 0 ? f.path.slice(0, f.nameStart - 1) : undefined,
      new Set(f.matches),
      f.nameStart
    ),
    run: () => void openWorkspace(f.path)
  }))
  const available = folders.some((f) => f.path !== current)
  return { items, message: available ? t().quickInput.recent.none : t().quickInput.recent.empty }
}

// ---------- Go to line ----------

export interface LineContext {
  /** Path of the active file tab. */
  path: string | null
  cursor: { line: number; column: number } | null
}

export function buildLineList(text: string, ctx: LineContext): QuickList {
  const { path } = ctx
  const m = t().quickInput.line
  if (!path) return { items: [], message: m.openFile }
  const parsed = parseLineQuery(text)
  const info = (label: string): QuickList => ({ items: [{ key: 'info', label, disabled: true, run: () => {} }] })

  if (parsed.status === 'empty') {
    return info(ctx.cursor ? m.promptAt(ctx.cursor.line, ctx.cursor.column) : m.prompt)
  }
  if (parsed.status === 'invalid') return info(m.invalid)

  const { line, column } = parsed
  const label = column ? m.goToColumn(line, column) : m.goTo(line)
  return {
    items: [
      {
        key: 'go',
        label,
        run: () => {
          recordNavigation()
          openFile(path, toReveal(line, column))
        }
      }
    ]
  }
}

// ---------- Symbols (@ file, # workspace) ----------

export interface SymbolsContext {
  /** Active file (`@`). */
  path: string | null
  /** There is a language server ready for the file (`@`) or some in the window (`#`). */
  ready: boolean
  /** `null` while loading. */
  loaded: SymbolsLoaded | null
  root: string | null
}

function symbolItem(symbol: LspSymbol, index: number, matches: number[], dir?: string): QuickItem {
  const { start } = symbol.location.range
  const set = new Set(matches)
  return {
    key: `${index}:${symbol.location.path}:${start.line}:${start.character}`,
    icon: iconForSymbolKind(symbol.kind).icon,
    label: pathLabel(symbol.name, [symbol.containerName, dir], set, 0, false),
    run: () => void revealSymbol(symbol)
  }
}

/** `@`: symbols of the active file, in document order (or by match with what was typed). */
export function buildSymbolList(text: string, ctx: SymbolsContext): QuickList {
  const m = t().quickInput.symbols
  if (!ctx.path) return { items: [], message: m.openFile }
  if (!ctx.ready) return { items: [], message: m.noServer }
  if (!ctx.loaded) return { items: [], message: m.loading }
  if ('error' in ctx.loaded) return { items: [], message: ctx.loaded.error }
  const ranked = rankSymbols(text, ctx.loaded.symbols, { filter: true })
  return {
    items: ranked.map((r, i) => symbolItem(r.symbol, i, r.matches)),
    message: ctx.loaded.symbols.length === 0 ? m.emptyFile : m.none
  }
}

/** `#`: symbols of the whole workspace; the search is the server's, the highlight is ours. */
export function buildWorkspaceSymbolList(text: string, ctx: SymbolsContext): QuickList {
  const m = t().quickInput.symbols
  if (!ctx.root) return { items: [], message: m.openFolder }
  if (!ctx.ready) return { items: [], message: m.noServers }
  if (!text) return { items: [], message: m.typeName }
  if (!ctx.loaded) return { items: [], message: m.searching }
  if ('error' in ctx.loaded) return { items: [], message: ctx.loaded.error }
  const ranked = rankSymbols(text, ctx.loaded.symbols, { filter: false })
  return {
    items: ranked.map((r, i) =>
      symbolItem(r.symbol, i, r.matches, ctx.root ? toRel(ctx.root, r.symbol.location.path) : undefined)
    ),
    message: m.none
  }
}

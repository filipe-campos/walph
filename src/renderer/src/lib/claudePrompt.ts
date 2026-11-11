// Pure logic of the Claude prompt box: `/` menu, history (↑/↓) and draft.
import { t, type Messages } from '@shared/i18n'
import type { ClaudeSlashCommand } from '@shared/types'
import { fuzzyMatch } from './fuzzy'

export interface ActiveSlash {
  /** Position of the slash. */
  start: number
  /** End of the token (up to the next space after the cursor). */
  end: number
  /** The whole token after the slash (also what is after the cursor). */
  query: string
}

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch)

/**
 * `/command` token under the cursor, in any position (start of the text or after a space, as in `/loop 15m /other`);
 * `null` otherwise. A slash in the middle of a word (`src/a`, `http://x`) does not count.
 */
export function activeSlash(text: string, caret: number): ActiveSlash | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i]
    if (isSpace(ch)) return null
    if (ch === '/') {
      if (i > 0 && !isSpace(text[i - 1])) return null
      let end = caret
      while (end < text.length && !isSpace(text[end])) end++
      return { start: i, end, query: text.slice(i + 1, end) }
    }
  }
  return null
}

/** Query of the `/` menu (without the slash) while the cursor is on a `/xxx` token; `null` otherwise. */
export function slashQuery(text: string, caret: number): string | null {
  return activeSlash(text, caret)?.query ?? null
}

const LOCAL_SLASH_NAMES = ['login', 'logout', 'usage'] as const

/** Commands that Walph handles without sending to the CLI (in SDK mode it has no screen for them). */
function localSlashCommands(descriptions: Messages['claude']['prompt']['localCommands']): ClaudeSlashCommand[] {
  return LOCAL_SLASH_NAMES.map((name) => ({
    name,
    description: descriptions[name],
    argumentHint: '',
    scope: 'builtin'
  }))
}

/** The CLI list with the local commands (the translated description wins over the CLI one with the same name). */
export function withLocalCommands(
  commands: readonly ClaudeSlashCommand[],
  descriptions: Messages['claude']['prompt']['localCommands'] = t().claude.prompt.localCommands
): ClaudeSlashCommand[] {
  const locals = localSlashCommands(descriptions)
  const local = new Map(locals.map((c) => [c.name, c]))
  const merged = commands.map((c) => local.get(c.name) ?? c)
  const present = new Set(commands.map((c) => c.name))
  return [...merged, ...locals.filter((c) => !present.has(c.name))]
}

/** Commands that only change the Walph screen: `/login`, `/logout`, `/usage` (and `/clear`, `/mcp` handled apart). */
export function localCommandOf(text: string): 'login' | 'logout' | 'usage' | null {
  const t = text.trim()
  return t === '/login' || t === '/logout' || t === '/usage' ? (t.slice(1) as 'login' | 'logout' | 'usage') : null
}

/** Commands that match the query, best first; an empty query = all in alphabetical order. */
export function filterSlash(commands: readonly ClaudeSlashCommand[], query: string, limit = 50): ClaudeSlashCommand[] {
  if (!query) return [...commands].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
  const scored: { cmd: ClaudeSlashCommand; score: number }[] = []
  for (const cmd of commands) {
    const hit = fuzzyMatch(query, cmd.name)
    if (hit) scored.push({ cmd, score: hit.score })
  }
  scored.sort((a, b) => b.score - a.score || a.cmd.name.length - b.cmd.name.length)
  return scored.slice(0, limit).map((s) => s.cmd)
}

type SlashScope = ClaudeSlashCommand['scope']

export interface SlashGroup {
  scope: SlashScope
  label: string
  items: ClaudeSlashCommand[]
}

const SLASH_SCOPES: readonly SlashScope[] = ['project', 'user', 'builtin']

function slashGroupLabel(scope: SlashScope): string {
  return scope === 'builtin' ? 'Claude Code' : t().claude.prompt.groups[scope]
}

/**
 * Splits into Project, Personal and Claude Code (in that order, keeping the item order); empty groups disappear. The
 * limit applies PER group: cutting before grouping would hide project commands behind dozens of built-ins.
 */
export function groupSlash(commands: readonly ClaudeSlashCommand[], perGroup = Infinity): SlashGroup[] {
  return SLASH_SCOPES.map((scope) => ({
    scope,
    label: slashGroupLabel(scope),
    items: commands.filter((c) => c.scope === scope).slice(0, perGroup)
  })).filter((g) => g.items.length > 0)
}

/** Text that the chosen command leaves in the box (with a space for the arguments). */
export function slashText(command: ClaudeSlashCommand): string {
  return `/${command.name} `
}

/**
 * Replaces only the `/xxx` token being edited with the chosen command (the rest of the text stays); returns text and
 * cursor.
 */
export function applySlash(
  text: string,
  slash: ActiveSlash,
  command: ClaudeSlashCommand
): { text: string; caret: number } {
  const name = `/${command.name}`
  // There is already a space after the token: reuse it instead of duplicating.
  const spaced = isSpace(text[slash.end]) && slash.end < text.length
  const next = text.slice(0, slash.start) + name + (spaced ? '' : ' ') + text.slice(slash.end)
  return { text: next, caret: slash.start + name.length + 1 }
}

/** Is the text exactly `/name` (without arguments) and `name` a known command? Returns the command. */
export function exactSlashCommand(text: string, commands: readonly ClaudeSlashCommand[]): ClaudeSlashCommand | null {
  const match = /^\/(\S+)$/.exec(text.trim())
  return match ? (commands.find((c) => c.name === match[1]) ?? null) : null
}

/**
 * Kind of highlighted span in the prompt and in sent messages. New highlights (e.g. `@file`) go here and get
 * the `claude-seg-<kind>` class in CSS; the input box and the chat use the same split.
 */
type PromptSegmentKind = 'text' | 'command'

export interface PromptSegment {
  text: string
  kind: PromptSegmentKind
}

/**
 * Splits the text into spans, marking the `/command` tokens. The first token always counts (that is how the CLI
 * interprets it); in the middle of the text, only known command names: paths like `/tmp` or slashes inside words
 * (`src/a`) stay as text. The concatenation of the spans is always the original text (the input box layer
 * depends on it to align with the cursor).
 */
export function promptSegments(text: string, commands: readonly ClaudeSlashCommand[]): PromptSegment[] {
  const names = new Set(commands.map((c) => c.name))
  const segments: PromptSegment[] = []
  let last = 0
  for (const match of text.matchAll(/(^|\s)\/([A-Za-z][\w:.-]*)(?=\s|$)/g)) {
    const [, lead = '', name = ''] = match
    const start = match.index + lead.length
    const first = text.slice(0, start).trim() === ''
    if (!first && !names.has(name)) continue
    if (start > last) segments.push({ text: text.slice(last, start), kind: 'text' })
    segments.push({ text: '/' + name, kind: 'command' })
    last = start + name.length + 1
  }
  if (last < text.length) segments.push({ text: text.slice(last), kind: 'text' })
  return segments
}

const HISTORY_LIMIT = 100

/** Appends to the history (from oldest to newest); empty and consecutive repeats do not go in. */
export function pushHistory(history: readonly string[], text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed || history[history.length - 1] === trimmed) return [...history]
  const next = [...history, trimmed]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

/** Navigation position: `index` null = editing the draft; `draft` keeps what was typed on entering. */
export interface HistoryNav {
  index: number | null
  draft: string
}

export const HISTORY_IDLE: HistoryNav = { index: null, draft: '' }

/** ↑: previous message. `null` = there is no history (the key follows the normal behavior). */
export function historyUp(
  history: readonly string[],
  nav: HistoryNav,
  current: string
): { nav: HistoryNav; text: string } | null {
  const newest = history.at(-1)
  if (newest === undefined) return null
  if (nav.index === null) return { nav: { index: history.length - 1, draft: current }, text: newest }
  const index = Math.max(0, Math.min(nav.index, history.length) - 1)
  return { nav: { index, draft: nav.draft }, text: history[index] ?? newest }
}

/** ↓: next message; going past the last returns to the draft. `null` = it was not navigating. */
export function historyDown(history: readonly string[], nav: HistoryNav): { nav: HistoryNav; text: string } | null {
  if (nav.index === null) return null
  const index = nav.index + 1
  const text = history[index]
  if (text === undefined) return { nav: { index: null, draft: '' }, text: nav.draft }
  return { nav: { index, draft: nav.draft }, text }
}

/**
 * ↑/↓ only become history when the cursor is on the first/last line (else they move the cursor in the text). With
 * empty text it always applies.
 */
export function canRecall(direction: 'up' | 'down', text: string, caret: number, selectionEnd: number): boolean {
  if (caret !== selectionEnd) return false
  if (direction === 'up') return !text.slice(0, caret).includes('\n')
  return !text.slice(caret).includes('\n')
}

/**
 * Should the `/` menu open for this token? At the start of the text always; in the middle (`see /tmp`) only if the
 * token
 * is a prefix of some command name (case-insensitive): typed paths and URLs neither open the menu nor hijack Enter.
 */
export function slashMenuApplies(slash: ActiveSlash, commands: readonly ClaudeSlashCommand[]): boolean {
  if (slash.start === 0) return true
  const q = slash.query.toLowerCase()
  return commands.some((c) => c.name.toLowerCase().startsWith(q))
}

/**
 * Does Enter complete the marked command (instead of sending)? At the start of the text always (the usual behavior); in
 * the middle only if the marked one is a prefix different from what was already typed, else Enter sends the message.
 */
export function enterCompletesSlash(slash: ActiveSlash, command: ClaudeSlashCommand): boolean {
  if (slash.start === 0) return true
  const name = command.name.toLowerCase()
  const q = slash.query.toLowerCase()
  return name !== q && name.startsWith(q)
}

/**
 * Inserts `value` at the selection (textarea `start`/`end`; absent = end of the text), separated by a space from what
 * comes before. Returns the new text and the cursor position right after the inserted value.
 */
export function insertAtCaret(
  text: string,
  value: string,
  start?: number | null,
  end?: number | null
): { text: string; caret: number } {
  const at = Math.min(start ?? text.length, text.length)
  const to = Math.min(end ?? at, text.length)
  const glue = at > 0 && !/\s$/.test(text.slice(0, at)) ? ' ' : ''
  return { text: text.slice(0, at) + glue + value + text.slice(to), caret: at + glue.length + value.length }
}

export interface PromptKey {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
}

export interface PromptKeyContext {
  text: string
  selectionStart: number
  selectionEnd: number
  commands: readonly ClaudeSlashCommand[]
  /** Menu shown: `dismissible` = Esc closes it (the `@` menu always, the `/` one only with items). */
  menu: { kind: 'mention' | 'slash'; hasItems: boolean; dismissible: boolean } | null
  /** `/xxx` token under the cursor and the command marked in the menu. */
  slashToken: ActiveSlash | null
  marked: ClaudeSlashCommand | undefined
  hasGhost: boolean
  working: boolean
}

export type PromptKeyAction =
  | { type: 'none' }
  | { type: 'submit' }
  | { type: 'acceptMenu' }
  | { type: 'acceptSuggestion' }
  | { type: 'dismissMenu' }
  | { type: 'interrupt' }
  | { type: 'focusEditor' }
  | { type: 'cycleMode' }
  | { type: 'history'; direction: 'up' | 'down' }

const plain = (e: PromptKey): boolean => !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey

/**
 * What a key does in the prompt box. The menu navigation (↑/↓/PageUp/PageDown) belongs to `useActiveDescendant`,
 * which runs first. `none` lets the browser act; `history` only consumes the key if there is a message to recall.
 */
export function promptKeyAction(e: PromptKey, ctx: PromptKeyContext): PromptKeyAction {
  if (e.isComposing) return { type: 'none' }
  if (ctx.menu?.hasItems) {
    // Enter with the command already written in full (`/clear`) submits directly; partial Tab and Enter complete.
    const sendInstead =
      ctx.menu.kind === 'slash' && !!ctx.slashToken && !!ctx.marked && !enterCompletesSlash(ctx.slashToken, ctx.marked)
    if (e.key === 'Enter' && !e.shiftKey && (sendInstead || exactSlashCommand(ctx.text, ctx.commands)))
      return { type: 'submit' }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) return { type: 'acceptMenu' }
  }
  if (e.key === 'Tab' && plain(e) && ctx.hasGhost) return { type: 'acceptSuggestion' }
  if (e.key === 'Escape') {
    if (ctx.menu?.dismissible) return { type: 'dismissMenu' }
    return ctx.working ? { type: 'interrupt' } : { type: 'focusEditor' }
  }
  if (e.key === 'Tab' && e.shiftKey) return { type: 'cycleMode' }
  if (e.key === 'Enter' && !e.shiftKey) return { type: 'submit' }
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && plain(e)) {
    const direction = e.key === 'ArrowUp' ? 'up' : 'down'
    if (canRecall(direction, ctx.text, ctx.selectionStart, ctx.selectionEnd)) return { type: 'history', direction }
  }
  return { type: 'none' }
}

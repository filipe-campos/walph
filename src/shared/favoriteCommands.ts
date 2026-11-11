// Favorite commands of the Claude panel (design system "Commands favoritos"): icons above the input that run a
// command from `.claude/commands` with one click. They live in the app, per folder (`claude/favoriteCommands.ts` in
// main), never in the repository. This module is the contract: the accepted icons and the validation, used by main
// (untrusted input) and by the renderer (icon grid).

import { hasControl } from './controlChars'
import { t } from './i18n'

/** Design system icon grid, in the order they appear in the picker. */
export const FAVORITE_COMMAND_ICONS = [
  'bolt',
  'play',
  'check',
  'flask',
  'bug',
  'rocket',
  'diff',
  'branch',
  'terminal',
  'spark',
  'search',
  'plan',
  'pencil',
  'book',
  'database',
  'box',
  'shield',
  'restart',
  'logs',
  'globe',
  'star',
  'gear',
  'brain',
  'layers',
  'agent',
  'files',
  'file',
  'filePlus',
  'folder',
  'command',
  'commit',
  'eye',
  'external',
  'markdown',
  'question',
  'hand',
  'mic',
  'clip',
  'split',
  'send',
  'slash',
  'arrowUp',
  'arrowDown',
  'stop'
] as const

export type FavoriteCommandIcon = (typeof FAVORITE_COMMAND_ICONS)[number]

export interface ClaudeFavoriteCommand {
  /** Command name without the slash (`review`, `folder:name`). */
  name: string
  icon: FavoriteCommandIcon
}

export const MAX_FAVORITE_COMMANDS = 24

/**
 * Name of each icon in the current language (screen reader and picker tooltip). Getters: the text is resolved on every
 * read, so changing the language takes effect without recreating the object.
 */
export const FAVORITE_COMMAND_ICON_LABELS: Readonly<Record<FavoriteCommandIcon, string>> = Object.defineProperties(
  {} as Record<FavoriteCommandIcon, string>,
  Object.fromEntries(
    FAVORITE_COMMAND_ICONS.map((icon) => [
      icon,
      { enumerable: true, get: (): string => t().claudeHost.favorites.icons[icon] }
    ])
  )
)

const ICONS = new Set<string>(FAVORITE_COMMAND_ICONS)
/**
 * Same rule as the names the app lists (`main/claude/commandFiles.ts`: up to 100 characters, no spaces; accents and
 * symbols are allowed): no control characters or line separators, so `/${name}` is always a single line.
 */
const MAX_NAME = 100

function isFavoriteCommandIcon(value: unknown): value is FavoriteCommandIcon {
  return typeof value === 'string' && ICONS.has(value)
}

function isFavoriteCommandName(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME && !/\s/.test(value) && !hasControl(value)
  )
}

/**
 * Sanitized list: drops malformed items, repeated names (the first one stays) and whatever exceeds the cap. For disk
 * content (tolerant); IPC uses `parseFavoriteCommands`, which rejects instead of dropping.
 */
export function sanitizeFavoriteCommands(value: unknown): ClaudeFavoriteCommand[] {
  if (!Array.isArray(value)) return []
  const out: ClaudeFavoriteCommand[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (out.length >= MAX_FAVORITE_COMMANDS) break
    if (typeof item !== 'object' || item === null) continue
    const { name, icon } = item as Record<string, unknown>
    if (!isFavoriteCommandName(name) || !isFavoriteCommandIcon(icon) || seen.has(name)) continue
    seen.add(name)
    out.push({ name, icon })
  }
  return out
}

/** Validates the list coming from the renderer (untrusted): any invalid item rejects the whole request. */
export function parseFavoriteCommands(value: unknown): ClaudeFavoriteCommand[] {
  const bad = (): never => {
    throw new Error(t().claudeHost.favorites.invalidList)
  }
  if (!Array.isArray(value) || value.length > MAX_FAVORITE_COMMANDS) return bad()
  const clean = sanitizeFavoriteCommands(value)
  if (clean.length !== value.length) bad()
  return clean
}

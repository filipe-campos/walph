// Registry of the built-in themes. Third-party themes are in the backlog.
import { walphDark } from './walphDark'
import { walphLight } from './walphLight'
import type { Theme } from './types'

export type { Theme } from './types'

export const THEMES: readonly Theme[] = [walphDark, walphLight]

export const DEFAULT_THEME: Theme = walphDark

export function isKnownTheme(name: string): boolean {
  return THEMES.some((t) => t.name === name)
}

/**
 * Theme by name; an unknown name falls back to Walph Dark. Pure on purpose (called on every render/application):
 * whoever reads the setting warns the user once, with `isKnownTheme`.
 */
export function findTheme(name: string): Theme {
  return THEMES.find((t) => t.name === name) ?? DEFAULT_THEME
}

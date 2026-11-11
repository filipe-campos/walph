// Last configured theme, kept in localStorage so the first paint already comes out in the right theme (the settings
// arrive from main asynchronously; without this, light theme users would see a dark flash on opening).
// `public/themeBoot.js` reads `walph.themeColors.v2` before the CSS and the modules: the format below is a contract
// with it.
import { DEFAULT_THEME } from './index'
import { THEME_TOKENS, type Theme } from './types'

const KEY = 'walph.theme'
// v2: tokens renamed to the design system ones (a v1 cache would paint variables nobody reads).
const COLORS_KEY = 'walph.themeColors.v2'

export function loadCachedTheme(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_THEME.name
  } catch {
    return DEFAULT_THEME.name
  }
}

export function saveCachedTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme.name)
    // Only the UI token colors and the `color-scheme`: what the first paint needs.
    const colors: Record<string, string> = {}
    for (const token of THEME_TOKENS) colors[token] = theme.colors[token]
    localStorage.setItem(COLORS_KEY, JSON.stringify({ kind: theme.kind, colors }))
  } catch {
    // no localStorage: only the first paint loses the theme
  }
}

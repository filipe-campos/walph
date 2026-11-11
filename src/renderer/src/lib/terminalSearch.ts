// Colors of the terminal search decorations. The addon only accepts `#RRGGBB` (no var(--token) or rgba), so they
// come from the terminal theme palette, falling back to neutral colors.
import type { ITheme } from '@xterm/xterm'

const HEX = /^#[0-9a-f]{6}$/i

function hex(value: string | undefined, fallback: string): string {
  return value && HEX.test(value) ? value : fallback
}

export interface SearchDecorationColors {
  matchBackground: string
  matchOverviewRuler: string
  activeMatchBackground: string
  activeMatchBorder: string
  activeMatchColorOverviewRuler: string
}

export function searchDecorations(theme: ITheme): SearchDecorationColors {
  const selection = hex(theme.selectionBackground, '#264f78')
  const accent = hex(theme.brightYellow ?? theme.yellow, '#d7ba7d')
  return {
    matchBackground: selection,
    matchOverviewRuler: hex(theme.blue, '#3b8eea'),
    // The current match gets the highlight border; the others only the background.
    activeMatchBackground: selection,
    activeMatchBorder: accent,
    activeMatchColorOverviewRuler: accent
  }
}

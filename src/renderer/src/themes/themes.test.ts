import { describe, expect, it } from 'vitest'
import designTokensJson from '../../../../docs/design-system/tokens.json?raw'
import tokensCss from '../styles/tokens.css?raw'
import { DEFAULT_THEME, findTheme, isKnownTheme, THEMES } from './index'
import { THEME_TOKENS, type Theme, type ThemeToken } from './types'
import { walphDark } from './walphDark'
import { walphLight } from './walphLight'

const luminance = (hex: string): number => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

describe('theme registry', () => {
  it('findTheme returns the theme by name', () => {
    expect(findTheme('Walph Light')).toBe(walphLight)
    expect(findTheme('Walph Dark')).toBe(walphDark)
  })

  it('an unknown, empty or differently cased name falls back to Walph Dark', () => {
    expect(findTheme('Does Not Exist')).toBe(DEFAULT_THEME)
    expect(findTheme('')).toBe(DEFAULT_THEME)
    expect(findTheme('walph light')).toBe(DEFAULT_THEME)
    expect(DEFAULT_THEME.name).toBe('Walph Dark')
  })

  it('isKnownTheme tells registered themes apart', () => {
    expect(isKnownTheme('Walph Light')).toBe(true)
    expect(isKnownTheme('Other')).toBe(false)
  })

  it('names are unique', () => {
    const names = THEMES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe.each(THEMES.map((t) => [t.name, t] as const))('theme %s', (_name, theme) => {
  it('defines every color token, with no empty or extra value', () => {
    expect(Object.keys(theme.colors).sort()).toEqual([...THEME_TOKENS].sort())
    for (const token of THEME_TOKENS) expect(theme.colors[token], token).toMatch(/\S/)
  })

  it('has a terminal palette with background, foreground and the 16 ANSI colors', () => {
    const t = theme.terminal
    expect(t.background).toBeTruthy()
    expect(t.foreground).toBeTruthy()
    for (const c of [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite'
    ] as const) {
      expect(t[c], c).toBeTruthy()
    }
  })

  it('the terminal background matches the editor/terminal layer (bg-100)', () => {
    expect(theme.terminal.background?.toLowerCase()).toBe(theme.colors['bg-100'].toLowerCase())
  })

  it('the terminal cursor is the accent (design system terminal-cursor)', () => {
    expect(theme.terminal.cursor?.toLowerCase()).toBe(theme.colors.accent.toLowerCase())
  })

  it('the bg-000…bg-400 layers are all distinct (hover and selection must show)', () => {
    const layers = (['bg-000', 'bg-100', 'bg-200', 'bg-300', 'bg-400'] as const).map((t) =>
      theme.colors[t].toLowerCase()
    )
    expect(new Set(layers).size).toBe(layers.length)
  })

  it('has an editor extension', () => {
    expect(theme.editor).toBeTruthy()
  })
})

describe('Walph Dark follows the design system', () => {
  it('uses the reference values of tokens.json', () => {
    expect(walphDark.colors['bg-000']).toBe('#0a090f')
    expect(walphDark.colors['bg-100']).toBe('#100e17')
    expect(walphDark.colors.accent).toBe('#4da6ff')
    expect(walphDark.colors.ink).toBe('#eeebf7')
    expect(walphDark.terminal.magenta).toBe('#b97cff')
    expect(walphDark.terminal.red).toBe(walphDark.colors.danger)
    expect(walphDark.terminal.yellow).toBe(walphDark.colors.warning)
  })

  it('the :root of styles/tokens.css (first paint) repeats the theme values', () => {
    const root = /^:root\s*\{([^}]*)\}/m.exec(tokensCss)?.[1] ?? ''
    const declared = [...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value] as const)
    const themed = declared.filter(([name]) => (THEME_TOKENS as readonly string[]).includes(name))
    expect(themed.length).toBeGreaterThan(0)
    for (const [name, value] of themed) {
      expect(value.replace(/\s+/g, ' ').trim(), name).toBe(walphDark.colors[name as ThemeToken])
    }
  })
})

describe('Walph Light vs Dark', () => {
  it('have the same tokens', () => {
    expect(Object.keys(walphLight.colors).sort()).toEqual(Object.keys(walphDark.colors).sort())
  })

  it('the light one is actually light and the dark one dark (editor, UI and terminal background)', () => {
    expect(walphLight.kind).toBe('light')
    expect(walphDark.kind).toBe('dark')
    expect(luminance(walphLight.colors['bg-100'])).toBeGreaterThan(0.7)
    expect(luminance(walphLight.colors['bg-000'])).toBeGreaterThan(0.7)
    expect(luminance(walphLight.terminal.background!)).toBeGreaterThan(0.7)
    expect(luminance(walphDark.colors['bg-100'])).toBeLessThan(0.3)
    expect(luminance(walphDark.terminal.background!)).toBeLessThan(0.3)
  })
})

describe('design system reference (docs/design-system/tokens.json)', () => {
  const tokens = (
    JSON.parse(designTokensJson) as { color: { tokens: { name: string; value: string; light: string }[] } }
  ).color.tokens
  const byName = new Map(tokens.map((t) => [t.name, t]))

  // `ansi-bright-red` and `terminal-cursor` live in the xterm palette (`brightRed`, `cursor`).
  const themeValue = (theme: Theme, name: string): unknown => {
    if (name === 'terminal-cursor') return theme.terminal.cursor
    const ansi = /^ansi-(bright-)?(\w+)$/.exec(name)
    if (!ansi) return theme.colors[name as ThemeToken]
    const color = ansi[2] ?? ''
    const key = ansi[1] ? `bright${color.charAt(0).toUpperCase()}${color.slice(1)}` : color
    return theme.terminal[key as keyof Theme['terminal']]
  }
  const resolve = (value: string, field: 'value' | 'light'): string => {
    const alias = /^\{(.+)\}$/.exec(value)?.[1]
    const target = alias ? byName.get(alias) : undefined
    return target ? resolve(target[field], field) : value
  }

  it('lists every color token of the themes', () => {
    expect(THEME_TOKENS.filter((name) => !byName.has(name))).toEqual([])
  })

  it('the dark value matches Walph Dark and the light one Walph Light', () => {
    for (const token of tokens) {
      expect(resolve(token.value, 'value'), token.name).toBe(themeValue(walphDark, token.name))
      expect(resolve(token.light, 'light'), token.name).toBe(themeValue(walphLight, token.name))
    }
  })
})

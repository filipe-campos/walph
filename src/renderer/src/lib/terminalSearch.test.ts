import { describe, expect, it } from 'vitest'
import { searchDecorations } from './terminalSearch'
import { THEMES } from '../themes'

const HEX = /^#[0-9a-f]{6}$/i

describe('searchDecorations', () => {
  it('only returns #RRGGBB, in all themes', () => {
    for (const theme of THEMES)
      for (const color of Object.values(searchDecorations(theme.terminal))) expect(color).toMatch(HEX)
  })

  it('the built-in themes use their own selection, never the fallback', () => {
    for (const theme of THEMES)
      expect(searchDecorations(theme.terminal).matchBackground, theme.name).toBe(theme.terminal.selectionBackground)
  })

  it('falls back to neutral colors when the theme does not define one or uses another format', () => {
    const colors = searchDecorations({ selectionBackground: 'rgba(1,2,3,0.5)', blue: 'blue' })
    for (const color of Object.values(colors)) expect(color).toMatch(HEX)
  })

  it('uses the theme selection', () => {
    expect(searchDecorations({ selectionBackground: '#112233' }).matchBackground).toBe('#112233')
  })
})

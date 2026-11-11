import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const { startAppearance } = await import('./appearance')
const { getEditorConfig, getEditorTheme } = await import('./components/editor/documentState')
const { findTheme } = await import('./themes')

const style = () => document.documentElement.style
const settings = (patch: Record<string, unknown>): void =>
  useStore.setState((s) => ({ settings: { ...s.settings, ...patch } }))
const cached = (): string | null => localStorage.getItem('walph.theme')

let stop: () => void

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  resetStore()
})

afterEach(() => stop?.())

describe('startAppearance', () => {
  it('applies the theme, the fonts and the editor configuration right on start', () => {
    stop = startAppearance()
    const dark = findTheme('Walph Dark')
    expect(style().getPropertyValue('--bg-000')).toBe(dark.colors['bg-000'])
    expect(style().colorScheme).toBe('dark')
    expect(style().getPropertyValue('--editor-font-size')).toBe('13px')
    expect(style().getPropertyValue('--ui-font-size')).toMatch(/px$/)
    expect(style().getPropertyValue('--font-sans')).toContain('Geist')
    expect(style().getPropertyValue('--fi-cut')).not.toBe('')
    expect(getEditorTheme()).toBe(dark.editor)
    expect(getEditorConfig()).toEqual({
      tabSize: 2,
      wordWrap: false,
      lineNumbers: true,
      minimap: true,
      renderWhitespace: 'selection',
      rulers: [],
      stickyScroll: 5,
      codeLens: true
    })
  })

  it('stores the configured theme in the first paint cache', () => {
    stop = startAppearance()
    expect(cached()).toBe('Walph Dark')
    expect(JSON.parse(localStorage.getItem('walph.themeColors.v2')!).kind).toBe('dark')
  })

  it('changing the theme reapplies the colors, the scheme, the icon palette and the cache', () => {
    stop = startAppearance()
    settings({ 'workbench.theme': 'Walph Light' })
    const light = findTheme('Walph Light')
    expect(style().getPropertyValue('--bg-000')).toBe(light.colors['bg-000'])
    expect(style().colorScheme).toBe('light')
    expect(getEditorTheme()).toBe(light.editor)
    expect(cached()).toBe('Walph Light')
  })

  it('the preview applies the theme without writing the cache', () => {
    stop = startAppearance()
    useStore.setState({ themePreview: 'Walph Light' })
    expect(style().colorScheme).toBe('light')
    expect(cached()).toBe('Walph Dark')
    useStore.setState({ themePreview: null })
    expect(style().colorScheme).toBe('dark')
  })

  it('an unknown theme name falls back to the default theme', () => {
    settings({ 'workbench.theme': 'Does Not Exist' })
    stop = startAppearance()
    expect(style().colorScheme).toBe('dark')
  })

  it('editor font size and family go to CSS variables', () => {
    stop = startAppearance()
    settings({ 'editor.fontSize': 18, 'editor.fontFamily': 'Fira Code' })
    expect(style().getPropertyValue('--editor-font-size')).toBe('18px')
    expect(style().getPropertyValue('--editor-font-family')).toBe('Fira Code')
  })

  it('the UI font goes to --ui-font-size and --font-sans', () => {
    stop = startAppearance()
    settings({ 'workbench.fontSize': 15, 'workbench.fontFamily': 'Inter' })
    expect(style().getPropertyValue('--ui-font-size')).toBe('15px')
    expect(style().getPropertyValue('--font-sans')).toBe('Inter')
  })

  it('editor options reach CodeMirror converted', () => {
    stop = startAppearance()
    settings({
      'editor.tabSize': 4,
      'editor.wordWrap': 'on',
      'editor.lineNumbers': 'off',
      'editor.minimap': false,
      'editor.renderWhitespace': 'all',
      'editor.rulers': [80, 120],
      'editor.codeLens': false
    })
    expect(getEditorConfig()).toEqual({
      tabSize: 4,
      wordWrap: true,
      lineNumbers: false,
      minimap: false,
      renderWhitespace: 'all',
      rulers: [80, 120],
      stickyScroll: 5,
      codeLens: false
    })
    settings({ 'editor.stickyScroll.maxLineCount': 3 })
    expect(getEditorConfig().stickyScroll).toBe(3)
    settings({ 'editor.stickyScroll.enabled': false })
    expect(getEditorConfig().stickyScroll).toBe(0)
  })

  it('a non-visual change rebuilds neither the variables nor the cache', () => {
    stop = startAppearance()
    style().setProperty('--editor-font-size', 'marker')
    localStorage.removeItem('walph.theme')
    settings({ 'editor.tabSize': 8 })
    expect(style().getPropertyValue('--editor-font-size')).toBe('marker')
    expect(cached()).toBeNull()
  })

  it('after stopping, settings are no longer applied', () => {
    stop = startAppearance()
    stop()
    settings({ 'editor.fontSize': 30 })
    expect(style().getPropertyValue('--editor-font-size')).toBe('13px')
  })
})

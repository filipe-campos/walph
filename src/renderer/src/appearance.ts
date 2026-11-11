// Applies the visual settings (theme and editor) to the document and to CodeMirror. Reacts to the store via
// `subscribe`, outside components; the terminal updates itself in `TerminalView` (the xterms live there).
import { setEditorConfig, setEditorTheme } from './components/editor/documentConfig'
import { remeasureEditor } from './components/editor/groupViews'
import { get, selectThemeName, useStore } from './store'
import { findTheme } from './themes'
import { saveCachedTheme } from './themes/cache'
import { THEME_TOKENS, type Theme } from './themes/types'
import { fileIconVars } from './lib/fileIcons'
import { shallow } from 'zustand/shallow'

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const token of THEME_TOKENS) root.style.setProperty(`--${token}`, theme.colors[token])
  // Scrollbars and native controls follow the theme.
  root.style.colorScheme = theme.kind
  // File icon theme palette (the dark one vanishes on a light background).
  for (const [name, value] of Object.entries(fileIconVars(theme.kind))) root.style.setProperty(name, value)
  setEditorTheme(theme.editor)
}

/** Binds the theme and editor settings to the store. Returns the unsubscribe. */
export function startAppearance(): () => void {
  let themeName: string | null = null
  let persistedTheme: string | null = null
  let fontSize: number | null = null
  let fontFamily: string | null = null
  let uiFontSize: number | null = null
  let uiFontFamily: string | null = null

  const sync = (): void => {
    const state = get()
    const { settings } = state

    const name = selectThemeName(state)
    if (name !== themeName) {
      themeName = name
      applyTheme(findTheme(name))
    }
    // The cache stores only the configured theme, never a preview.
    if (settings['workbench.theme'] !== persistedTheme) {
      persistedTheme = settings['workbench.theme']
      saveCachedTheme(findTheme(persistedTheme))
    }

    // Font via CSS variable: applies to every tab (and to the diff) without touching the CodeMirror states.
    const size = settings['editor.fontSize']
    const family = settings['editor.fontFamily']
    if (size !== fontSize || family !== fontFamily) {
      fontSize = size
      fontFamily = family
      const root = document.documentElement.style
      root.setProperty('--editor-font-size', `${size}px`)
      root.setProperty('--editor-font-family', family)
      remeasureEditor()
    }

    // App font (`workbench.*`): the CSS reads `--font-sans` and `--ui-font-size`.
    const uiSize = settings['workbench.fontSize']
    const uiFamily = settings['workbench.fontFamily']
    if (uiSize !== uiFontSize || uiFamily !== uiFontFamily) {
      uiFontSize = uiSize
      uiFontFamily = uiFamily
      const root = document.documentElement.style
      root.setProperty('--ui-font-size', `${uiSize}px`)
      root.setProperty('--font-sans', uiFamily)
    }

    setEditorConfig({
      tabSize: settings['editor.tabSize'],
      wordWrap: settings['editor.wordWrap'] === 'on',
      lineNumbers: settings['editor.lineNumbers'] === 'on',
      minimap: settings['editor.minimap'],
      renderWhitespace: settings['editor.renderWhitespace'],
      rulers: settings['editor.rulers'],
      stickyScroll: settings['editor.stickyScroll.enabled'] ? settings['editor.stickyScroll.maxLineCount'] : 0,
      codeLens: settings['editor.codeLens']
    })
  }

  sync()
  return useStore.subscribe((s) => [s.settings, s.themePreview] as const, sync, { equalityFn: shallow })
}

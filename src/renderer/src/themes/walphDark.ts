// Walph Dark: the values of the Walph design system (tokens.json), the reference theme of the IDE. Matte surfaces in
// `bg-000`…`bg-400` layers; the neon blue `accent` is the light (primary action, focus, AI). Syntax and terminal share
// the pastel palette, above 5:1 on `bg-100`.
import { walphEditorTheme } from './editorTheme'
import type { Theme } from './types'

const bg100 = '#100e17'
const accent = '#4da6ff'
// Real magenta in the terminal (CLIs expect magenta); it stopped being the accent when the accent became blue.
const ansiMagenta = '#b97cff'

export const walphDark: Theme = {
  name: 'Walph Dark',
  kind: 'dark',
  colors: {
    'bg-000': '#0a090f',
    'bg-100': bg100,
    'bg-200': '#15131e',
    'bg-300': '#1c1928',
    'bg-400': '#252134',
    line: '#2b2739',
    'line-strong': '#6b6389',
    ink: '#eeebf7',
    'ink-muted': '#a49fbb',
    'ink-faint': '#8a84a3',
    accent,
    'accent-strong': '#80c0ff',
    'accent-soft': '#102640',
    'accent-glow': 'rgba(77, 166, 255, 0.35)',
    'accent-2': '#7b7cff',
    'accent-3': '#4fd1ff',
    'on-accent': '#0a090f',
    'focus-ring': accent,
    success: '#3ddcc4',
    'success-soft': '#0f2b2a',
    warning: '#f5c451',
    'warning-soft': '#2e2512',
    danger: '#ff7b5c',
    'danger-soft': '#33160f',
    'syn-keyword': '#c792ff',
    'syn-function': '#7cc4ff',
    'syn-type': '#5ee6d0',
    'syn-string': '#f2c48d',
    'syn-number': '#ff9e7a',
    'syn-constant': '#ffd479',
    'syn-property': '#a9b8ff',
    'syn-tag': '#ff8fb8',
    'syn-variable': '#eeebf7',
    'syn-operator': '#a49fbb',
    'syn-comment': '#8a84a3',
    'syn-parameter': '#e6b8ff',
    // Translucent (≈ #15131e over bg-100): the CodeMirror selection layer sits behind the lines, an opaque
    // background would hide it.
    'editor-line-active': 'rgba(238, 235, 247, 0.025)',
    'editor-selection': 'rgba(77, 166, 255, 0.24)',
    'editor-match': 'rgba(245, 196, 81, 0.22)',
    'editor-gutter': '#8a84a3',
    'editor-gutter-active': '#eeebf7',
    'editor-indent-guide': '#2b2739',
    // Symbol occurrences: write stronger than read, plain text just a veil.
    'editor-highlight-text': 'rgba(238, 235, 247, 0.08)',
    'editor-highlight-read': 'rgba(77, 166, 255, 0.16)',
    'editor-highlight-write': 'rgba(245, 196, 81, 0.2)',
    'editor-inlay-hint': '#8a84a3',
    'editor-inlay-hint-bg': 'rgba(238, 235, 247, 0.06)',
    'diagnostic-error': '#ff7b5c',
    'diagnostic-warning': '#f5c451',
    'diagnostic-info': '#7cc4ff',
    'diagnostic-hint': '#8a84a3',
    'git-modified': '#f5c451',
    'git-added': '#3ddcc4',
    'git-untracked': '#3ddcc4',
    'git-deleted': '#ff7b5c',
    'git-conflict': '#ff8fb8',
    'git-renamed': '#7cc4ff',
    'git-gutter-added': '#3ddcc4',
    'git-gutter-modified': '#f5c451',
    'git-gutter-deleted': '#ff7b5c',
    'diff-inserted': 'rgba(61, 220, 196, 0.14)',
    'diff-deleted': 'rgba(255, 123, 92, 0.14)',
    scrim: 'rgba(5, 4, 9, 0.55)',
    'shadow-pop': '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    'shadow-glow': '0 0 0 1px rgba(77, 166, 255, 0.45), 0 0 18px rgba(77, 166, 255, 0.28)',
    'shadow-neon': '0 10px 36px -12px rgba(77, 166, 255, 0.55)'
  },
  // Design system `ansi-*`: red and yellow are `danger` and `warning`.
  terminal: {
    background: bg100,
    foreground: '#eeebf7',
    cursor: accent,
    cursorAccent: bg100,
    // `editor-selection` already composited over `bg-100`: the xterm search only accepts `#RRGGBB`.
    selectionBackground: '#1f324f',
    black: '#1c1928',
    red: '#ff7b5c',
    green: '#6fe3a1',
    yellow: '#f5c451',
    blue: '#7cb7ff',
    magenta: ansiMagenta,
    cyan: '#5ee6d0',
    white: '#d6d2e4',
    brightBlack: '#857f9e',
    brightRed: '#ff9d85',
    brightGreen: '#9cf0c0',
    brightYellow: '#ffd98a',
    brightBlue: '#a6cdff',
    brightMagenta: '#d3a8ff',
    brightCyan: '#93f0e2',
    brightWhite: '#ffffff'
  },
  editor: walphEditorTheme('dark')
}

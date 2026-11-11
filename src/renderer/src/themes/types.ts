// Theme contract: UI CSS tokens + terminal palette + CodeMirror extension. Each theme lives in its own file
// (`walphDark.ts`, `walphLight.ts`) and is registered in `index.ts`. The names follow the Walph design system
// (tokens.json): `bg-*` layers, `ink*` text, `accent*` light, status and the syntax/editor palettes.
import type { Extension } from '@codemirror/state'
import type { ITheme } from '@xterm/xterm'

/** Every color token of `:root` (without the `--`). A theme must define all of them: the type below enforces it. */
export const THEME_TOKENS = [
  // Depth layers, from the bottom up: window/bars, editor/terminal, sidebar/panels, elevated, hover.
  'bg-000',
  'bg-100',
  'bg-200',
  'bg-300',
  'bg-400',
  'line',
  'line-strong',
  'ink',
  'ink-muted',
  'ink-faint',
  'accent',
  'accent-strong',
  'accent-soft',
  'accent-glow',
  'accent-2',
  'accent-3',
  'on-accent',
  'focus-ring',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
  'syn-keyword',
  'syn-function',
  'syn-type',
  'syn-string',
  'syn-number',
  'syn-constant',
  'syn-property',
  'syn-tag',
  'syn-variable',
  'syn-operator',
  'syn-comment',
  'syn-parameter',
  'editor-line-active',
  'editor-selection',
  'editor-match',
  'editor-gutter',
  'editor-gutter-active',
  'editor-indent-guide',
  'editor-highlight-text',
  'editor-highlight-read',
  'editor-highlight-write',
  'editor-inlay-hint',
  'editor-inlay-hint-bg',
  'diagnostic-error',
  'diagnostic-warning',
  'diagnostic-info',
  'diagnostic-hint',
  'git-modified',
  'git-added',
  'git-untracked',
  'git-deleted',
  'git-conflict',
  'git-renamed',
  'git-gutter-added',
  'git-gutter-modified',
  'git-gutter-deleted',
  'diff-inserted',
  'diff-deleted',
  'scrim',
  'shadow-pop',
  'shadow-glow',
  'shadow-neon'
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

export interface Theme {
  /** Name shown and stored in `workbench.theme`. */
  name: string
  kind: 'dark' | 'light'
  colors: Record<ThemeToken, string>
  terminal: ITheme
  /** CodeMirror theme + syntax highlighting (the common structural part lives in `components/editor/setup.ts`). */
  editor: Extension
}

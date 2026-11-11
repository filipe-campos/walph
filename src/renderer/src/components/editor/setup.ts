import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import { t } from '@shared/i18n'
import { findExtension } from './findPanel'
import { completionIcon } from './lspCompletion'
import { minimapExtension } from './minimap'
import { renderWhitespaceExtension, type RenderWhitespace } from './renderWhitespace'
import { stickyScroll } from './stickyScroll'
import { viewEvents } from './viewEvents'

/**
 * Equivalent to the `basicSetup` of the `codemirror` package (same composition), without `lintKeymap`: it binds
 * Mod-Shift-m to
 * CodeMirror's lint panel, the shortcut of our "Problems" (`view.problems`). A CodeMirror binding that acts does
 * `preventDefault` on keydown and, on Windows/Linux, Electron only runs the menu accelerator for what the renderer did
 * not
 * handle. From lint only F8 / Shift-F8 (next/previous diagnostic) stay, which do not collide with any app shortcut.
 */
function createBaseSetup(withHistory: boolean): Extension {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    withHistory ? history() : [],
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ icons: false, addToOptions: [completionIcon] }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    // Before the keymap: the own find Mod-f wins over the `searchKeymap` one.
    findExtension,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...(withHistory ? historyKeymap : []),
      ...foldKeymap,
      ...completionKeymap,
      { key: 'F8', run: nextDiagnostic, preventDefault: true },
      { key: 'Shift-F8', run: previousDiagnostic, preventDefault: true }
    ])
  ]
}

export const baseSetup: Extension = createBaseSetup(true)

/**
 * The same, without history: it is what the mirror copy of a tab shown in several groups uses. There is a single undo,
 * the canonical copy's; `groupViews.ts` binds the copy's Mod-z/Mod-y to it.
 */
export const mirrorSetup: Extension = createBaseSetup(false)

/** Compartment of the CodeMirror built-in interface texts: changing the language reconfigures it in each state. */
export const phrasesCompartment = new Compartment()

/** `EditorState.phrases` in the current language (keys = English texts used by the CodeMirror packages). */
export function editorPhrases(): Extension {
  const p = t().editor.phrases
  return EditorState.phrases.of({
    'Go to line': p.goToLine,
    go: p.go,
    Find: p.find,
    Replace: p.replace,
    next: p.next,
    previous: p.previous,
    all: p.all,
    'match case': p.matchCase,
    regexp: p.regexp,
    'by word': p.byWord,
    replace: p.replaceOne,
    'replace all': p.replaceAll,
    close: p.close,
    'current match': p.currentMatch,
    'on line': p.onLine,
    'replaced match on line $': p.replacedMatchOnLine,
    'replaced $ matches': p.replacedMatches,
    'Fold line': p.foldLine,
    'Unfold line': p.unfoldLine,
    'Folded lines': p.foldedLines,
    'Unfolded lines': p.unfoldedLines,
    to: p.to,
    'folded code': p.foldedCode,
    unfold: p.unfold,
    Diagnostics: p.diagnostics,
    'No diagnostics': p.noDiagnostics,
    Completions: p.completions,
    'Control character': p.controlCharacter,
    'Selection deleted': p.selectionDeleted,
    '$ unchanged lines': p.unchangedLines,
    Accept: p.accept,
    Reject: p.reject,
    'Revert this chunk': p.revertChunk
  })
}

/**
 * Theme compartment (colors + highlighting): changing the theme is reconfiguring it in each state, recreating nothing.
 */
export const themeCompartment = new Compartment()

/**
 * Structural part, common to every theme. Font and size come from CSS variables (`--editor-font-*`, written from
 * the settings), so changing `editor.fontSize` applies to every tab without touching the states.
 */
export const editorBase: Extension = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--editor-font-size, 13px)' },
  '.cm-scroller': { fontFamily: 'var(--editor-font-family, var(--font-mono))', lineHeight: '1.5' },
  '&.cm-focused': { outline: 'none' }
})

export interface EditorViewConfig {
  wordWrap: boolean
  lineNumbers: boolean
  minimap: boolean
  renderWhitespace: RenderWhitespace
  /** Max sticky scroll pinned lines; 0 = off. */
  stickyScroll: number
}

// `baseSetup` brings a fixed `lineNumbers()`; hiding the column avoids reconfiguring it. The fold gutter stays visible,
// as in VS Code.
const hideLineNumbers = EditorView.theme({ '.cm-lineNumbers': { display: 'none !important' } })

/**
 * Extension that depends on the settings (`editor.wordWrap`, `editor.lineNumbers`, `editor.minimap`,
 * `editor.renderWhitespace`, `editor.stickyScroll.*`). It also carries `viewEvents`, which every copy of the state
 * (owner or
 * mirror) needs.
 */
export function editorConfigExtension(config: EditorViewConfig): Extension {
  return [
    config.wordWrap ? EditorView.lineWrapping : [],
    config.lineNumbers ? [] : hideLineNumbers,
    config.minimap ? minimapExtension : [],
    renderWhitespaceExtension(config.renderWhitespace),
    config.stickyScroll > 0 ? stickyScroll(config.stickyScroll) : [],
    viewEvents
  ]
}

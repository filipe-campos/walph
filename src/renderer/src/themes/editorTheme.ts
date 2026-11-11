// CodeMirror theme generated from the design system tokens (`syn-*`, `editor-*`, `bg-*` layers): the colors are CSS
// variables, so the same theme serves Walph Dark and Walph Light (only the token values change). Never write hex here.
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { markdownMark } from '../lib/markdownMark'

const v = (token: string): string => `var(--${token})`

const highlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.self],
    color: v('syn-keyword')
  },
  {
    tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)],
    color: v('syn-function')
  },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: v('syn-type') },
  { tag: [t.string, t.special(t.string), t.url, t.character, t.attributeValue], color: v('syn-string') },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: v('syn-number') },
  { tag: [t.constant(t.name), t.standard(t.name), t.regexp, t.escape, t.labelName], color: v('syn-constant') },
  { tag: [t.propertyName, t.definition(t.propertyName), t.attributeName], color: v('syn-property') },
  { tag: [t.tagName, t.special(t.tagName)], color: v('syn-tag') },
  { tag: [t.variableName, t.definition(t.variableName), t.name], color: v('syn-variable') },
  {
    tag: [t.operator, t.punctuation, t.separator, t.bracket, t.angleBracket, t.derefOperator, t.meta],
    color: v('syn-operator')
  },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: v('syn-comment'), fontStyle: 'italic' },
  // Markdown: the specific rules come after the generic ones (the last match wins on repeated properties).
  { tag: t.heading, color: v('syn-keyword'), fontWeight: '700' },
  { tag: t.emphasis, color: v('syn-tag'), fontStyle: 'italic' },
  // The bundled JetBrains Mono has no 600: 700 is the real bold weight.
  { tag: t.strong, color: v('syn-constant'), fontWeight: '700' },
  { tag: t.strikethrough, color: v('syn-comment'), textDecoration: 'line-through' },
  { tag: t.link, color: v('syn-function'), textDecoration: 'underline' },
  { tag: markdownMark, color: v('syn-operator') },
  { tag: t.monospace, color: v('syn-string') },
  { tag: t.quote, color: v('syn-comment'), fontStyle: 'italic' },
  { tag: t.contentSeparator, color: v('syn-operator') },
  { tag: t.invalid, color: v('danger') }
])

function chrome(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': { color: v('syn-variable'), backgroundColor: v('bg-100') },
      '.cm-content': { caretColor: v('accent') },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('accent'), borderLeftWidth: '2px' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: v('editor-selection') },
      // `*`: the string highlight may sit inside the mark and must not override the color.
      '.cm-yaml-number, .cm-yaml-number *': { color: v('syn-number') },
      '.cm-yaml-atom, .cm-yaml-atom *': { color: v('syn-keyword') },
      '.cm-selectionMatch': { backgroundColor: v('editor-match') },
      '.cm-searchMatch': { backgroundColor: v('editor-match'), outline: `1px solid ${v('warning')}` },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: v('editor-selection') },
      '.cm-activeLine': { backgroundColor: v('editor-line-active') },
      '.cm-activeLineGutter': { backgroundColor: v('editor-line-active'), color: v('editor-gutter-active') },
      '.cm-gutters': { backgroundColor: v('bg-100'), color: v('editor-gutter'), border: 'none' },
      '&.cm-focused .cm-matchingBracket': {
        backgroundColor: v('accent-soft'),
        outline: `1px solid ${v('line-strong')}`
      },
      '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: v('danger-soft') },
      '.cm-foldPlaceholder': { backgroundColor: v('bg-300'), border: 'none', color: v('ink-muted') },
      '.cm-tooltip': {
        backgroundColor: v('bg-300'),
        color: v('ink'),
        border: `1px solid ${v('line')}`,
        borderRadius: '6px',
        boxShadow: v('shadow-pop')
      },
      '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: 'transparent', borderBottomColor: 'transparent' },
      '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: v('bg-300'), borderBottomColor: v('bg-300') },
      '.cm-tooltip-autocomplete': { padding: '4px' },
      '.cm-tooltip-autocomplete > ul > li': { borderRadius: '4px', padding: '1px 6px !important' },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: v('bg-400'), color: v('ink') },
      '.cm-completionMatchedText': { textDecoration: 'none', color: v('accent-strong'), fontWeight: '600' },
      '.cm-panels': { backgroundColor: v('bg-200'), color: v('ink') },
      '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${v('line')}` },
      '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${v('line')}` },
      '.cm-textfield': {
        backgroundColor: v('bg-100'),
        border: `1px solid ${v('line-strong')}`,
        borderRadius: '4px',
        color: v('ink')
      },
      '.cm-textfield:focus': { borderColor: v('accent'), outline: 'none' },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: v('bg-300'),
        border: `1px solid ${v('line-strong')}`,
        borderRadius: '4px',
        color: v('ink')
      },
      '.cm-button:hover': { backgroundColor: v('bg-400') },
      // Diff (@codemirror/merge): lines tinted with the status tones, changed segments stronger.
      '.cm-insertedLine, &.cm-merge-b .cm-changedLine': { backgroundColor: v('diff-inserted') },
      '.cm-deletedLine, &.cm-merge-a .cm-changedLine, .cm-deletedChunk': { backgroundColor: v('diff-deleted') },
      '&.cm-merge-b .cm-changedText': { background: v('diff-inserted') },
      '&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText': { background: v('diff-deleted') }
    },
    { dark }
  )
}

/** Editor extension of a theme: chrome + highlighting, both read from the tokens. */
export function walphEditorTheme(kind: 'dark' | 'light'): Extension {
  return [chrome(kind === 'dark'), syntaxHighlighting(highlight)]
}

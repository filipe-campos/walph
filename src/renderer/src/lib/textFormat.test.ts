import { describe, expect, it } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import {
  detectEol,
  detectIndent,
  fallbackIndent,
  formatIndent,
  formatOptions,
  refreshFallbackIndent,
  reindentEdits,
  reindentWhitespace,
  resolveIndent,
  serializeDoc,
  splitLines,
  type Indent
} from './textFormat'

const docOf = (text: string): Text => Text.of(splitLines(text))

describe('detectEol', () => {
  it('detects LF and CRLF', () => {
    expect(detectEol('a\nb\nc')).toBe('LF')
    expect(detectEol('a\r\nb\r\nc\r\n')).toBe('CRLF')
  })
  it('uses the majority in mixed files', () => {
    expect(detectEol('a\r\nb\r\nc\nd')).toBe('CRLF')
    expect(detectEol('a\nb\nc\r\nd')).toBe('LF')
  })
  it('a tie and the absence of breaks become LF', () => {
    expect(detectEol('a\r\nb\nc')).toBe('LF')
    expect(detectEol('no break')).toBe('LF')
    expect(detectEol('')).toBe('LF')
  })
})

describe('serializeDoc', () => {
  it('returns a CRLF file identical byte for byte', () => {
    const text = 'line 1\r\nline 2\r\n\r\nend\r\n'
    expect(serializeDoc(docOf(text), detectEol(text))).toBe(text)
  })
  it('keeps LF and the absence of a final newline', () => {
    expect(serializeDoc(docOf('a\nb'), 'LF')).toBe('a\nb')
    expect(serializeDoc(docOf('a\nb\n'), 'LF')).toBe('a\nb\n')
    expect(serializeDoc(docOf('just one line'), 'LF')).toBe('just one line')
  })
  it('applies the chosen EOL to a mixed file', () => {
    expect(serializeDoc(docOf('a\r\nb\nc'), 'CRLF')).toBe('a\r\nb\r\nc')
    expect(serializeDoc(docOf('a\r\nb\r\nc\nd'), 'LF')).toBe('a\nb\nc\nd')
  })
})

describe('detectIndent', () => {
  it('detects tabs', () => {
    expect(detectIndent('function f() {\n\tif (x) {\n\t\ty()\n\t}\n}')).toEqual({ kind: 'tabs' })
  })
  it('detects 4 spaces', () => {
    expect(detectIndent('def f():\n    if x:\n        y()\n    z()\n')).toEqual({ kind: 'spaces', size: 4 })
  })
  it('detects 2 spaces', () => {
    expect(detectIndent('a:\n  b:\n    c: 1\n  d: 2\n')).toEqual({ kind: 'spaces', size: 2 })
  })
  it('uses 2 spaces without evidence', () => {
    expect(detectIndent('')).toEqual({ kind: 'spaces', size: 2 })
    expect(detectIndent('one\nno\nindent')).toEqual({ kind: 'spaces', size: 2 })
  })
  it('works with CRLF and ignores blank lines', () => {
    expect(detectIndent('a {\r\n\r\n    b\r\n\r\n    c\r\n}')).toEqual({ kind: 'spaces', size: 4 })
  })
  it('ignores the continuation of block comments', () => {
    expect(detectIndent('/**\n * doc\n */\nfunction f() {\n    x()\n}')).toEqual({ kind: 'spaces', size: 4 })
  })
})

describe('formatIndent', () => {
  it('formats for the status bar', () => {
    expect(formatIndent({ kind: 'tabs' })).toBe('Tabs')
    expect(formatIndent({ kind: 'spaces', size: 4 })).toBe('Espaços: 4')
  })
})

describe('load and save cycle with the EditorState (as the CodeEditor does)', () => {
  // CodeMirror normalizes any line break to \n in the document; the original EOL is kept apart.
  const roundTrip = (text: string): string => {
    const state = EditorState.create({ doc: text })
    return serializeDoc(state.doc, detectEol(text))
  }

  it('a CRLF file stays CRLF, byte for byte, after saving', () => {
    const text = 'one\r\ntwo\r\n\r\nthree ação 😀\r\n'
    const state = EditorState.create({ doc: text })
    expect(state.doc.toString()).not.toContain('\r')
    expect(roundTrip(text)).toBe(text)
  })
  it('a CRLF file without a final newline stays the same', () => {
    expect(roundTrip('a\r\nb')).toBe('a\r\nb')
  })
  it('an LF file stays LF', () => {
    const text = 'one\ntwo\n\nthree\n'
    expect(roundTrip(text)).toBe(text)
    expect(roundTrip(text)).not.toContain('\r')
  })
  it('a mixed file is saved with the majority EOL', () => {
    expect(roundTrip('a\r\nb\r\nc\nd')).toBe('a\r\nb\r\nc\r\nd')
    expect(roundTrip('a\nb\nc\r\nd')).toBe('a\nb\nc\nd')
  })
  it('an edit in a CRLF file keeps CRLF on the new lines', () => {
    const text = 'a\r\nb\r\n'
    const state = EditorState.create({ doc: text })
    const next = state.update({ changes: { from: 1, insert: '\nnova' } }).state
    expect(serializeDoc(next.doc, 'CRLF')).toBe('a\r\nnova\r\nb\r\n')
  })
  it('an empty file stays empty', () => {
    expect(roundTrip('')).toBe('')
  })
})

describe('detectEol with edge cases', () => {
  it('a lone \r counts neither as CRLF nor as LF', () => {
    expect(detectEol('a\rb\rc')).toBe('LF')
    expect(detectEol('a\rb\r\nc')).toBe('CRLF')
  })
  it('\n right at the start counts as LF', () => {
    expect(detectEol('\nabc\r\n')).toBe('LF')
  })
})

describe('detectIndent with more cases', () => {
  it('prefers tabs only when they are the majority', () => {
    expect(detectIndent('a\n\tb\n    c\n    d\n')).toEqual({ kind: 'spaces', size: 4 })
  })
  it('detects 8 spaces', () => {
    expect(detectIndent('a\n        b\n        c\n')).toEqual({ kind: 'spaces', size: 8 })
  })
})

describe('configurable default indentation', () => {
  it('without evidence, uses the received fallback', () => {
    expect(detectIndent('abc\ndef\n', { kind: 'spaces', size: 4 })).toEqual({ kind: 'spaces', size: 4 })
    expect(detectIndent('abc\n', { kind: 'tabs' })).toEqual({ kind: 'tabs' })
  })
  it('the detected indentation wins over the fallback', () => {
    expect(detectIndent('a:\n  b: 1\n  c: 2\n', { kind: 'tabs' })).toEqual({ kind: 'spaces', size: 2 })
  })
  it('fallbackIndent translates insertSpaces/tabSize', () => {
    expect(fallbackIndent(true, 4)).toEqual({ kind: 'spaces', size: 4 })
    expect(fallbackIndent(false, 4)).toEqual({ kind: 'tabs' })
  })
})

describe('resolveIndent', () => {
  const fb: Indent = { kind: 'spaces', size: 2 }
  it('a detected indentation is not a fallback', () => {
    expect(resolveIndent('a\n    b\n', fb)).toEqual({ indent: { kind: 'spaces', size: 4 }, fallback: false })
    expect(resolveIndent('a\n\tb\n', fb)).toEqual({ indent: { kind: 'tabs' }, fallback: false })
  })
  it('without evidence uses the fallback and flags it', () => {
    expect(resolveIndent('no indent\nlines\n', fb)).toEqual({ indent: fb, fallback: true })
    expect(resolveIndent('', { kind: 'tabs' })).toEqual({ indent: { kind: 'tabs' }, fallback: true })
  })
})

describe('refreshFallbackIndent', () => {
  const tab = (indent: Indent | null, indentFallback: boolean) => ({ indent, indentFallback })
  it('replaces only the already loaded fallback tab', () => {
    expect(refreshFallbackIndent(tab({ kind: 'spaces', size: 2 }, true), { kind: 'tabs' })).toEqual(
      tab({ kind: 'tabs' }, true)
    )
    const detected = tab({ kind: 'spaces', size: 4 }, false)
    expect(refreshFallbackIndent(detected, { kind: 'tabs' })).toBe(detected)
    const unloaded = tab(null, true)
    expect(refreshFallbackIndent(unloaded, { kind: 'tabs' })).toBe(unloaded)
  })
  it('returns the same tab when the indentation is equal', () => {
    const same = tab({ kind: 'spaces', size: 2 }, true)
    expect(refreshFallbackIndent(same, { kind: 'spaces', size: 2 })).toBe(same)
    const tabs = tab({ kind: 'tabs' }, true)
    expect(refreshFallbackIndent(tabs, { kind: 'tabs' })).toBe(tabs)
  })
})

describe('formatOptions', () => {
  it('uses the indent size with spaces', () => {
    expect(formatOptions({ kind: 'spaces', size: 4 }, 2)).toEqual({ tabSize: 4, insertSpaces: true })
  })

  it('uses the configured tab width with tabs', () => {
    expect(formatOptions({ kind: 'tabs' }, 8)).toEqual({ tabSize: 8, insertSpaces: false })
  })
})

describe('reindentWhitespace', () => {
  it('tabs to spaces respecting the tab stop', () => {
    expect(reindentWhitespace('\t', 'spaces', 4)).toBe('    ')
    expect(reindentWhitespace('\t\t', 'spaces', 2)).toBe('    ')
    expect(reindentWhitespace('  \t', 'spaces', 4)).toBe('    ')
  })
  it('spaces to tabs, the remainder stays as spaces', () => {
    expect(reindentWhitespace('        ', 'tabs', 4)).toBe('\t\t')
    expect(reindentWhitespace('      ', 'tabs', 4)).toBe('\t  ')
  })
})

describe('reindentEdits', () => {
  it('converts only the leading indentation, in text offsets', () => {
    const text = 'a\n\tb\n\t\tc \td\n'
    const edits = reindentEdits(text, 'spaces', 2)
    expect(edits).toEqual([
      { from: 2, to: 3, insert: '  ' },
      { from: 5, to: 7, insert: '    ' }
    ])
  })
  it('a line already in the format produces no edit', () => {
    expect(reindentEdits('    a\nb', 'spaces', 4)).toEqual([])
    expect(reindentEdits('\ta', 'tabs', 4)).toEqual([])
  })
  it('spaces to tabs', () => {
    expect(reindentEdits('x\n    y', 'tabs', 4)).toEqual([{ from: 2, to: 6, insert: '\t' }])
  })
})

import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import type { LspTextEdit } from '@shared/types'
import { detectEol, serializeDoc, splitLines } from './textFormat'
import { applyLspEditsToText, applyOffsetEdits, lspEditsToOffsetEdits } from './workspaceEdit'

const edit = (sl: number, sc: number, el: number, ec: number, newText: string): LspTextEdit => ({
  range: { start: { line: sl, character: sc }, end: { line: el, character: ec } },
  newText
})

describe('lspEditsToOffsetEdits', () => {
  const doc = Text.of(['const foo = 1', 'foo()', 'bar(foo)'])

  it('converts and sorts out-of-order edits', () => {
    const edits = lspEditsToOffsetEdits(doc, [
      edit(2, 4, 2, 7, 'baz'),
      edit(0, 6, 0, 9, 'baz'),
      edit(1, 0, 1, 3, 'baz')
    ])
    expect(edits).toEqual([
      { from: 6, to: 9, insert: 'baz' },
      { from: 14, to: 17, insert: 'baz' },
      { from: 24, to: 27, insert: 'baz' }
    ])
  })

  it('keeps the array order for insertions at the same position', () => {
    const edits = lspEditsToOffsetEdits(doc, [edit(0, 0, 0, 0, 'a\n'), edit(0, 0, 0, 0, 'b\n')])
    expect(edits.map((e) => e.insert)).toEqual(['a\n', 'b\n'])
  })

  it('puts the insertion before a replacement that starts at the same point', () => {
    const edits = lspEditsToOffsetEdits(doc, [edit(0, 0, 0, 5, 'let'), edit(0, 0, 0, 0, '// x\n')])
    expect(edits.map((e) => e.insert)).toEqual(['// x\n', 'let'])
  })

  it('rejects overlapping edits', () => {
    expect(() => lspEditsToOffsetEdits(doc, [edit(0, 0, 0, 8, 'x'), edit(0, 6, 0, 9, 'y')])).toThrow(/sobrep/)
  })

  it('accepts adjacent edits', () => {
    expect(() => lspEditsToOffsetEdits(doc, [edit(0, 0, 0, 5, 'x'), edit(0, 5, 0, 6, 'y')])).not.toThrow()
  })

  it('clamps positions outside the document', () => {
    const edits = lspEditsToOffsetEdits(doc, [edit(9, 0, 9, 0, 'fim')])
    expect(edits).toEqual([{ from: doc.length, to: doc.length, insert: 'fim' }])
  })
})

describe('applyOffsetEdits', () => {
  it('applies several edits to the same file without shifting the following ones', () => {
    const text = 'foo foo foo'
    const result = applyOffsetEdits(text, [
      { from: 0, to: 3, insert: 'quux' },
      { from: 4, to: 7, insert: 'q' },
      { from: 8, to: 11, insert: 'quuuux' }
    ])
    expect(result).toBe('quux q quuuux')
  })

  it('does not depend on the order the edits arrive in', () => {
    const text = 'abcdef'
    const a = { from: 0, to: 1, insert: 'XX' }
    const b = { from: 4, to: 6, insert: '' }
    expect(applyOffsetEdits(text, [b, a])).toBe(applyOffsetEdits(text, [a, b]))
    expect(applyOffsetEdits(text, [a, b])).toBe('XXbcd')
  })

  it('keeps the order of insertions at the same point', () => {
    expect(
      applyOffsetEdits('x', [
        { from: 0, to: 0, insert: 'a' },
        { from: 0, to: 0, insert: 'b' }
      ])
    ).toBe('abx')
  })
})

describe('applyLspEditsToText', () => {
  it('renames all occurrences of a file', () => {
    const text = 'export function foo() {}\nfoo()\nconst x = foo\n'
    const result = applyLspEditsToText(text, [
      edit(2, 10, 2, 13, 'bar'),
      edit(0, 16, 0, 19, 'bar'),
      edit(1, 0, 1, 3, 'bar')
    ])
    expect(result).toBe('export function bar() {}\nbar()\nconst x = bar\n')
  })

  it('normalizes CRLF to \\n before applying', () => {
    const result = applyLspEditsToText('a\r\nfoo\r\n', [edit(1, 0, 1, 3, 'bar')])
    expect(result).toBe('a\nbar\n')
  })

  it('inserts imports at the top along with an edit further down', () => {
    const result = applyLspEditsToText('use()\n', [
      edit(0, 0, 0, 0, "import { x } from 'x'\n"),
      edit(0, 0, 0, 3, 'run')
    ])
    expect(result).toBe("import { x } from 'x'\nrun()\n")
  })
})

describe('WorkspaceEdit on files with CRLF', () => {
  // Same composition as `applyWorkspaceEdit` for files on disk: reads, edits, rewrites with the original EOL.
  const applyKeepingEol = (text: string, edits: LspTextEdit[]): string => {
    const doc = Text.of(splitLines(text))
    const next = applyOffsetEdits(doc.toString(), lspEditsToOffsetEdits(doc, edits))
    return serializeDoc(Text.of(splitLines(next)), detectEol(text))
  }

  it('keeps CRLF on all lines after several out-of-order edits', () => {
    const text = 'export function foo() {}\r\nfoo()\r\nconst x = foo\r\n'
    const result = applyKeepingEol(text, [
      edit(2, 10, 2, 13, 'bar'),
      edit(0, 16, 0, 19, 'bar'),
      edit(1, 0, 1, 3, 'bar')
    ])
    expect(result).toBe('export function bar() {}\r\nbar()\r\nconst x = bar\r\n')
  })

  it('an edit that crosses a CRLF break does not leave a stray \\r', () => {
    const result = applyKeepingEol('a\r\nb\r\nc\r\n', [edit(0, 1, 1, 0, ' ')])
    expect(result).toBe('a b\r\nc\r\n')
  })

  it('newText with \\n becomes CRLF on rewrite', () => {
    expect(applyKeepingEol('a\r\nb\r\n', [edit(0, 0, 0, 0, 'import x\n')])).toBe('import x\r\na\r\nb\r\n')
  })
})

describe('WorkspaceEdit with surrogate pairs', () => {
  it('treats the emoji as 2 UTF-16 units in the LSP positions', () => {
    // "😀" takes columns 0-1; "foo" starts at column 3.
    expect(applyLspEditsToText('😀 foo\n', [edit(0, 3, 0, 6, 'bar')])).toBe('😀 bar\n')
  })

  it('replaces the pair itself whole and several edits on the same line', () => {
    const result = applyLspEditsToText('a😀b😀c', [edit(0, 4, 0, 6, 'Y'), edit(0, 1, 0, 3, 'X')])
    expect(result).toBe('aXbYc')
  })

  it('a position in the middle of a pair does not cut the pair in half', () => {
    const doc = Text.of(['😀x'])
    const [only] = lspEditsToOffsetEdits(doc, [edit(0, 1, 0, 1, 'i')])
    expect([0, 2]).toContain(only.from)
    expect(applyOffsetEdits('😀x', [only])).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/)
  })
})

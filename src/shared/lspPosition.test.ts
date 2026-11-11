import { describe, expect, it } from 'vitest'
import { ChangeSet, EditorState, Text } from '@codemirror/state'
import type { LspTextChange } from './types'
import { changesToLsp, lspPositionToOffset, lspRangeToOffsets, offsetToLspPosition, rangeToReveal } from './lspPosition'

const doc = (text: string): Text => Text.of(text.split('\n'))

/** Applies the changes like an LSP server: in sequence, each on the text resulting from the previous one. */
function applyLsp(text: string, changes: LspTextChange[]): string {
  let current = text
  for (const change of changes) {
    const d = doc(current)
    const from = lspPositionToOffset(d, change.range.start)
    const to = lspPositionToOffset(d, change.range.end)
    current = current.slice(0, from) + change.text + current.slice(to)
  }
  return current
}

describe('offsetToLspPosition', () => {
  it('converts to line and column from 0', () => {
    const d = doc('abc\ndef\n\nxyz')
    expect(offsetToLspPosition(d, 0)).toEqual({ line: 0, character: 0 })
    expect(offsetToLspPosition(d, 3)).toEqual({ line: 0, character: 3 })
    expect(offsetToLspPosition(d, 4)).toEqual({ line: 1, character: 0 })
    expect(offsetToLspPosition(d, 8)).toEqual({ line: 2, character: 0 })
    expect(offsetToLspPosition(d, d.length)).toEqual({ line: 3, character: 3 })
  })

  it('clamps offsets outside the document', () => {
    const d = doc('ab\ncd')
    expect(offsetToLspPosition(d, -5)).toEqual({ line: 0, character: 0 })
    expect(offsetToLspPosition(d, 999)).toEqual({ line: 1, character: 2 })
  })

  it('counts an emoji (surrogate pair) as 2 UTF-16 units, like LSP', () => {
    const d = doc('a😀b')
    expect(offsetToLspPosition(d, 3)).toEqual({ line: 0, character: 3 })
    expect(offsetToLspPosition(d, 4)).toEqual({ line: 0, character: 4 })
  })

  it('counts CJK characters (BMP) as 1 unit', () => {
    const d = doc('日本語\nテスト')
    expect(offsetToLspPosition(d, 2)).toEqual({ line: 0, character: 2 })
    expect(offsetToLspPosition(d, 5)).toEqual({ line: 1, character: 1 })
  })
})

describe('lspPositionToOffset', () => {
  it('is the inverse of offsetToLspPosition', () => {
    const d = doc('const x = 1\n\n  return "😀日本"\nend')
    for (let offset = 0; offset <= d.length; offset++) {
      const pos = offsetToLspPosition(d, offset)
      const back = lspPositionToOffset(d, pos)
      // In the middle of a surrogate pair it moves back to its start; otherwise the round trip is exact.
      const text = d.toString()
      const insidePair = offset > 0 && /[\ud800-\udbff]/.test(text[offset - 1]) && /[\udc00-\udfff]/.test(text[offset])
      expect(back).toBe(insidePair ? offset - 1 : offset)
    }
  })

  it('a line past the end means the end of the document', () => {
    const d = doc('ab\ncd')
    expect(lspPositionToOffset(d, { line: 2, character: 0 })).toBe(5)
    expect(lspPositionToOffset(d, { line: 99, character: 3 })).toBe(5)
  })

  it('a character past the end of the line means the end of the line', () => {
    const d = doc('ab\ncd')
    expect(lspPositionToOffset(d, { line: 0, character: 50 })).toBe(2)
    expect(lspPositionToOffset(d, { line: 1, character: 50 })).toBe(5)
  })

  it('negative or invalid values become 0', () => {
    const d = doc('ab\ncd')
    expect(lspPositionToOffset(d, { line: -1, character: 4 })).toBe(0)
    expect(lspPositionToOffset(d, { line: 1, character: -3 })).toBe(3)
    expect(lspPositionToOffset(d, { line: Number.NaN, character: 0 })).toBe(0)
  })

  it('empty document', () => {
    const d = doc('')
    expect(lspPositionToOffset(d, { line: 0, character: 0 })).toBe(0)
    expect(lspPositionToOffset(d, { line: 3, character: 3 })).toBe(0)
    expect(offsetToLspPosition(d, 0)).toEqual({ line: 0, character: 0 })
  })

  it('does not cut a surrogate pair: moves back or forward according to the bias', () => {
    const d = doc('a😀b') // a=0, 😀=1..3, b=3
    expect(lspPositionToOffset(d, { line: 0, character: 2 })).toBe(1)
    expect(lspPositionToOffset(d, { line: 0, character: 2 }, 1)).toBe(3)
    // Outside the middle of the pair nothing changes.
    expect(lspPositionToOffset(d, { line: 0, character: 1 }, 1)).toBe(1)
    expect(lspPositionToOffset(d, { line: 0, character: 3 }, -1)).toBe(3)
  })

  it('surrogate pair at the end of the line, with a following line', () => {
    const d = doc('😀\nx')
    expect(lspPositionToOffset(d, { line: 0, character: 1 })).toBe(0)
    expect(lspPositionToOffset(d, { line: 0, character: 2 })).toBe(2)
    expect(lspPositionToOffset(d, { line: 1, character: 1 })).toBe(4)
  })
})

describe('lspRangeToOffsets', () => {
  it('converts a multi-line range', () => {
    const d = doc('abc\ndef\nghi')
    expect(lspRangeToOffsets(d, { start: { line: 0, character: 1 }, end: { line: 2, character: 2 } })).toEqual({
      from: 1,
      to: 10
    })
  })

  it('a range inside a surrogate pair covers the whole pair', () => {
    const d = doc('a😀b')
    expect(lspRangeToOffsets(d, { start: { line: 0, character: 2 }, end: { line: 0, character: 2 } })).toEqual({
      from: 1,
      to: 3
    })
  })

  it('end before start becomes an empty range', () => {
    const d = doc('abcdef')
    expect(lspRangeToOffsets(d, { start: { line: 0, character: 4 }, end: { line: 0, character: 1 } })).toEqual({
      from: 4,
      to: 4
    })
  })
})

describe('changesToLsp', () => {
  const state = (text: string): EditorState => EditorState.create({ doc: text })

  /** Applies the ChangeSet in CodeMirror and the LSP conversion to the text: the result must be the same. */
  function expectEquivalent(text: string, spec: Parameters<typeof ChangeSet.of>[0]): LspTextChange[] {
    const s = state(text)
    const changes = ChangeSet.of(spec, s.doc.length)
    const lsp = changesToLsp(s.doc, changes)
    expect(applyLsp(text, lsp)).toBe(changes.apply(s.doc).toString())
    return lsp
  }

  it('simple insertion', () => {
    const lsp = expectEquivalent('hello world', { from: 5, insert: ',' })
    expect(lsp).toEqual([{ range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } }, text: ',' }])
  })

  it('replacement and removal', () => {
    expectEquivalent('hello world', { from: 0, to: 5, insert: 'bye' })
    expectEquivalent('hello world', { from: 5, to: 11 })
  })

  it('insertion at the end of the document', () => {
    const lsp = expectEquivalent('abc\ndef', { from: 7, insert: '\nghi' })
    expect(lsp[0].range.start).toEqual({ line: 1, character: 3 })
    expect(lsp[0].text).toBe('\nghi')
  })

  it('insertion at the end of an empty document', () => {
    expectEquivalent('', { from: 0, insert: 'new\ntext' })
  })

  it('removal across lines', () => {
    const lsp = expectEquivalent('up\nfour\nfive\nseven', { from: 1, to: 14 })
    expect(lsp[0].range).toEqual({ start: { line: 0, character: 1 }, end: { line: 3, character: 1 } })
    expect(lsp[0].text).toBe('')
  })

  it('multiple cursors: changes come out in descending position order', () => {
    const lsp = expectEquivalent('aaa\nbbb\nccc', [
      { from: 0, insert: '1' },
      { from: 4, insert: '2' },
      { from: 8, insert: '3' }
    ])
    expect(lsp.map((c) => c.range.start.line)).toEqual([2, 1, 0])
    expect(lsp.map((c) => c.text)).toEqual(['3', '2', '1'])
  })

  it('several changes on the same line that change the length', () => {
    expectEquivalent('let a = 1; let b = 2', [
      { from: 4, to: 5, insert: 'alpha' },
      { from: 15, to: 16, insert: 'b' },
      { from: 19, to: 20, insert: '22222' }
    ])
  })

  it('adjacent changes (one ends where the other starts)', () => {
    expectEquivalent('abcdef', [
      { from: 0, to: 2, insert: 'X' },
      { from: 2, to: 4, insert: 'YYY' }
    ])
  })

  it('emoji and CJK before and after the change', () => {
    const lsp = expectEquivalent('😀 日本語 😀\nテスト 😀', [
      { from: 3, to: 6, insert: 'ABC' },
      { from: 12, insert: '🎉' }
    ])
    // 😀 (2) + space (1) = 3: the column counts UTF-16 units.
    expect(lsp[lsp.length - 1].range.start).toEqual({ line: 0, character: 3 })
  })

  it('changes composed from two transactions (type and delete)', () => {
    const s = state('abc')
    const first = ChangeSet.of({ from: 3, insert: 'dé😀' }, 3)
    const second = ChangeSet.of({ from: 1, to: 4 }, first.newLength)
    const composed = first.compose(second)
    const lsp = changesToLsp(s.doc, composed)
    expect(applyLsp('abc', lsp)).toBe(composed.apply(s.doc).toString())
  })

  it('no changes returns an empty list', () => {
    const s = state('abc')
    expect(changesToLsp(s.doc, ChangeSet.empty(3))).toEqual([])
  })
})

describe('rangeToReveal', () => {
  it('1-based line, 0-based column and length on a single line', () => {
    expect(rangeToReveal({ start: { line: 2, character: 4 }, end: { line: 2, character: 9 } })).toEqual({
      line: 3,
      column: 4,
      length: 5
    })
  })

  it('a multi-line span has no length', () => {
    expect(rangeToReveal({ start: { line: 0, character: 1 }, end: { line: 3, character: 2 } }).length).toBe(0)
  })

  it('end before start does not give a negative length', () => {
    expect(rangeToReveal({ start: { line: 1, character: 5 }, end: { line: 1, character: 2 } }).length).toBe(0)
  })
})

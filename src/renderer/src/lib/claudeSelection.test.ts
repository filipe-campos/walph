import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { MAX_SELECTION_CHARS, selectionOf } from './claudeSelection'

const doc = Text.of(['one', 'two', 'three', 'four'])

describe('selectionOf', () => {
  it('empty = null', () => {
    expect(selectionOf(doc, 2, 2, '/a.ts')).toBeNull()
  })
  it('inclusive lines from 1', () => {
    expect(selectionOf(doc, 1, 6, '/a.ts')).toEqual({ path: '/a.ts', startLine: 1, endLine: 2, text: 'ne\ntw' })
  })
  it('a selection that ends at the start of a line does not count that line', () => {
    // Whole 'one\n': ends at 4 (start of line 2).
    expect(selectionOf(doc, 0, 4, '/a.ts')).toMatchObject({ startLine: 1, endLine: 1 })
  })
  it('accepts an inverted selection and cuts huge text', () => {
    expect(selectionOf(doc, 6, 1, '/a.ts')).toMatchObject({ startLine: 1, endLine: 2 })
    const big = Text.of(['x'.repeat(MAX_SELECTION_CHARS + 100)])
    expect(selectionOf(big, 0, big.length, '/a.ts')!.text).toHaveLength(MAX_SELECTION_CHARS)
  })
})
